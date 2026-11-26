// The vault state machine: local-first, cloud-optional.
//
// One envelope per device. When signed in, the same envelope is uploaded so
// other devices can fetch and merge it; the server only ever holds ciphertext.
// Merging is per-record last-write-wins (see merge.ts), which is what lets two
// devices edit independently without a server-side merge.
import { toast } from 'vue-sonner'
import {
  CORRUPT,
  WRONG_PASSWORD,
  createEnvelope,
  decryptWithDek,
  exportDek,
  importDek,
  rewrapEnvelope,
  sealEnvelope,
  unlockEnvelope,
} from '~/lib/vault/crypto'
import { bySidebarOrder, emptyDoc, mergeDocs, normalizeDoc, now, uuid } from '~/lib/vault/merge'
import { deleteRemote, fetchRemote, pushRemote } from '~/lib/vault/remote'
import {
  clearLocalEnvelope,
  clearSessionDek,
  parseEnvelope,
  readLocalEnvelope,
  readSessionDek,
  writeLocalEnvelope,
  writeSessionDek,
} from '~/lib/vault/storage'
import { exportSpaceToml } from '~/lib/vault/toml'
import type { ParsedEntry } from '~/lib/vault/toml'
import { DEFAULT_SPACE_COLOR, DOC_VERSION, isHexColor, isVaultIcon } from '~/lib/vault/types'
import type { EntryKind, VaultDoc, VaultEnvelope, VaultEntry, VaultField, VaultRecordField, VaultRecordType, VaultSpace } from '~/lib/vault/types'

export const ALL_SPACES = 'all'
const SPACE_STORAGE = 'vault:space'
const SAVE_DEBOUNCE = 1500
const RETRY_DELAY = 30_000
const MIN_MASTER_LENGTH = 8

export interface EntryInput {
  title: string
  spaceId: string
  kind: EntryKind
  group: string
  tags: string[]
  fields: VaultField[]
  typeId?: string
  icon?: string
  color?: string
  notes: string
  url: string
}

export interface ImportOptions {
  spaceId: string
  mode: 'merge' | 'replace'
  // Parsed by the dialog, per file, so it can report which file failed.
  entries: ParsedEntry[]
}

export const useVaultStore = defineStore('vault', () => {
  const envelope = ref<VaultEnvelope | null>(null)
  const doc = ref<VaultDoc | null>(null)
  const status = ref<'idle' | 'empty' | 'locked' | 'unlocked'>('idle')
  const corrupt = ref(false)
  const remoteExists = ref(false)
  const remoteVersion = ref(0)
  const remoteEnvelope = ref<VaultEnvelope | null>(null)
  const pendingConflict = ref<'master' | 'merge' | null>(null)
  const syncState = ref<'idle' | 'saving' | 'offline' | 'error'>('idle')
  const lastSyncAt = ref('')
  const activeSpaceId = ref(ALL_SPACES)
  const query = ref('')
  const activeKind = ref<EntryKind | 'all'>('all')
  const activeTypeId = ref('')
  const activeTag = ref('')
  const sort = ref<'title' | 'updated'>('title')

  // The DEK must never be reactive (a Proxy around a CryptoKey breaks WebCrypto
  // calls) and must never persist outside this closure.
  let dek: CryptoKey | null = null
  let initPromise: Promise<void> | null = null
  let chain: Promise<void> = Promise.resolve()
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  let merging = false

  const signedIn = () => !!useAuthStore().accessToken

  const liveSpaces = computed(() => (doc.value?.spaces ?? []).filter((s) => !s.deletedAt))
  const liveEntries = computed(() => (doc.value?.entries ?? []).filter((e) => !e.deletedAt))
  const liveTypes = computed(() => (doc.value?.types ?? []).filter((t) => !t.deletedAt))
  // System presets the user switched off; tolerates a locked vault.
  const disabledPresets = computed(() => doc.value?.disabledPresets ?? [])

  const scopedEntries = computed(() => {
    const spaceId = activeSpaceId.value
    return spaceId === ALL_SPACES ? liveEntries.value : liveEntries.value.filter((e) => e.spaceId === spaceId)
  })

  const filteredEntries = computed(() => {
    const q = query.value.trim().toLowerCase()
    const kind = activeKind.value
    const typeId = activeTypeId.value
    const tag = activeTag.value
    let list = scopedEntries.value
    if (kind !== 'all') list = list.filter((e) => e.kind === kind)
    if (typeId) list = list.filter((e) => e.typeId === typeId)
    if (tag) list = list.filter((e) => e.tags.includes(tag))
    if (q) {
      list = list.filter((e) => {
        // Matching field values is deliberate: users search for the account or
        // host they half-remember, not just the entry title.
        if (e.title.toLowerCase().includes(q)) return true
        if (e.notes.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)) return true
        if (e.tags.some((t) => t.toLowerCase().includes(q))) return true
        return e.fields.some((f) => f.key.toLowerCase().includes(q) || f.value.toLowerCase().includes(q))
      })
    }
    return [...list].sort((a, b) =>
      sort.value === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    )
  })

  const allTags = computed(() => [...new Set(liveEntries.value.flatMap((e) => e.tags))].sort())

  const spaceCounts = computed(() => {
    const counts: Record<string, number> = {}
    for (const entry of liveEntries.value) counts[entry.spaceId] = (counts[entry.spaceId] ?? 0) + 1
    return counts
  })

  function persistSpan(id: string) {
    try {
      localStorage.setItem(SPACE_STORAGE, id)
    } catch {
      // A disabled localStorage only loses the last-used space.
    }
  }

  function requireDoc(): VaultDoc {
    if (!doc.value) throw new Error('vault:locked')
    return doc.value
  }

  function findSpace(id: string): VaultSpace {
    const space = liveSpaces.value.find((s) => s.id === id)
    if (!space) throw new Error('vault:space.missing')
    return space
  }

  function findEntry(id: string): VaultEntry {
    const entry = requireDoc().entries.find((e) => e.id === id)
    if (!entry) throw new Error('vault:entry.missing')
    return entry
  }

  async function writeLocal(env: VaultEnvelope) {
    try {
      await writeLocalEnvelope(JSON.stringify(env))
    } catch (err) {
      syncState.value = 'error'
      toast.error($t('err.vault.write'))
      throw err
    }
  }

  function clearTimers() {
    clearTimeout(saveTimer)
    clearTimeout(retryTimer)
    saveTimer = undefined
    retryTimer = undefined
  }

  /**
   * Serialize every persistence step. Two rapid edits must not interleave their
   * seal/write/upload pairs, or the older ciphertext can win.
   */
  function enqueue(task: () => Promise<void>): Promise<void> {
    chain = chain.then(task, task)
    return chain
  }

  function scheduleRetry() {
    if (retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      if (dirty && signedIn()) void $flush()
    }, RETRY_DELAY)
  }

  function hookOnline() {
    if (typeof window === 'undefined') return
    window.addEventListener('online', () => {
      if (dirty && signedIn()) void $flush()
    })
  }

  async function upload(): Promise<void> {
    if (!signedIn() || !envelope.value) return
    const blob = JSON.stringify(envelope.value)
    syncState.value = 'saving'
    try {
      const result = await pushRemote(blob, remoteExists.value ? remoteVersion.value : 0)
      if (result.conflict) {
        // Another device saved first: merge and push again instead of losing
        // either side.
        dirty = true
        await $mergeRemote()
        return
      }
      remoteExists.value = true
      remoteVersion.value = result.saved.version
      lastSyncAt.value = result.saved.updatedAt || now()
      syncState.value = 'idle'
      dirty = false
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message) {
        // Local validation (too large) is permanent; anything else is treated as
        // connectivity and retried.
        syncState.value = message === 'vault:too-large' ? 'error' : 'offline'
        if (message === 'vault:too-large') toast.error($t('err.vault.too.large'))
        else scheduleRetry()
      } else {
        syncState.value = 'offline'
        scheduleRetry()
      }
    }
  }

  function scheduleUpload() {
    dirty = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      void $flush()
    }, SAVE_DEBOUNCE)
  }

  /** Seal the current doc and write it locally, without touching the upload timer. */
  async function persistLocal(): Promise<void> {
    if (!doc.value || !envelope.value || !dek) return
    envelope.value = await sealEnvelope(envelope.value, doc.value, dek)
    await writeLocal(envelope.value)
  }

  /**
   * Write an upgraded document back once unlocked. A failure must not block
   * unlocking — writeLocal has already reported it — and the next save retries.
   */
  async function persistMigration(rawVersion: number): Promise<void> {
    if (rawVersion === DOC_VERSION) return
    try {
      await enqueue(async () => {
        if (!doc.value) return
        doc.value.updatedAt = now()
        await persistLocal()
      })
    } catch {
      // Reported by writeLocal (toast + syncState); the doc stays usable.
    }
  }

  /** Seal the doc, write it locally, and queue the cloud copy. */
  async function $save(): Promise<void> {
    return enqueue(async () => {
      if (!doc.value || !envelope.value || !dek) return
      doc.value.updatedAt = now()
      await persistLocal()
      if (signedIn()) {
        syncState.value = 'saving'
        scheduleUpload()
      }
    })
  }

  /** Upload immediately (the debounce timer would otherwise hold it back). */
  async function $flush(): Promise<void> {
    clearTimeout(saveTimer)
    saveTimer = undefined
    await enqueue(upload)
  }

  // Memoized so the three route middlewares can all call it: the first call
  // performs the work, the rest await the same promise.
  function $init(force = false): Promise<void> {
    if (!initPromise || force) initPromise = bootstrap()
    return initPromise
  }

  async function bootstrap(): Promise<void> {
    hookOnline()
    const raw = await readLocalEnvelope()
    const local = parseEnvelope(raw)
    // A stored envelope that no longer parses is reported, never thrown: the
    // unlock card offers "use cloud" or a reset from there.
    corrupt.value = !!raw && !local
    envelope.value = local

    if (signedIn()) {
      try {
        const remote = await fetchRemote()
        if (remote) {
          const env = parseEnvelope(remote.blob)
          remoteExists.value = !!env
          remoteVersion.value = remote.version
          remoteEnvelope.value = env
          // Adopt the cloud copy only when this device has nothing at all: a
          // corrupt local envelope stays visible to the user instead of being
          // silently replaced.
          if (!raw && env) {
            envelope.value = env
            await writeLocalEnvelope(remote.blob)
          }
        } else {
          remoteExists.value = false
          remoteEnvelope.value = null
        }
      } catch {
        syncState.value = 'offline'
      }
    }

    const session = readSessionDek()
    let restoreMigration = 0
    if (envelope.value && session) {
      try {
        const key = await importDek(session)
        const decrypted = await decryptWithDek(envelope.value, key)
        restoreMigration = decrypted.v === DOC_VERSION ? 0 : decrypted.v
        doc.value = normalizeDoc(decrypted)
        dek = key
        status.value = 'unlocked'
      } catch {
        // A stale session key (vault reset, different account) is discarded.
        clearSessionDek()
        dek = null
        doc.value = null
      }
    }
    // Outside the try: a failed local write must not look like a failed decrypt
    // and throw away the session and the doc it just restored.
    if (restoreMigration) await persistMigration(restoreMigration)

    if (status.value !== 'unlocked') {
      status.value = envelope.value || (corrupt.value && remoteEnvelope.value) ? 'locked' : 'empty'
    }

    if (!liveSpaces.value.some((s) => s.id === activeSpaceId.value)) {
      activeSpaceId.value = ALL_SPACES
    }
    if (!liveTypes.value.some((t) => t.id === activeTypeId.value)) activeTypeId.value = ''
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(SPACE_STORAGE)
      if (stored && liveSpaces.value.some((s) => s.id === stored)) activeSpaceId.value = stored
    }

    if (status.value === 'unlocked' && dek && remoteEnvelope.value && remoteEnvelope.value !== envelope.value) {
      await mergeFetched(remoteEnvelope.value)
    }
  }

  /** Try to fold the fetched envelope into the unlocked doc. */
  async function mergeFetched(env: VaultEnvelope): Promise<void> {
    if (!dek || !doc.value) return
    let remoteDoc: VaultDoc
    try {
      remoteDoc = normalizeDoc(await decryptWithDek(env, dek))
    } catch {
      // A different DEK means a different master password on the other device;
      // the user must choose which vault wins.
      pendingConflict.value = 'master'
      return
    }
    doc.value = mergeDocs(doc.value, remoteDoc)
    envelope.value = env
    remoteExists.value = true
    await $save()
    await $flush()
  }

  async function $mergeRemote(): Promise<void> {
    if (merging || !dek) return
    merging = true
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await fetchRemote()
        if (!remote) {
          remoteExists.value = false
          // upload() directly: $flush would enqueue behind the task that is
          // awaiting this merge and deadlock the chain.
          await upload()
          return
        }
        remoteExists.value = true
        remoteVersion.value = remote.version
        const env = parseEnvelope(remote.blob)
        if (!env) break
        remoteEnvelope.value = env
        let remoteDoc: VaultDoc
        try {
          remoteDoc = normalizeDoc(await decryptWithDek(env, dek))
        } catch {
          pendingConflict.value = 'master'
          return
        }
        doc.value = mergeDocs(requireDoc(), remoteDoc)
        envelope.value = await sealEnvelope(env, requireDoc(), dek)
        await writeLocal(envelope.value)
        const result = await pushRemote(JSON.stringify(envelope.value), remote.version)
        if (!result.conflict) {
          remoteVersion.value = result.saved.version
          lastSyncAt.value = result.saved.updatedAt || now()
          syncState.value = 'idle'
          dirty = false
          return
        }
      }
      pendingConflict.value = 'merge'
    } catch {
      syncState.value = 'offline'
      dirty = true
      scheduleRetry()
    } finally {
      merging = false
    }
  }

  /**
   * True when the last merge finished with nothing left to push. A function
   * body reads the settled ref without the narrow type the `saving` assignment
   * in `$syncNow` would otherwise leave behind.
   */
  const mergedCleanly = () => syncState.value === 'idle' && !pendingConflict.value

  async function $syncNow(): Promise<void> {
    if (!signedIn() || !envelope.value || !dek || merging) return
    // `saving` drives the spinning button; $mergeRemote settles it back to
    // `idle`, `offline` or a conflict, so the toast only fires on real success.
    syncState.value = 'saving'
    await $mergeRemote()
    if (mergedCleanly()) toast.success($t('sync.done'))
  }

  async function $create(master: string): Promise<void> {
    if (master.length < MIN_MASTER_LENGTH) throw new Error('vault:short-password')
    const created = await createEnvelope(emptyDoc(), master)
    envelope.value = created.envelope
    dek = created.dek
    doc.value = normalizeDoc(JSON.parse(JSON.stringify(emptyDoc())))
    corrupt.value = false
    pendingConflict.value = null
    status.value = 'unlocked'
    writeSessionDek(await exportDek(created.dek))
    await writeLocal(created.envelope)
    await $save()
    if (signedIn()) await $flush()
  }

  async function $unlock(master: string): Promise<void> {
    if (!envelope.value) throw new Error('vault:empty')
    const opened = await unlockEnvelope(envelope.value, master)
    const needsMigration = opened.doc.v !== DOC_VERSION
    dek = opened.dek
    doc.value = normalizeDoc(opened.doc)
    writeSessionDek(await exportDek(opened.dek))
    status.value = 'unlocked'
    corrupt.value = false
    // Persist the upgraded document before any merge/upload below, so the copy
    // pushed to the server is already v2.
    if (needsMigration) await persistMigration(opened.doc.v)
    if (!liveSpaces.value.some((s) => s.id === activeSpaceId.value)) activeSpaceId.value = ALL_SPACES
    if (!liveTypes.value.some((t) => t.id === activeTypeId.value)) activeTypeId.value = ''
    if (remoteEnvelope.value && remoteEnvelope.value !== envelope.value) {
      await mergeFetched(remoteEnvelope.value)
    } else if (signedIn()) {
      if (!remoteExists.value) await $flush()
      else await $mergeRemote()
    }
  }

  function $lock(): void {
    clearTimers()
    dek = null
    doc.value = null
    clearSessionDek()
    pendingConflict.value = null
    syncState.value = 'idle'
    status.value = envelope.value ? 'locked' : 'empty'
  }

  async function $onSignedIn(): Promise<void> {
    if (status.value === 'unlocked') {
      try {
        const remote = await fetchRemote()
        if (!remote) {
          remoteExists.value = false
          remoteEnvelope.value = null
          await $flush()
          return
        }
        remoteExists.value = true
        remoteVersion.value = remote.version
        const env = parseEnvelope(remote.blob)
        remoteEnvelope.value = env
        if (env) await mergeFetched(env)
      } catch {
        syncState.value = 'offline'
      }
      return
    }
    await $init(true)
  }

  function $onSignedOut(): void {
    // The local encrypted copy stays: the vault keeps working offline.
    $lock()
    remoteExists.value = false
    remoteVersion.value = 0
    remoteEnvelope.value = null
  }

  async function $addSpace(input: { name: string; description?: string; color?: string; icon?: string }): Promise<VaultSpace> {
    const name = input.name.trim()
    if (!name) throw new Error('vault:space.name')
    const at = now()
    const space: VaultSpace = {
      id: uuid(),
      name,
      description: input.description?.trim() ?? '',
      color: input.color || DEFAULT_SPACE_COLOR,
      // Append after the last live space; `liveSpaces` is already in sidebar
      // order, so the new one lands at the bottom of the list.
      order: liveSpaces.value.reduce((max, s) => Math.max(max, s.order + 1), 0),
      createdAt: at,
      updatedAt: at,
    }
    if (isVaultIcon(input.icon)) space.icon = input.icon
    requireDoc().spaces.push(space)
    await $save()
    return space
  }

  async function $updateSpace(id: string, patch: { name?: string; description?: string; color?: string; icon?: string }) {
    const space = findSpace(id)
    const { icon, ...rest } = patch
    Object.assign(space, rest, { updatedAt: now() })
    // A form submits a plain string, so validate here rather than trusting the
    // caller: empty clears the override, absent keeps it.
    if (icon !== undefined) {
      if (isVaultIcon(icon)) space.icon = icon
      else delete space.icon
    }
    await $save()
  }

  /**
   * Apply a dragged sidebar order. Only live spaces are renumbered; tombstoned
   * ones keep their position and never come back to the top after a revive.
   */
  async function $reorderSpaces(ids: string[]): Promise<void> {
    const d = requireDoc()
    const order = new Map(ids.map((id, i) => [id, i]))
    const at = now()
    let changed = false
    for (const space of d.spaces) {
      if (space.deletedAt) continue
      const next = order.get(space.id)
      if (next === undefined || space.order === next) continue
      space.order = next
      space.updatedAt = at
      changed = true
    }
    if (!changed) return
    // liveSpaces reads doc.spaces in array order rather than sorting, so the
    // array itself has to move too or this session keeps showing the old order.
    d.spaces.sort(bySidebarOrder)
    await $save()
  }

  /** Tombstone a space and everything in it. */
  async function $removeSpace(id: string): Promise<void> {
    if (liveSpaces.value.length <= 1) throw new Error('vault:space.last')
    const at = now()
    const space = findSpace(id)
    space.deletedAt = at
    space.updatedAt = at
    for (const entry of requireDoc().entries) {
      if (entry.spaceId !== id || entry.deletedAt) continue
      entry.deletedAt = at
      entry.updatedAt = at
    }
    if (activeSpaceId.value === id) activeSpaceId.value = ALL_SPACES
    await $save()
  }

  async function $addType(input: { name: string; fields: VaultRecordField[] }): Promise<VaultRecordType> {
    const name = input.name.trim()
    if (!name) throw new Error('vault:format.name')
    const at = now()
    const type: VaultRecordType = {
      id: uuid(),
      name,
      fields: input.fields.map((f) => ({ ...f })),
      createdAt: at,
      updatedAt: at,
    }
    requireDoc().types.push(type)
    await $save()
    return type
  }

  async function $updateType(id: string, patch: Partial<Pick<VaultRecordType, 'name' | 'fields'>>) {
    const type = liveTypes.value.find((t) => t.id === id)
    if (!type) throw new Error('vault:format.missing')
    if (patch.name !== undefined) type.name = patch.name.trim() || type.name
    if (patch.fields) type.fields = patch.fields.map((f) => ({ ...f }))
    type.updatedAt = now()
    await $save()
  }

  /** Tombstone a format; records already using it keep their fields. */
  async function $removeType(id: string) {
    const type = liveTypes.value.find((t) => t.id === id)
    if (!type) return
    const at = now()
    type.deletedAt = at
    type.updatedAt = at
    if (activeTypeId.value === id) activeTypeId.value = ''
    await $save()
  }

  /**
   * Switch a system preset on or off. Disabling only hides it from the picker:
   * formats already created from it stay untouched.
   */
  async function $setPresetEnabled(id: string, enabled: boolean): Promise<void> {
    const d = requireDoc()
    const preset = id.trim()
    if (!preset) return
    const disabled = d.disabledPresets.includes(preset)
    if (enabled === !disabled) return
    const next = new Set(d.disabledPresets)
    if (enabled) next.delete(preset)
    else next.add(preset)
    // Replace the array: mutating it in place would not be a new doc value.
    d.disabledPresets = [...next]
    await $save()
  }

  async function $addEntry(input: EntryInput): Promise<VaultEntry> {
    const title = input.title.trim()
    if (!title) throw new Error('vault:entry.title')
    findSpace(input.spaceId)
    const at = now()
    const entry: VaultEntry = {
      id: uuid(),
      spaceId: input.spaceId,
      title,
      kind: input.kind,
      group: input.group.trim(),
      tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
      fields: input.fields.map((f) => ({ ...f, key: f.key.trim() })),
      typeId: input.typeId || undefined,
      notes: input.notes,
      url: input.url.trim(),
      createdAt: at,
      updatedAt: at,
    }
    if (isVaultIcon(input.icon)) entry.icon = input.icon
    if (isHexColor(input.color)) entry.color = input.color
    requireDoc().entries.push(entry)
    await $save()
    return entry
  }

  async function $updateEntry(id: string, patch: Partial<EntryInput>) {
    const entry = findEntry(id)
    Object.assign(entry, {
      ...patch,
      title: patch.title?.trim() ?? entry.title,
      group: patch.group?.trim() ?? entry.group,
      tags: patch.tags ? [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))] : entry.tags,
      fields: patch.fields ? patch.fields.map((f) => ({ ...f, key: f.key.trim() })) : entry.fields,
      url: patch.url?.trim() ?? entry.url,
      // `icon: ''` clears the override; an absent key keeps it.
      icon: patch.icon !== undefined ? (isVaultIcon(patch.icon) ? patch.icon : undefined) : entry.icon,
      // Same rule for the card color: `''` falls back to the space color.
      color: patch.color !== undefined ? (isHexColor(patch.color) ? patch.color : undefined) : entry.color,
      updatedAt: now(),
    })
    await $save()
  }

  async function $removeEntry(id: string) {
    const entry = findEntry(id)
    entry.deletedAt = now()
    entry.updatedAt = entry.deletedAt
    await $save()
  }

  /**
   * Rename a group across one space's live entries. Groups are scoped to a
   * space, so two spaces may each keep their own `apple` card; an empty name
   * ungroups.
   */
  async function $renameGroup(spaceId: string, from: string, to: string): Promise<void> {
    const source = from.trim()
    const target = to.trim()
    if (source === target) return
    const at = now()
    let changed = false
    for (const entry of requireDoc().entries) {
      if (entry.deletedAt || entry.spaceId !== spaceId || entry.group !== source) continue
      entry.group = target
      entry.updatedAt = at
      changed = true
    }
    if (changed) await $save()
  }

  function matchExisting(parsed: ParsedEntry, spaceId: string, entries: VaultEntry[]): VaultEntry | undefined {
    if (parsed.meta.id) {
      const byId = entries.find((e) => e.id === parsed.meta.id)
      if (byId) return byId
    }
    return entries.find((e) => e.spaceId === spaceId && e.source?.file === parsed.source.file && e.source?.path === parsed.source.path)
  }

  function applyParsed(target: VaultEntry | undefined, parsed: ParsedEntry, spaceId: string, at: string): VaultEntry {
    if (target) {
      // Re-importing a deleted record revives it: the user is asserting it
      // exists, which beats the tombstone.
      delete target.deletedAt
      Object.assign(target, {
        spaceId,
        title: parsed.title,
        kind: parsed.kind,
        // A group the user renamed by hand survives a re-import of the original
        // file; only a file that spells out `__group` may overwrite it.
        group: parsed.groupExplicit ? parsed.group : target.group || parsed.group,
        tags: parsed.tags,
        fields: parsed.fields,
        notes: parsed.notes,
        url: parsed.url,
        source: parsed.source,
        // A file that carries no `__color` must not wipe a card color the user
        // picked after exporting it.
        color: parsed.color ?? target.color,
        updatedAt: at,
      })
      return target
    }
    return {
      id: parsed.meta.id || uuid(),
      spaceId,
      title: parsed.title,
      kind: parsed.kind,
      group: parsed.group,
      tags: parsed.tags,
      fields: parsed.fields,
      notes: parsed.notes,
      url: parsed.url,
      color: parsed.color,
      source: parsed.source,
      createdAt: at,
      updatedAt: at,
    }
  }

  async function $importToml(options: ImportOptions): Promise<{ created: number; updated: number }> {
    const d = requireDoc()
    findSpace(options.spaceId)
    const at = now()
    if (options.mode === 'replace') {
      for (const entry of d.entries) {
        if (entry.spaceId !== options.spaceId || entry.deletedAt) continue
        entry.deletedAt = at
        entry.updatedAt = at
      }
    }
    let created = 0
    let updated = 0
    for (const item of options.entries) {
      const existing = matchExisting(item, options.spaceId, d.entries)
      if (existing) {
        applyParsed(existing, item, options.spaceId, at)
        updated++
        continue
      }
      d.entries.push(applyParsed(undefined, item, options.spaceId, at))
      created++
    }
    await $save()
    return { created, updated }
  }

  function $exportSpaceToml(spaceId: string): string {
    const space = findSpace(spaceId)
    // Only this space's entries: exporting the whole vault under one space's
    // header would silently leak another space's records into the file.
    return exportSpaceToml(
      space,
      requireDoc().entries.filter((e) => e.spaceId === spaceId),
    )
  }

  async function $changeMaster(oldMaster: string, newMaster: string): Promise<void> {
    if (!envelope.value) throw new Error('vault:empty')
    if (newMaster.length < MIN_MASTER_LENGTH) throw new Error('vault:short-password')
    // Verify first: re-wrapping with an unverified old password would silently
    // create an envelope the user cannot open.
    const opened = await unlockEnvelope(envelope.value, oldMaster)
    envelope.value = await rewrapEnvelope(envelope.value, opened.dek, newMaster)
    dek = opened.dek
    writeSessionDek(await exportDek(opened.dek))
    await writeLocal(envelope.value)
    await $flush()
  }

  async function $deleteRemote(): Promise<void> {
    await deleteRemote()
    remoteExists.value = false
    remoteVersion.value = 0
    remoteEnvelope.value = null
    dirty = false
  }

  async function $resetVault(): Promise<void> {
    // Deleting the cloud copy first means a failed request aborts the reset with
    // everything intact, instead of leaving an orphaned copy behind.
    if (signedIn()) await deleteRemote()
    clearTimers()
    dek = null
    doc.value = null
    envelope.value = null
    remoteExists.value = false
    remoteVersion.value = 0
    remoteEnvelope.value = null
    pendingConflict.value = null
    corrupt.value = false
    dirty = false
    syncState.value = 'idle'
    lastSyncAt.value = ''
    clearSessionDek()
    await clearLocalEnvelope()
    status.value = 'empty'
  }

  function $useRemote(): void {
    if (!remoteEnvelope.value) return
    envelope.value = remoteEnvelope.value
    void writeLocalEnvelope(JSON.stringify(remoteEnvelope.value))
    clearSessionDek()
    dek = null
    doc.value = null
    pendingConflict.value = null
    corrupt.value = false
    status.value = 'locked'
  }

  /** Force the local envelope onto the cloud copy, re-reading the version once. */
  async function $overwriteRemote(): Promise<void> {
    if (!envelope.value) throw new Error('vault:empty')
    const blob = JSON.stringify(envelope.value)
    for (let attempt = 0; attempt < 2; attempt++) {
      const remote = await fetchRemote()
      remoteExists.value = !!remote
      const version = remote?.version ?? 0
      const result = await pushRemote(blob, version)
      if (!result.conflict) {
        remoteVersion.value = result.saved.version
        remoteExists.value = true
        lastSyncAt.value = result.saved.updatedAt || now()
        pendingConflict.value = null
        dirty = false
        syncState.value = 'idle'
        return
      }
    }
    syncState.value = 'error'
    throw new Error('vault:conflict')
  }

  function $setActiveSpace(id: string) {
    activeSpaceId.value = id
    persistSpan(id)
  }

  return {
    envelope,
    doc,
    status,
    corrupt,
    remoteExists,
    remoteVersion,
    remoteEnvelope,
    pendingConflict,
    syncState,
    lastSyncAt,
    activeSpaceId,
    query,
    activeKind,
    activeTypeId,
    activeTag,
    sort,
    spaces: liveSpaces,
    entries: liveEntries,
    types: liveTypes,
    disabledPresets,
    filteredEntries,
    allTags,
    spaceCounts,
    $init,
    $create,
    $unlock,
    $lock,
    $onSignedIn,
    $onSignedOut,
    $save,
    $flush,
    $syncNow,
    $mergeRemote,
    $addSpace,
    $updateSpace,
    $reorderSpaces,
    $removeSpace,
    $addType,
    $updateType,
    $removeType,
    $setPresetEnabled,
    $addEntry,
    $updateEntry,
    $removeEntry,
    $renameGroup,
    $importToml,
    $exportSpaceToml,
    $changeMaster,
    $deleteRemote,
    $resetVault,
    $useRemote,
    $overwriteRemote,
    $setActiveSpace,
  }
})

export { CORRUPT, WRONG_PASSWORD }

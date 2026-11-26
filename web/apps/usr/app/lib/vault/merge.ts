// Document reconciliation. Sync is last-write-wins per record on ISO
// timestamps: clocks can disagree, but both replicas run the same comparison,
// so they converge on the same record instead of ping-ponging.
import { DEFAULT_SPACE_COLOR, DOC_VERSION, PROTOTYPE_KEYS, isHexColor, isVaultIcon } from './types'
import type { EntryKind, VaultDoc, VaultEntry, VaultField, VaultRecordField, VaultRecordType, VaultSpace } from './types'

type Record_ = { id?: unknown; updatedAt?: unknown; deletedAt?: unknown }

const KINDS: EntryKind[] = ['login', 'key', 'server', 'note', 'custom']

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // randomUUID needs a secure context; a LAN deployment over plain http falls
  // back to the v4 layout built from raw bytes.
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte, i) => {
    const value = i === 6 ? (byte & 0x0f) | 0x40 : i === 8 ? (byte & 0x3f) | 0x80 : byte
    return value.toString(16).padStart(2, '0')
  }).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Current time as the ISO-8601 string every record timestamps with. */
export const now = () => new Date().toISOString()

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

// Group label derived from an imported TOML path: array indices are noise
// (`apple[0]` and `apple[1]` belong together), the rest of the path is not
// (`bank.agricultural` stays distinct from `bank.mercantile`).
function groupFromPath(path: unknown): string {
  return str(path)
    .split('.')
    .map((segment) => segment.replace(/\[\d+\]$/, ''))
    .filter(Boolean)
    .join('.')
}

// Timestamps compare lexicographically as ISO-8601 UTC strings; anything
// unparsable sorts first so a real record always wins over a damaged one.
function newer(a: Record_, b: Record_): Record_ {
  const ta = str(a.updatedAt)
  const tb = str(b.updatedAt)
  if (ta === tb) return b
  return ta > tb ? a : b
}

function normalizeFields(input: unknown): VaultField[] {
  if (!Array.isArray(input)) return []
  const out: VaultField[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const { key, value, secret } = raw as Record<string, unknown>
    const k = str(key).trim()
    if (!k || PROTOTYPE_KEYS.includes(k)) continue
    out.push({ key: k, value: str(value), secret: secret === true })
  }
  return out
}

// Format fields share the entry-field rules: trimmed keys, no empties, no
// prototype names, no case-insensitive duplicates.
function normalizeTypeFields(input: unknown): VaultRecordField[] {
  if (!Array.isArray(input)) return []
  const out: VaultRecordField[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const { key, secret } = raw as Record<string, unknown>
    const k = str(key).trim()
    const lower = k.toLowerCase()
    if (!k || k.startsWith('_') || PROTOTYPE_KEYS.includes(k) || seen.has(lower)) continue
    seen.add(lower)
    out.push({ key: k, secret: secret === true })
  }
  return out
}

function normalizeType(input: unknown, at: string): VaultRecordType | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const id = str(raw.id).trim()
  if (!id) return null
  const type: VaultRecordType = {
    id,
    name: str(raw.name).trim() || 'Format',
    fields: normalizeTypeFields(raw.fields),
    createdAt: str(raw.createdAt) || at,
    updatedAt: str(raw.updatedAt) || at,
  }
  const deletedAt = str(raw.deletedAt)
  if (deletedAt) type.deletedAt = deletedAt
  return type
}

function normalizeSpace(input: unknown, at: string): VaultSpace | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const name = str(raw.name).trim()
  const id = str(raw.id).trim()
  if (!id) return null
  const space: VaultSpace = {
    id,
    name: name || 'Space',
    description: str(raw.description),
    color: str(raw.color) || DEFAULT_SPACE_COLOR,
    // Pre-v2 records carry no position: 0 everywhere means the sort falls
    // through to creation order, which is the order they already display in.
    order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : 0,
    createdAt: str(raw.createdAt) || at,
    updatedAt: str(raw.updatedAt) || at,
  }
  if (isVaultIcon(raw.icon)) space.icon = raw.icon
  const deletedAt = str(raw.deletedAt)
  if (deletedAt) space.deletedAt = deletedAt
  return space
}

// Position first, then creation order, then id: two devices that disagree on
// `order` still agree on the rest, so they land on the same sequence. Exported
// because the store sorts the live array with the same rule after a drag.
export function bySidebarOrder(a: VaultSpace, b: VaultSpace): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

function normalizeEntry(input: unknown, at: string): VaultEntry | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const id = str(raw.id).trim()
  if (!id) return null
  const kind = KINDS.includes(raw.kind as EntryKind) ? (raw.kind as EntryKind) : 'custom'
  const entry: VaultEntry = {
    id,
    spaceId: str(raw.spaceId),
    title: str(raw.title) || 'Untitled',
    kind,
    // Documents written before groups existed derive one from the imported
    // TOML path, so an import made earlier shows up already grouped.
    group: str(raw.group).trim() || groupFromPath((raw.source as Record<string, unknown> | undefined)?.path),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => str(t).trim()).filter(Boolean) : [],
    fields: normalizeFields(raw.fields),
    notes: str(raw.notes),
    url: str(raw.url),
    createdAt: str(raw.createdAt) || at,
    updatedAt: str(raw.updatedAt) || at,
  }
  const typeId = str(raw.typeId).trim()
  if (typeId) entry.typeId = typeId
  if (isVaultIcon(raw.icon)) entry.icon = raw.icon
  if (isHexColor(raw.color)) entry.color = raw.color
  const src = raw.source
  if (src && typeof src === 'object') {
    const s = src as Record<string, unknown>
    if (str(s.file) || str(s.path)) entry.source = { file: str(s.file), path: str(s.path) }
  }
  const deletedAt = str(raw.deletedAt)
  if (deletedAt) entry.deletedAt = deletedAt
  return entry
}

// Collapse duplicates by id, keeping the newest copy: a doc must never carry two
// records for one id or later merges become order-dependent.
function dedupe<T extends { id: string; updatedAt?: string }>(items: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of items) {
    const prev = map.get(item.id)
    map.set(item.id, prev ? (newer(prev, item) as T) : item)
  }
  return [...map.values()]
}

// Disabled system presets: ids only, deduped. An unknown id is kept so a
// preset added by a newer client stays disabled when this one saves the doc.
function normalizeDisabled(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out = new Set<string>()
  for (const raw of input) {
    const id = str(raw).trim()
    if (id) out.add(id)
  }
  return [...out]
}

export function emptyDoc(): VaultDoc {
  const at = now()
  return {
    v: DOC_VERSION,
    updatedAt: at,
    spaces: [
      {
        id: uuid(),
        name: 'Personal',
        description: '',
        color: DEFAULT_SPACE_COLOR,
        order: 0,
        createdAt: at,
        updatedAt: at,
      },
    ],
    entries: [],
    types: [],
    disabledPresets: [],
  }
}

/** Validate and repair an arbitrary object into a usable document. */
export function normalizeDoc(input: unknown): VaultDoc {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (raw.v !== 1 && raw.v !== 2 && raw.v !== DOC_VERSION) throw new Error('vault:unsupported')
  const at = now()
  const spaces = dedupe((Array.isArray(raw.spaces) ? raw.spaces : []).map((s) => normalizeSpace(s, at)).filter((s): s is VaultSpace => !!s))
  const entries = dedupe((Array.isArray(raw.entries) ? raw.entries : []).map((e) => normalizeEntry(e, at)).filter((e): e is VaultEntry => !!e))
  const types = dedupe((Array.isArray(raw.types) ? raw.types : []).map((t) => normalizeType(t, at)).filter((t): t is VaultRecordType => !!t))
  // The vault must always have somewhere to put an entry. Reuse a tombstoned
  // space when that is all there is, rather than resurrecting the name.
  if (!spaces.some((s) => !s.deletedAt)) {
    const first = spaces[0]
    if (first) {
      delete first.deletedAt
      first.updatedAt = at
    } else {
      spaces.push(...emptyDoc().spaces)
    }
  }
  return {
    v: DOC_VERSION,
    updatedAt: str(raw.updatedAt) || at,
    spaces: [...spaces].sort(bySidebarOrder),
    entries,
    types,
    disabledPresets: normalizeDisabled(raw.disabledPresets),
  }
}

/** Union two documents by record id, newest `updatedAt` wins (ties pick `b`). */
export function mergeDocs(a: VaultDoc, b: VaultDoc): VaultDoc {
  const at = now()
  const spaces = dedupe([...a.spaces, ...b.spaces].map((s) => normalizeSpace(s, at)).filter((s): s is VaultSpace => !!s))
  const entries = dedupe([...a.entries, ...b.entries].map((e) => normalizeEntry(e, at)).filter((e): e is VaultEntry => !!e))
  const types = dedupe([...a.types, ...b.types].map((t) => normalizeType(t, at)).filter((t): t is VaultRecordType => !!t))
  if (!spaces.some((s) => !s.deletedAt)) {
    const first = spaces[0]
    if (first) {
      delete first.deletedAt
      first.updatedAt = at
    }
  }
  return {
    v: DOC_VERSION,
    updatedAt: [str(a.updatedAt), str(b.updatedAt), at].sort().at(-1) as string,
    spaces: [...spaces].sort(bySidebarOrder),
    entries,
    types,
    // Union rather than last-write-wins: a preset turned off on one device must
    // not silently come back from a device that never saw the change.
    disabledPresets: [...new Set([...normalizeDisabled(a.disabledPresets), ...normalizeDisabled(b.disabledPresets)])],
  }
}

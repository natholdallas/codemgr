// TOML bridge. Importing flattens an arbitrary TOML tree into vault entries;
// exporting emits one table per entry with `_`-prefixed metadata so a
// re-import updates the same records instead of duplicating them.
//
// Framework-free: no Nuxt auto-imports, no store access, so it is usable from
// the import dialog, the TOML editor and (in principle) plain Node.
import { parse, stringify } from 'smol-toml'
import { PROTOTYPE_KEYS } from './types'
import type { EntryKind, VaultEntry, VaultField, VaultSource, VaultSpace } from './types'

export interface ParsedEntry {
  title: string
  kind: EntryKind
  tags: string[]
  fields: VaultField[]
  notes: string
  url: string
  source: VaultSource
  meta: { id?: string }
  // Problems that made a fragment of this entry unusable (a dropped field, an
  // unknown `_kind`). The import dialog surfaces them; the entry is still used.
  warnings?: string[]
}

export interface ParseOptions {
  file: string
  baseTags?: string[]
}

const KINDS: EntryKind[] = ['login', 'key', 'server', 'note', 'custom']
const META_KEYS = ['_id', '_title', '_kind', '_tags', '_notes', '_url']
// Ordered first in a parsed entry so the common account fields read top-down
// regardless of how the source file happened to order them.
const COMMON_KEYS = ['username', 'email', 'phone', 'account', 'url', 'site', 'host', 'port', 'password']
const SECRET_PATTERN = /password|passwd|pass|secret|token|key|otp|2fa|totp|recovery|code|private|credential/i
const FIELD_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/

const scalarText = (v: unknown): string | null => {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  return null
}

const isTable = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)

/** TOML array of scalars, rendered one item per line (2FA / recovery codes). */
const scalarList = (v: unknown): string[] | null => {
  if (!Array.isArray(v) || v.length === 0) return null
  const out: string[] = []
  for (const item of v) {
    const text = scalarText(item)
    if (text === null) return null
    out.push(text)
  }
  return out
}

export function isSecretKey(key: string): boolean {
  return SECRET_PATTERN.test(key)
}

export function inferKind(fields: VaultField[]): EntryKind {
  const keys = fields.map((f) => f.key.toLowerCase())
  const has = (k: string) => keys.includes(k)
  const account = ['username', 'email', 'phone', 'account'].some(has)
  if (has('value') && !account) return 'key'
  if (has('host') || has('port')) return 'server'
  if (!has('password') && keys.some((k) => ['key', 'token', 'secret', 'private', 'credential'].some((t) => k.includes(t)))) return 'key'
  if (has('password') || account) return 'login'
  return 'note'
}

/** Bare TOML key from a title: lowercase ASCII, no dots (they would nest). */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'entry'
}

const stripIndex = (segment: string) => segment.replace(/\[\d+\]$/, '')

const orderFields = (fields: VaultField[]): VaultField[] =>
  [...fields].sort((a, b) => {
    const ra = COMMON_KEYS.indexOf(a.key.toLowerCase())
    const rb = COMMON_KEYS.indexOf(b.key.toLowerCase())
    return (ra === -1 ? COMMON_KEYS.length : ra) - (rb === -1 ? COMMON_KEYS.length : rb)
  })

interface Bucket {
  fields: VaultField[]
  meta: Record<string, unknown>
  nested: [string, unknown][]
  warnings: string[]
}

/** Split one TOML table into its scalar fields, metadata and sub-tables. */
function splitTable(table: Record<string, unknown>): Bucket {
  const bucket: Bucket = { fields: [], meta: {}, nested: [], warnings: [] }
  for (const [key, value] of Object.entries(table)) {
    if (META_KEYS.includes(key)) {
      bucket.meta[key] = value
      continue
    }
    if (PROTOTYPE_KEYS.includes(key)) {
      bucket.warnings.push(key)
      continue
    }
    const text = scalarText(value)
    if (text !== null) {
      bucket.fields.push({ key, value: text, secret: isSecretKey(key) })
      continue
    }
    const list = scalarList(value)
    if (list) {
      bucket.fields.push({ key, value: list.join('\n'), secret: isSecretKey(key) })
      continue
    }
    bucket.nested.push([key, value])
  }
  return bucket
}

function tagsFrom(segments: string[], bucket: Bucket, kind: EntryKind, baseTags: string[] | undefined) {
  const extra = Array.isArray(bucket.meta._tags) ? bucket.meta._tags.map((t) => scalarText(t) ?? '') : []
  const top = segments.length > 1 ? stripIndex(segments[0] ?? '') : ''
  const tags = [...(baseTags ?? []), top, ...extra, kind].map((t) => t.trim()).filter(Boolean)
  return [...new Set(tags)]
}

function buildEntry(segments: string[], bucket: Bucket, opts: ParseOptions): ParsedEntry {
  const fields = orderFields(bucket.fields)
  const metaKind = scalarText(bucket.meta._kind) as EntryKind | null
  const kind = metaKind && KINDS.includes(metaKind) ? metaKind : inferKind(fields)
  // A key entry's single payload field is the credential itself, whatever it is
  // called: `value` in key.toml-style files, `key` elsewhere.
  if (kind === 'key' && fields.length === 1 && fields[0]) fields[0].secret = true
  // Structured key records (`[[key.openrouter]]`) name their payload `value`,
  // which matches no secret keyword.
  if (kind === 'key') {
    for (const field of fields) {
      if (field.key.toLowerCase() === 'value') field.secret = true
    }
  }
  // Titles come from the record itself before the section path: `[[aapanel]]`
  // reads better as the server name than as `aapanel #1`.
  const pickField = (keys: string[]) =>
    keys
      .map((key) => fields.find((field) => !field.secret && field.key.toLowerCase() === key && field.value.trim()))
      .find(Boolean)
      ?.value.split('\n')[0]

  const arrayIndex = /\[(\d+)\]$/.exec(segments.at(-1) ?? '')
  const pathTitle = segments.map(stripIndex).filter(Boolean).join('.') || 'Untitled'
  const title =
    scalarText(bucket.meta._title)?.trim() ||
    pickField(['name', 'title', 'label', 'description', 'remark']) ||
    (arrayIndex ? pickField(['username', 'email', 'account', 'phone']) : '') ||
    `${pathTitle}${arrayIndex ? ` #${Number(arrayIndex[1]) + 1}` : ''}`
  const id = scalarText(bucket.meta._id) || undefined
  const url = scalarText(bucket.meta._url) || fields.find((f) => f.key.toLowerCase() === 'url')?.value || ''
  const entry: ParsedEntry = {
    title,
    kind,
    tags: tagsFrom(segments, bucket, kind, opts.baseTags),
    fields,
    notes: scalarText(bucket.meta._notes) || '',
    url: url.includes('\n') ? '' : url,
    source: { file: opts.file, path: segments.join('.') },
    meta: { id },
  }
  if (bucket.warnings.length) entry.warnings = bucket.warnings
  return entry
}

function walk(table: Record<string, unknown>, segments: string[], out: ParsedEntry[], opts: ParseOptions) {
  const bucket = splitTable(table)
  if (bucket.fields.length) out.push(buildEntry(segments, bucket, opts))
  for (const [key, value] of bucket.nested) {
    if (isTable(value)) {
      walk(value, [...segments, key], out, opts)
      continue
    }
    if (!Array.isArray(value)) continue
    value.forEach((item, i) => {
      if (isTable(item)) walk(item, [...segments, `${key}[${i}]`], out, opts)
    })
  }
}

/**
 * Flatten a TOML document into entries.
 *
 * Root-level scalars are credential files (`key.toml`), so each becomes its own
 * entry titled by its key with a single `value` field.
 */
export function parseVaultToml(text: string, opts: ParseOptions): ParsedEntry[] {
  const tree = parse(text) as Record<string, unknown>
  const out: ParsedEntry[] = []
  for (const [key, value] of Object.entries(tree)) {
    const scalar = scalarText(value)
    const list = scalar === null ? scalarList(value) : null
    if (scalar !== null || list) {
      const bucket: Bucket = {
        fields: [{ key: 'value', value: scalar ?? (list as string[]).join('\n'), secret: true }],
        meta: {},
        nested: [],
        warnings: [],
      }
      out.push(buildEntry([key], bucket, opts))
      continue
    }
    if (isTable(value)) walk(value, [key], out, opts)
    else if (Array.isArray(value)) value.forEach((item, i) => isTable(item) && walk(item, [`${key}[${i}]`], out, opts))
  }
  return out
}

function entryTable(entry: VaultEntry): Record<string, unknown> {
  // Null prototype: a field literally named `__proto__` must stay an ordinary
  // property instead of replacing the object's prototype.
  const table: Record<string, unknown> = Object.create(null)
  table._id = entry.id
  table._title = entry.title
  table._kind = entry.kind
  table._tags = entry.tags
  if (entry.notes) table._notes = entry.notes
  if (entry.url) table._url = entry.url
  for (const field of entry.fields) {
    const key = field.key.trim()
    // Skip keys TOML cannot express as a bare key or that would shadow the
    // metadata block; the entry editor rejects them up front.
    if (!FIELD_KEY_PATTERN.test(key) || key.startsWith('_') || PROTOTYPE_KEYS.includes(key)) continue
    table[key] = field.value
  }
  return table
}

/** Render one space (and its live entries) as plaintext TOML. */
export function exportSpaceToml(space: VaultSpace, entries: VaultEntry[]): string {
  const groups = new Map<string, VaultEntry[]>()
  for (const entry of entries) {
    if (entry.deletedAt) continue
    const slug = slugify(entry.title)
    const list = groups.get(slug)
    if (list) list.push(entry)
    else groups.set(slug, [entry])
  }
  const root: Record<string, unknown> = Object.create(null)
  for (const [slug, list] of groups) {
    const tables = list.map(entryTable)
    root[slug] = tables.length === 1 ? tables[0] : tables
  }
  const header = `# Codemgr Vault export — PLAINTEXT. Keep this file safe.\n# space: ${space.name}\n`
  return header + stringify(root)
}

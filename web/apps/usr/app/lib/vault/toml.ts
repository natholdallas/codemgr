// TOML bridge. Importing converts an arbitrary TOML tree into vault entries
// structurally — one entry per table, grouped by table path — with no guessing
// from field values. Exporting emits one table per entry with `__`-prefixed
// metadata so a re-import updates the same records instead of duplicating them.
//
// Framework-free: no Nuxt auto-imports, no store access, so it is usable from
// the import dialog and (in principle) plain Node.
import { parse, stringify } from 'smol-toml'
import { isHexColor, PROTOTYPE_KEYS } from './types'
import type { EntryKind, VaultEntry, VaultField, VaultSource, VaultSpace } from './types'

export interface ParsedEntry {
  title: string
  kind: EntryKind
  group: string
  // True when the file named the group explicitly (`__group`), including as an
  // empty string: only then may a re-import overwrite a renamed group.
  groupExplicit: boolean
  tags: string[]
  fields: VaultField[]
  notes: string
  url: string
  color?: string
  source: VaultSource
  meta: { id?: string }
  // Problems that made a fragment of this entry unusable (a dropped field, an
  // unknown `__kind`). The import dialog surfaces them; the entry is still used.
  warnings?: string[]
}

export interface ParseOptions {
  file: string
  baseTags?: string[]
}

const KINDS: EntryKind[] = ['login', 'key', 'server', 'note', 'custom']
// Metadata lives in the `__` namespace; real exports write it there. The
// single-underscore names are only read, so files exported by an older build
// still re-import with their id, title and tags intact.
const LEGACY_META_KEYS = ['_id', '_title', '_kind', '_tags', '_notes', '_url', '_group', '_color'] as const
const META_KEYS = ['__id', '__title', '__kind', '__tags', '__notes', '__url', '__group', '__color', ...LEGACY_META_KEYS]

/** Metadata value, preferring the current `__` name over the legacy `_` one. */
function metaValue(meta: Record<string, unknown>, name: string): unknown {
  return meta[`__${name}`] ?? meta[`_${name}`]
}

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

// Only what the file itself says about tags: user-entered extra tags plus the
// `__tags` metadata. No filename, section path or kind is added.
function tagsFrom(bucket: Bucket, baseTags: string[] | undefined): string[] {
  const raw = metaValue(bucket.meta, 'tags')
  const extra = Array.isArray(raw) ? raw.map((t) => scalarText(t) ?? '') : []
  const tags = [...(baseTags ?? []), ...extra].map((t) => t.trim()).filter(Boolean)
  return [...new Set(tags)]
}

// Array indices are noise (`apple[0]`, `apple[1]` are the same table), the rest
// of the path is meaningful (`bank.agricultural` is its own group).
const groupFromSegments = (segments: string[]): string => segments.map(stripIndex).filter(Boolean).join('.')

function buildEntry(segments: string[], bucket: Bucket, opts: ParseOptions, rootScalar = false): ParsedEntry {
  const fields = orderFields(bucket.fields)
  const metaKind = scalarText(metaValue(bucket.meta, 'kind')) as EntryKind | null
  // Structural only: a table says which keys it has, never what the record
  // means, so anything without an explicit `__kind` stays a plain custom record.
  const kind = metaKind && KINDS.includes(metaKind) ? metaKind : 'custom'
  // A declared key entry's payload is the credential itself, whatever it is
  // named: `value` in key.toml-style files.
  if (kind === 'key' && fields.length === 1 && fields[0]) fields[0].secret = true
  if (kind === 'key') {
    for (const field of fields) {
      if (field.key.toLowerCase() === 'value') field.secret = true
    }
  }
  const arrayIndex = /\[(\d+)\]$/.exec(segments.at(-1) ?? '')
  const pathTitle = groupFromSegments(segments) || 'Untitled'
  // The table path is the title; the array index only disambiguates repeats.
  const title =
    scalarText(metaValue(bucket.meta, 'title'))?.trim() || `${pathTitle}${arrayIndex ? ` #${Number(arrayIndex[1]) + 1}` : ''}`
  const id = scalarText(metaValue(bucket.meta, 'id')) || undefined
  const url = scalarText(metaValue(bucket.meta, 'url')) || fields.find((f) => f.key.toLowerCase() === 'url')?.value || ''
  // An explicit `__group` — even an empty one — owns the group, so an exported
  // ungrouped entry re-imports as ungrouped instead of regaining its table path.
  const metaGroup = scalarText(metaValue(bucket.meta, 'group'))
  const groupExplicit = metaGroup !== null
  const group = groupExplicit ? metaGroup.trim() : rootScalar ? '' : groupFromSegments(segments)
  const entry: ParsedEntry = {
    title,
    kind,
    group,
    groupExplicit,
    tags: tagsFrom(bucket, opts.baseTags),
    fields,
    notes: scalarText(metaValue(bucket.meta, 'notes')) || '',
    url: url.includes('\n') ? '' : url,
    source: { file: opts.file, path: segments.join('.') },
    meta: { id },
  }
  if (bucket.warnings.length) entry.warnings = bucket.warnings
  const color = scalarText(metaValue(bucket.meta, 'color'))
  if (isHexColor(color)) entry.color = color
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
 * Flatten a TOML document into entries: one per table, titled and grouped by
 * the table path. Nothing is inferred from field values.
 *
 * Root-level scalars are credential files (`key.toml`), so each becomes its own
 * ungrouped entry titled by its key with a single `value` field.
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
      out.push(buildEntry([key], bucket, opts, true))
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
  table.__id = entry.id
  table.__title = entry.title
  table.__kind = entry.kind
  // Always written, empty included: an exported ungrouped entry must re-import
  // as ungrouped rather than picking up its export table name as a group.
  table.__group = entry.group
  table.__tags = entry.tags
  if (entry.notes) table.__notes = entry.notes
  if (entry.url) table.__url = entry.url
  if (entry.color) table.__color = entry.color
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
  const bySlug = new Map<string, VaultEntry[]>()
  for (const entry of entries) {
    if (entry.deletedAt) continue
    const slug = slugify(entry.title)
    const list = bySlug.get(slug)
    if (list) list.push(entry)
    else bySlug.set(slug, [entry])
  }
  const root: Record<string, unknown> = Object.create(null)
  for (const [slug, list] of bySlug) {
    const tables = list.map(entryTable)
    root[slug] = tables.length === 1 ? tables[0] : tables
  }
  const header = `# Codemgr Vault export — PLAINTEXT. Keep this file safe.\n# space: ${space.name}\n`
  return header + stringify(root)
}

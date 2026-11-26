// Vault document model. Everything here is plaintext client-side data; it is
// only ever persisted after encryption (see crypto.ts) or as an exported TOML
// file the user asked for.

export type EntryKind = 'login' | 'key' | 'server' | 'note' | 'custom'

// Bumped when the encrypted document gains a shape older clients cannot keep.
// The envelope version stays 1: its format did not change, only the plaintext
// it wraps.
export const DOC_VERSION = 2

// Icons are stored as keys from this closed set; the UI maps them to lucide
// components. Storing a key rather than a component name keeps the ciphertext
// small and guarantees an imported document cannot inject an arbitrary string.
export const ENTRY_ICONS = [
  'globe',
  'key',
  'server',
  'note',
  'boxes',
  'mail',
  'chat',
  'cloud',
  'database',
  'terminal',
  'code',
  'wallet',
  'card',
  'banknote',
  'briefcase',
  'user',
  'users',
  'lock',
  'shield',
  'smartphone',
  'wifi',
  'router',
  'monitor',
  'drive',
  'gamepad',
  'music',
  'camera',
  'bookmark',
  'star',
  'heart',
  'building',
  'shopping',
  'plane',
  'house',
  'coffee',
  'zap',
  'fingerprint',
  'id',
  'file',
] as const

export type VaultIcon = (typeof ENTRY_ICONS)[number]

export function isVaultIcon(value: unknown): value is VaultIcon {
  return typeof value === 'string' && (ENTRY_ICONS as readonly string[]).includes(value)
}

export interface VaultSpace {
  id: string
  name: string
  description: string
  color: string
  // Position in the sidebar. Records without one normalize to 0, which falls
  // back to creation order — the ordering every existing vault already has.
  order: number
  icon?: VaultIcon
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface VaultField {
  key: string
  value: string
  secret: boolean
}

// A record format: the field shape the user defined once, reused by every
// record of that kind. Formats live in the encrypted document like entries, so
// the server never learns which fields a vault defines.
export interface VaultRecordField {
  key: string
  secret: boolean
}

export interface VaultRecordType {
  id: string
  name: string
  fields: VaultRecordField[]
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

// Where an entry came from. `file` is the imported TOML filename, `path` the
// dotted TOML path it was flattened from; together they let a re-import update
// the same record instead of duplicating it.
export interface VaultSource {
  file: string
  path: string
}

export interface VaultEntry {
  id: string
  spaceId: string
  title: string
  kind: EntryKind
  tags: string[]
  fields: VaultField[]
  // Format the record was created from; absent for free-form records and for
  // records imported from TOML.
  typeId?: string
  // User-chosen override; the kind's icon is used when absent.
  icon?: VaultIcon
  notes: string
  url: string
  source?: VaultSource
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface VaultDoc {
  // 1 is only ever produced by an older client; normalizeDoc upgrades it.
  v: 1 | typeof DOC_VERSION
  updatedAt: string
  spaces: VaultSpace[]
  entries: VaultEntry[]
  types: VaultRecordType[]
}

// The uploadable blob: a wrapped DEK plus the AES-GCM ciphertext of the doc.
// Every binary value is base64 so the whole thing is JSON the backend can store
// opaquely.
export interface VaultEnvelope {
  v: 1
  alg: 'AES-GCM'
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  wrapIv: string
  wrappedKey: string
  dataIv: string
  data: string
}

export const SPACE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7'] as const

export const ENTRY_KINDS: EntryKind[] = ['login', 'key', 'server', 'note', 'custom']

// One-click format presets. `nameKey` is a locale key so the created format is
// named in the user's language.
export const RECORD_PRESETS: { id: string; nameKey: string; fields: VaultRecordField[] }[] = [
  {
    id: 'smtp',
    nameKey: 'vault.format.preset.smtp',
    fields: [
      { key: 'host', secret: false },
      { key: 'port', secret: false },
      { key: 'from', secret: false },
      { key: 'password', secret: true },
    ],
  },
]

// Field/table names that must never reach an object literal or a TOML table:
// assigning them would poison the prototype chain instead of storing a value.
export const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'prototype']

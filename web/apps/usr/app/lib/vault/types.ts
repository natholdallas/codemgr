// Vault document model. Everything here is plaintext client-side data; it is
// only ever persisted after encryption (see crypto.ts) or as an exported TOML
// file the user asked for.

export type EntryKind = 'login' | 'key' | 'server' | 'note' | 'custom'

// Bumped when the encrypted document gains a shape older clients cannot keep.
// The envelope version stays 1: its format did not change, only the plaintext
// it wraps.
export const DOC_VERSION = 3

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
  // User-editable grouping label, independent of spaces and formats. Empty
  // means ungrouped; imports fill it from the TOML table path.
  group: string
  tags: string[]
  fields: VaultField[]
  // Format the record was created from; absent for free-form records and for
  // records imported from TOML.
  typeId?: string
  // User-chosen override; the kind's icon is used when absent.
  icon?: VaultIcon
  // Card accent override. Absent cards fall back to the space color, so a card
  // only stores a color when it deliberately differs from its space.
  color?: string
  notes: string
  url: string
  source?: VaultSource
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface VaultDoc {
  // 1 and 2 are only ever produced by older clients; normalizeDoc upgrades them.
  v: 1 | 2 | typeof DOC_VERSION
  updatedAt: string
  spaces: VaultSpace[]
  entries: VaultEntry[]
  types: VaultRecordType[]
  // System preset ids the user turned off. Unioned on merge, so a preset
  // disabled on one device stays disabled until it is re-enabled and saved.
  disabledPresets: string[]
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

// Palette shared by spaces and card accents. Every entry is a plain `#rrggbb`
// string, so a document written with an older (shorter) palette stays valid and
// the picker can accept any custom hex without a migration.
export const SPACE_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#64748b', // slate
  '#78716c', // stone
] as const

// New spaces start here (indigo), independent of palette order, so adding a
// color at the front never changes what fresh spaces look like.
export const DEFAULT_SPACE_COLOR = '#6366f1'

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** A color stored by the picker, accepted anywhere a document is normalized. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

export const ENTRY_KINDS: EntryKind[] = ['login', 'key', 'server', 'note', 'custom']

// Built-in record presets. They are read-only: creating a format copies the
// fields out, and the user can disable a preset without losing the copy they
// already made. `nameKey` is a locale key so the picker reads in their language.
export const SYSTEM_PRESETS: { id: string; nameKey: string; fields: VaultRecordField[] }[] = [
  {
    id: 'smtp',
    nameKey: 'vault.preset.smtp',
    fields: [
      { key: 'host', secret: false },
      { key: 'port', secret: false },
      { key: 'username', secret: false },
      { key: 'password', secret: true },
      { key: 'from', secret: false },
    ],
  },
  {
    id: 'website',
    nameKey: 'vault.preset.website',
    fields: [
      { key: 'username', secret: false },
      { key: 'email', secret: false },
      { key: 'phone', secret: false },
      { key: 'password', secret: true },
      { key: 'url', secret: false },
      { key: 'two-factor', secret: true },
    ],
  },
  {
    id: 'api',
    nameKey: 'vault.preset.api',
    fields: [
      { key: 'key', secret: true },
      { key: 'secret', secret: true },
      { key: 'endpoint', secret: false },
      { key: 'expires-at', secret: false },
    ],
  },
  {
    id: 'server',
    nameKey: 'vault.preset.server',
    fields: [
      { key: 'host', secret: false },
      { key: 'port', secret: false },
      { key: 'username', secret: false },
      { key: 'password', secret: true },
      { key: 'private-key', secret: true },
    ],
  },
  {
    id: 'database',
    nameKey: 'vault.preset.database',
    fields: [
      { key: 'host', secret: false },
      { key: 'port', secret: false },
      { key: 'database', secret: false },
      { key: 'username', secret: false },
      { key: 'password', secret: true },
    ],
  },
  {
    id: 'bank',
    nameKey: 'vault.preset.bank',
    fields: [
      { key: 'bank', secret: false },
      { key: 'card-number', secret: true },
      { key: 'holder', secret: false },
      { key: 'expiry', secret: false },
      { key: 'cvv', secret: true },
      { key: 'phone', secret: false },
      { key: 'password', secret: true },
    ],
  },
  {
    id: 'email',
    nameKey: 'vault.preset.email',
    fields: [
      { key: 'email', secret: false },
      { key: 'password', secret: true },
      { key: 'imap-host', secret: false },
      { key: 'imap-port', secret: false },
      { key: 'smtp-host', secret: false },
      { key: 'smtp-port', secret: false },
    ],
  },
  {
    id: 'cloud',
    nameKey: 'vault.preset.cloud',
    fields: [
      { key: 'access-key', secret: true },
      { key: 'secret-key', secret: true },
      { key: 'region', secret: false },
      { key: 'endpoint', secret: false },
    ],
  },
  {
    id: 'router',
    nameKey: 'vault.preset.router',
    fields: [
      { key: 'host', secret: false },
      { key: 'username', secret: false },
      { key: 'password', secret: true },
      { key: 'ssid', secret: false },
    ],
  },
  {
    id: 'game',
    nameKey: 'vault.preset.game',
    fields: [
      { key: 'username', secret: false },
      { key: 'email', secret: false },
      { key: 'password', secret: true },
      { key: 'region', secret: false },
    ],
  },
]

// What a preset picker hands to the format editor: a name and a field shape,
// never a live record of the system table above.
export type VaultPresetDraft = Pick<VaultRecordType, 'name' | 'fields'>

// Field/table names that must never reach an object literal or a TOML table:
// assigning them would poison the prototype chain instead of storing a value.
export const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'prototype']

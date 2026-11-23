// Cloud mirror of the envelope. Every call is silent: the vault talks to the
// server on its own schedule (autosave, sync, retry), so per-request toasts
// would be noise and the store reports failures through its sync badge.
import Apis, { VaultConflictError } from '~/lib/sdk'
import type { VaultIn, VaultSaved } from '~/lib/sdk'

const MAX_BYTES = 8_000_000

export interface RemoteVault {
  blob: string
  version: number
  size: number
  updatedAt: string
}

export type PushResult = { conflict: true } | { conflict: false; saved: VaultSaved }

/** Read the account's envelope; `null` when the account has none yet. */
export async function fetchRemote(): Promise<RemoteVault | null> {
  const info = await Apis.Vault.find({ meta: { silent: true } })
  if (!info.exists || !info.blob) return null
  return { blob: info.blob, version: info.version, size: info.size, updatedAt: info.updatedAt }
}

/**
 * Upload the envelope. `version` 0 creates the row; any other value must match
 * the stored revision or the server answers 409, which becomes `{ conflict }`.
 */
export async function pushRemote(blob: string, version: number): Promise<PushResult> {
  // Checked here as well as server-side so an oversized vault fails locally with
  // a translatable message instead of a 400 from the validation layer.
  if (new TextEncoder().encode(blob).length > MAX_BYTES) throw new Error('vault:too-large')
  try {
    const data: VaultIn = { blob, version }
    const saved = await Apis.Vault.save({ data, meta: { silent: true } })
    return { conflict: false, saved }
  } catch (err) {
    if (err instanceof VaultConflictError) return { conflict: true }
    throw err
  }
}

export async function deleteRemote(): Promise<void> {
  await Apis.Vault.remove({ meta: { silent: true } })
}

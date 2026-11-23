// Local persistence. The envelope lives in IndexedDB in the browser and in a
// Tauri store file on the desktop build, so the vault survives reloads on both.
// The unlocked DEK only ever goes to sessionStorage (cleared when the tab or
// window closes), never to persistent storage.
import { load } from '@tauri-apps/plugin-store'
import { del, get, set } from 'idb-keyval'
import type { VaultEnvelope } from './types'

const ENVELOPE_KEY = 'vault:envelope'
const TAURI_FILE = 'vault.json'
const TAURI_KEY = 'envelope'
const SESSION_DEK = 'vault:dek'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Read the stored envelope. Tauri failures (missing plugin, locked store) fall
 * back to IndexedDB so a desktop build never loses access to a vault the webview
 * can still see.
 */
export async function readLocalEnvelope(): Promise<string | null> {
  if (isTauri()) {
    try {
      const store = await load(TAURI_FILE, { autoSave: false })
      const value = await store.get<string>(TAURI_KEY)
      if (typeof value === 'string') return value
    } catch {
      // fall through to IndexedDB
    }
  }
  const value = await get<string>(ENVELOPE_KEY)
  return typeof value === 'string' ? value : null
}

export async function writeLocalEnvelope(raw: string): Promise<void> {
  if (isTauri()) {
    try {
      const store = await load(TAURI_FILE, { autoSave: false })
      await store.set(TAURI_KEY, raw)
      await store.save()
      return
    } catch {
      // fall through to IndexedDB
    }
  }
  await set(ENVELOPE_KEY, raw)
}

export async function clearLocalEnvelope(): Promise<void> {
  if (isTauri()) {
    try {
      const store = await load(TAURI_FILE, { autoSave: false })
      await store.delete(TAURI_KEY)
      await store.save()
    } catch {
      // IndexedDB cleanup below still runs
    }
  }
  await del(ENVELOPE_KEY)
}

export function readSessionDek(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(SESSION_DEK)
}

export function writeSessionDek(value: string): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(SESSION_DEK, value)
}

export function clearSessionDek(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(SESSION_DEK)
}

/** Parse a stored envelope, or return null when the stored value is unusable. */
export function parseEnvelope(raw: string | null): VaultEnvelope | null {
  if (!raw) return null
  try {
    const env = JSON.parse(raw) as VaultEnvelope
    if (!env || env.v !== 1 || !env.data || !env.wrappedKey || !env.dataIv || !env.wrapIv || !env.salt) return null
    return env
  } catch {
    return null
  }
}

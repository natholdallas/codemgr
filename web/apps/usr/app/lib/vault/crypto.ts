// Client-side envelope crypto. WebCrypto only: no dependency, no Node API, so
// the same code runs in the browser and inside the Tauri webview.
//
// Layout: PBKDF2-SHA256(master, salt) -> KEK (AES-GCM, non-extractable)
//         random 32-byte DEK, wrapped by the KEK
//         doc JSON encrypted by the DEK with a fresh 12-byte IV per save
//
// Changing the master password re-wraps the same DEK, so the ciphertext (and
// every other device's copy) stays readable.
import { DOC_VERSION } from './types'
import type { VaultDoc, VaultEnvelope } from './types'

export const KDF_ITERATIONS = 600_000

const AAD = new TextEncoder().encode('codemgr-vault-v1')
const SALT_BYTES = 16
const IV_BYTES = 12

export const WRONG_PASSWORD = 'vault:wrong-password'
export const CORRUPT = 'vault:corrupt'

// Chunked base64: String.fromCharCode(...bytes) blows the call stack on
// multi-megabyte documents, which a vault easily reaches.
const CHUNK = 0x8000

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

async function deriveKek(master: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(new TextEncoder().encode(master)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: buf(salt), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function encryptDoc(dek: CryptoKey, doc: VaultDoc, iv: Uint8Array): Promise<string> {
  const plain = new TextEncoder().encode(JSON.stringify(doc))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: AAD }, dek, buf(plain))
  return toBase64(new Uint8Array(cipher))
}

async function decryptDoc(dek: CryptoKey, iv: Uint8Array, data: string): Promise<VaultDoc> {
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: AAD }, dek, buf(fromBase64(data)))
  } catch {
    throw new Error(CORRUPT)
  }
  try {
    const doc = JSON.parse(new TextDecoder().decode(plain)) as VaultDoc
    if (!doc || (doc.v !== 1 && doc.v !== 2 && doc.v !== DOC_VERSION) || !Array.isArray(doc.spaces) || !Array.isArray(doc.entries)) {
      throw new Error(CORRUPT)
    }
    return doc
  } catch {
    throw new Error(CORRUPT)
  }
}

async function wrapDek(dek: CryptoKey, master: string, iterations: number, salt: Uint8Array, iv: Uint8Array) {
  const kek = await deriveKek(master, salt, iterations)
  const raw = await crypto.subtle.exportKey('raw', dek)
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: AAD }, kek, raw)
  return toBase64(new Uint8Array(wrapped))
}

async function unwrapDek(wrappedKey: string, master: string, iterations: number, salt: Uint8Array, iv: Uint8Array) {
  const kek = await deriveKek(master, salt, iterations)
  let raw: ArrayBuffer
  try {
    raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: AAD }, kek, buf(fromBase64(wrappedKey)))
  } catch {
    // Anything failing at the unwrap step means the master password does not
    // match this envelope; the ciphertext was never touched.
    throw new Error(WRONG_PASSWORD)
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

/** Create a brand-new envelope for `doc`, returning the DEK for this session. */
export async function createEnvelope(doc: VaultDoc, master: string): Promise<{ envelope: VaultEnvelope; dek: CryptoKey }> {
  const iterations = KDF_ITERATIONS
  const salt = randomBytes(SALT_BYTES)
  const wrapIv = randomBytes(IV_BYTES)
  const dataIv = randomBytes(IV_BYTES)
  const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const wrappedKey = await wrapDek(dek, master, iterations, salt, wrapIv)
  const data = await encryptDoc(dek, doc, dataIv)
  return {
    envelope: {
      v: 1,
      alg: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations,
      salt: toBase64(salt),
      wrapIv: toBase64(wrapIv),
      wrappedKey,
      dataIv: toBase64(dataIv),
      data,
    },
    dek,
  }
}

/** Unwrap the DEK with the master password and decrypt the document. */
export async function unlockEnvelope(env: VaultEnvelope, master: string): Promise<{ doc: VaultDoc; dek: CryptoKey }> {
  const dek = await unwrapDek(env.wrappedKey, master, env.iterations || KDF_ITERATIONS, fromBase64(env.salt), fromBase64(env.wrapIv))
  return { doc: await decryptDoc(dek, fromBase64(env.dataIv), env.data), dek }
}

/** Re-encrypt `doc` with a fresh data IV, keeping the wrapped DEK untouched. */
export async function sealEnvelope(env: VaultEnvelope, doc: VaultDoc, dek: CryptoKey): Promise<VaultEnvelope> {
  const dataIv = randomBytes(IV_BYTES)
  return { ...env, dataIv: toBase64(dataIv), data: await encryptDoc(dek, doc, dataIv) }
}

/** Re-wrap the same DEK under a new master password; ciphertext stays valid. */
export async function rewrapEnvelope(env: VaultEnvelope, dek: CryptoKey, master: string): Promise<VaultEnvelope> {
  const iterations = KDF_ITERATIONS
  const salt = randomBytes(SALT_BYTES)
  const wrapIv = randomBytes(IV_BYTES)
  const wrappedKey = await wrapDek(dek, master, iterations, salt, wrapIv)
  return { ...env, iterations, salt: toBase64(salt), wrapIv: toBase64(wrapIv), wrappedKey }
}

/** Decrypt a fetched envelope with an already-unlocked DEK. */
export async function decryptWithDek(env: VaultEnvelope, dek: CryptoKey): Promise<VaultDoc> {
  return decryptDoc(dek, fromBase64(env.dataIv), env.data)
}

/** Export the DEK for session auto-unlock (sessionStorage only). */
export async function exportDek(dek: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', dek)))
}

export async function importDek(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', buf(fromBase64(b64)), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

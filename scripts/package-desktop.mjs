#!/usr/bin/env node
/**
 * Collects the Tauri desktop installers produced by `pnpm -F usr package`, copies
 * them into the download site, and rewrites public/releases.json with fresh
 * checksums.
 *
 * Usage: node scripts/package-desktop.mjs [--skip-build]
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const usrDir = join(root, 'web', 'apps', 'usr')
const tauriDir = join(usrDir, 'src-tauri')
const bundleRoot = join(tauriDir, 'target', 'release', 'bundle')
const bundleDirs = ['appimage', 'deb', 'msi', 'nsis'].map((dir) => join(bundleRoot, dir))
const outDir = join(root, 'web', 'apps', 'download', 'public', 'downloads')
const manifestPath = join(root, 'web', 'apps', 'download', 'public', 'releases.json')
const tauriConfPath = join(tauriDir, 'tauri.conf.json')
const WEB_URL = 'https://codemgr.hnath.club'
const EXTENSIONS = ['.appimage', '.deb', '.msi', '.exe']

const skipBuild = process.argv.includes('--skip-build')

function run(command, args) {
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    return { version: '0.1.0', releasedAt: '', webUrl: WEB_URL, files: [] }
  }
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return {
      version: parsed.version ?? '0.1.0',
      releasedAt: parsed.releasedAt ?? '',
      webUrl: parsed.webUrl ?? WEB_URL,
      files: Array.isArray(parsed.files) ? parsed.files : [],
    }
  } catch {
    return { version: '0.1.0', releasedAt: '', webUrl: WEB_URL, files: [] }
  }
}

function scanBundle() {
  const found = []
  for (const dir of bundleDirs) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const name = entry.name.toLowerCase()
      if (EXTENSIONS.some((ext) => name.endsWith(ext))) found.push(join(dir, entry.name))
    }
  }
  return found
}

function readVersion(fallback) {
  try {
    const conf = JSON.parse(readFileSync(tauriConfPath, 'utf8'))
    return conf.version ?? fallback
  } catch {
    return fallback
  }
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

if (!skipBuild) {
  try {
    run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['-F', 'usr', 'package'])
  } catch (error) {
    console.error('Tauri build failed; installers were not collected.')
    process.exit(typeof error.status === 'number' ? error.status : 1)
  }
}

const previous = readManifest()
const installers = scanBundle()

mkdirSync(outDir, { recursive: true })

const files = new Map()
for (const installer of installers) {
  const name = basename(installer)
  const bytes = readFileSync(installer)
  copyFileSync(installer, join(outDir, name))
  files.set(name, {
    name,
    url: `/downloads/${encodeURIComponent(name)}`,
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
}

// Keep previously published entries as long as the copied file is still there.
for (const entry of previous.files) {
  if (!entry || !entry.name || files.has(entry.name)) continue
  if (existsSync(join(outDir, entry.name))) files.set(entry.name, entry)
}

const manifest = {
  version: readVersion(previous.version),
  releasedAt: new Date().toISOString(),
  webUrl: previous.webUrl || WEB_URL,
  files: [...files.values()].sort((a, b) => a.name.localeCompare(b.name)),
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`\nCodemgr Vault ${manifest.version} — ${manifest.releasedAt}`)
if (manifest.files.length === 0) {
  console.log('  (no installers found; the download cards will show "Coming soon")')
} else {
  for (const file of manifest.files) {
    console.log(`  ${file.name}\n    ${mb(file.size)}  sha256 ${file.sha256}`)
  }
}

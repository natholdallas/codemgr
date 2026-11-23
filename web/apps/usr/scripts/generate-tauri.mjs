import { spawn } from 'node:child_process'

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const child = spawn(pnpm, ['run', 'generate'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NUXT_PUBLIC_TAURI: 'true',
    NUXT_PUBLIC_API_BASE: process.env.TAURI_API_BASE || 'https://codemgr.hnath.club',
  },
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('close', (code) => {
  process.exit(code ?? 1)
})

import { spawn } from 'node:child_process'

const debug = process.argv.includes('--debug')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const shell = process.platform === 'win32'

// Narrow the bundle targets per host: RPM/other toolchains are not assumed.
const bundles = process.platform === 'linux' ? 'deb,appimage' : process.platform === 'win32' ? 'nsis,msi' : null

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell,
      env: { ...process.env, ...env },
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

const generateStatus = await run(pnpm, ['run', 'generate:tauri'])
if (generateStatus !== 0) process.exit(generateStatus)

const args = ['exec', 'tauri', 'build']
if (debug) args.push('--debug')
if (bundles) args.push('--bundles', bundles)

const buildStatus = await run(pnpm, args, { NO_STRIP: 'true' })
process.exit(buildStatus)

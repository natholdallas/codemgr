// Browser download helper for plaintext TOML exports. Lives outside the
// components so the vault layout and the settings page write identical files
// (same slug rules, same fallback name).
export function downloadTomlFile(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'vault'}.toml`
  link.click()
  URL.revokeObjectURL(url)
}

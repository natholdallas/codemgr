// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // src-tauri holds Rust sources and generated Tauri assets; eslint only owns the
  // web app.
  ignores: ['app/lib/sdk/**', 'app/components/ui/**', 'src-tauri/**'],
})
// Your custom configs here

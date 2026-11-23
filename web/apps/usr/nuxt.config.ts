const seoEnabled = process.env.ENABLE_SEO === 'true' ? true : false
// The desktop (Tauri) build loads from the app bundle, so a Service Worker
// adds nothing there and is skipped.
const pwaEnabled = process.env.ENABLE_PWA === 'true' && process.env.NUXT_PUBLIC_TAURI !== 'true'
const tauri = process.env.NUXT_PUBLIC_TAURI === 'true'
const sitemapRoutes = seoEnabled ? ['/sitemap.xml'] : []

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2026-05-27',

  // Declare the runtime config shape so `useRuntimeConfig().public.apiBase` is
  // typed as a string. The value itself comes from NUXT_PUBLIC_API_BASE at build
  // time (main.sh derives it from domains[]/app_env); an empty default means
  // "same origin", which is what a reverse-proxied deployment wants.
  runtimeConfig: {
    public: {
      apiBase: '',
    },
  },

  // dev
  devtools: {
    enabled: false,
  },
  devServer: {
    port: 3000,
  },

  // Tauri has no history fallback, so the desktop build uses hash routing.
  router: {
    options: { hashMode: tauri },
  },

  css: [
    // css
    '~/assets/main.css',
    '~/assets/fonts.css',
    '~/assets/tailwind.css',
    '~/assets/transition.css',
    '~/assets/utilities.css',
  ],
  modules: [
    // modules
    '@natholdallas/alova',
    '@natholdallas/i18n',
    '@natholdallas/infra',
    '@natholdallas/pinia',
    '@natholdallas/shadcn',
    '@natholdallas/tauri',
  ],
  imports: {
    presets: [
      {
        from: 'lodash',
        imports: ['isArray', 'isEmpty', 'cloneDeep', 'toNumber'],
      },
    ],
  },

  app: {
    rootAttrs: { id: 'root' },
    head: {
      meta: [
        // meta
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      // Linked here rather than through the PWA module's component so the
      // desktop (PWA-disabled) build never references its virtual modules.
      link: pwaEnabled ? [{ rel: 'manifest', href: '/manifest.webmanifest' }] : [],
    },
  },

  i18n: {
    strategy: 'no_prefix',
    locales: [
      {
        code: 'en-US',
        language: 'en-US',
        name: 'English',
        file: { path: 'en_us.ts', cache: true },
      },
      {
        code: 'zh-CN',
        language: 'zh-CN',
        name: 'Chinese',
        file: { path: 'zh_cn.ts', cache: true },
      },
    ],
    defaultLocale: 'en-US',
    skipSettingLocaleOnNavigate: false,
    autoDeclare: true,
    langDir: 'locale',
    restructureDir: 'app',
    experimental: {
      typedOptionsAndMessages: 'default',
    },
    detectBrowserLanguage: {
      useCookie: true,
      fallbackLocale: 'en-US',
    },
  },

  site: {
    // enabled: seoEnabled,
    // url: 'https://example.com',
    indexable: seoEnabled,
  },

  seo: {
    enabled: seoEnabled,
    meta: {
      description: '',
    },
  },

  sitemap: {
    enabled: seoEnabled,
  },

  schemaOrg: {
    enabled: seoEnabled,
  },

  // Installable web app: the shell is cached so a vault unlocked once can be
  // opened again without a network. The vault itself already lives in
  // IndexedDB (encrypted), so offline only needs the app code.
  pwa: {
    disable: !pwaEnabled,
    registerType: 'autoUpdate',
    manifest: {
      name: 'Codemgr Vault',
      short_name: 'Codemgr',
      description: 'End-to-end encrypted, offline-first password manager',
      theme_color: '#0a0a0a',
      background_color: '#0a0a0a',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [
        { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      // Must match the precached shell URL: with a directory index the
      // generated manifest stores index.html under "/".
      navigateFallback: '/',
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
    },
  },

  nitro: {
    compressPublicAssets: true,
    output: {
      dir: 'dist',
      publicDir: 'dist/public',
      serverDir: 'dist/server',
    },
    prerender: {
      routes: [...sitemapRoutes],
    },
  },
})

const seoEnabled = process.env.ENABLE_SEO === 'true' ? true : false
const pwaEnabled = process.env.ENABLE_PWA === 'true' ? true : false
const sitemapRoutes = seoEnabled ? ['/sitemap.xml'] : []

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2026-05-27',

  // dev
  devtools: {
    enabled: false,
  },
  devServer: {
    port: 3002,
  },

  css: [
    // css
    '~/assets/main.css',
    '~/assets/fonts.css',
    '~/assets/tailwind.css',
    '~/assets/transition.css',
    '~/assets/utilities.css',
  ],

  // Tailwind 4 emits modern CSS (`oklch(from …)` relative colors, nested
  // `calc()` inside `var()` fallbacks) that cssnano's postcss-calc transform
  // cannot parse; the parser only logs warnings and leaves the rule untouched.
  // Disable just that transform — the rest of the minification stays on.
  postcss: {
    plugins: {
      cssnano: { preset: ['default', { calc: false }] },
    },
  },

  vite: {
    build: {
      // Rolldown reports per-plugin build time on every production build; it is
      // diagnostic output, not a problem in this workspace.
      rolldownOptions: { checks: { pluginTimings: false } },
    },
  },

  modules: [
    // modules
    '@natholdallas/i18n',
    '@natholdallas/infra',
    '@natholdallas/shadcn',
  ],

  app: {
    rootAttrs: { id: 'root' },
    head: {
      title: 'Codemgr Vault',
      meta: [
        // meta
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'End-to-end encrypted, offline-first password manager for Linux, Windows and the web.',
        },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' }],
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

  pwa: {
    disable: !pwaEnabled,
    manifest: {
      name: 'Codemgr Vault',
      short_name: 'Codemgr Vault',
      theme_color: '#0a0a0a',
      description: 'End-to-end encrypted, offline-first password manager',
    },
  },

  nitro: {
    // Off on purpose: the release installers live under public/downloads and are
    // already compressed — gzipping them only doubles the deploy payload.
    compressPublicAssets: false,
    // Upstream nitro/i18n/icon runtime graphs have circular imports; the static
    // preset resolves them fine and Nitro's default handler omits them. Nitro's
    // h3 bridge also re-exports `H3Error`/`H3Event`/`deleteCookie` from the h3
    // v1 external that this preset never calls, which Rolldown flags as unused.
    rollupConfig: {
      onwarn(warning, warn) {
        if (warning.code === 'CIRCULAR_DEPENDENCY') return
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT' && /H3Error|deleteCookie/.test(warning.message)) return
        warn(warning)
      },
    },
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

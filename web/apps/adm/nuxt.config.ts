const seoEnabled = process.env.ENABLE_SEO === 'true' ? true : false
const pwaEnabled = process.env.ENABLE_PWA === 'true' ? true : false
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
    port: 3001,
  },

  css: [
    // css
    '~/assets/styles/css/vuetify.css',
    '~/assets/styles/css/tailwind.css',
    '~/assets/styles/css/main.css',
    '~/assets/styles/css/fonts.css',
    '~/assets/styles/css/transition.css',
    '~/assets/styles/css/utilities.css',
    '~/assets/styles/css/admin.css',
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
    '@natholdallas/alova',
    '@natholdallas/i18n',
    '@natholdallas/infra',
    '@natholdallas/vuetify',
    '@natholdallas/pinia',
    '@natholdallas/tauri',
  ],
  // Deep-merged over the shared module's `moduleDependencies` defaults.
  vuetify: {
    vuetifyOptions: {
      theme: {
        defaultTheme: 'system',
        utilities: true,
        themes: {
          light: {
            dark: false,
            colors: {
              'background': '#F5F6FA',
              'surface': '#FFFFFF',
              'surface-bright': '#FFFFFF',
              'surface-light': '#F8FAFC',
              'surface-variant': '#EEF1F7',
              'on-surface': '#0F172A',
              'on-surface-variant': '#475569',
              'on-background': '#0F172A',
              'primary': '#4F46E5',
              'primary-darken-1': '#4338CA',
              'on-primary': '#FFFFFF',
              'secondary': '#0EA5E9',
              'secondary-darken-1': '#0284C7',
              'on-secondary': '#FFFFFF',
              'accent': '#7C3AED',
              'error': '#E11D48',
              'on-error': '#FFFFFF',
              'info': '#0284C7',
              'on-info': '#FFFFFF',
              'success': '#059669',
              'on-success': '#FFFFFF',
              'warning': '#D97706',
              'on-warning': '#FFFFFF',
            },
          },
          dark: {
            dark: true,
            colors: {
              'background': '#080B14',
              'surface': '#0F1526',
              'surface-bright': '#16203A',
              'surface-light': '#0C1220',
              'surface-variant': '#1B2338',
              'on-surface': '#E2E8F0',
              'on-surface-variant': '#94A3B8',
              'on-background': '#E2E8F0',
              'primary': '#818CF8',
              'primary-darken-1': '#6366F1',
              'on-primary': '#0B1020',
              'secondary': '#38BDF8',
              'secondary-darken-1': '#0EA5E9',
              'on-secondary': '#0B1020',
              'accent': '#A78BFA',
              'error': '#FB7185',
              'on-error': '#0B1020',
              'info': '#38BDF8',
              'on-info': '#0B1020',
              'success': '#34D399',
              'on-success': '#0B1020',
              'warning': '#FBBF24',
              'on-warning': '#0B1020',
            },
          },
        },
      },
    },
  },

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
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
      ],
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
      name: 'Codemgr Admin',
      short_name: 'Codemgr Adm',
      theme_color: '#0a0a0a',
      description: 'Codemgr administration console',
    },
  },

  nitro: {
    compressPublicAssets: true,
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

<script setup lang="ts">
import {
  Apple,
  ArrowRight,
  Boxes,
  Check,
  CloudOff,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  Globe,
  KeyRound,
  Lock,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tags,
  Terminal,
} from '@lucide/vue'

definePageMeta({ name: 'index' })

type DesktopPlatform = 'linux' | 'windows' | 'macos' | 'android'

interface ReleaseFile {
  name: string
  url: string
  size: number
  sha256: string
}

interface ReleaseManifest {
  version: string
  releasedAt: string
  webUrl: string
  files: ReleaseFile[]
}

const EMPTY_MANIFEST: ReleaseManifest = {
  version: '',
  releasedAt: '',
  webUrl: 'https://codemgr.hnath.club',
  files: [],
}

const FILE_KINDS: Record<string, string> = {
  appimage: 'AppImage',
  apk: 'APK',
  deb: 'DEB',
  dmg: 'DMG',
  exe: 'EXE',
  msi: 'MSI',
}

const manifest = ref<ReleaseManifest>({ ...EMPTY_MANIFEST })
const recommended = ref<DesktopPlatform | null>(null)

// The hero CTA points at the same section as the cards but names the platform the
// visitor is on — unless that platform has no build yet, where the generic
// "Installation" label avoids promising a download that is not there.
const heroCta = computed(() => {
  if (recommended.value === 'windows' && windowsFiles.value.length) return $t('download.windows')
  if (recommended.value === 'macos' && macosFiles.value.length) return $t('download.macos')
  if (recommended.value === 'android' && androidFiles.value.length) return $t('download.android')
  if (recommended.value === 'linux' && linuxFiles.value.length) return $t('download.linux')
  return $t('download.install')
})

const version = computed(() => manifest.value.version || '0.1.0')
const webUrl = computed(() => manifest.value.webUrl || EMPTY_MANIFEST.webUrl)

const linuxFiles = computed(() => manifest.value.files.filter((file) => platformOf(file.name) === 'linux'))
const windowsFiles = computed(() => manifest.value.files.filter((file) => platformOf(file.name) === 'windows'))
const macosFiles = computed(() => manifest.value.files.filter((file) => platformOf(file.name) === 'macos'))
const androidFiles = computed(() => manifest.value.files.filter((file) => platformOf(file.name) === 'android'))

const trust = [
  { key: 'download.feature.e2e', icon: ShieldCheck },
  { key: 'download.feature.offline', icon: CloudOff },
  { key: 'download.feature.desktop', icon: Monitor },
] as const

const features = [
  { key: 'download.feature.e2e', icon: ShieldCheck },
  { key: 'download.feature.records', icon: Boxes },
  { key: 'download.feature.offline', icon: CloudOff },
  { key: 'download.feature.account', icon: KeyRound },
  { key: 'download.feature.toml', icon: FileCode },
  { key: 'download.feature.spaces', icon: Tags },
  { key: 'download.feature.sync', icon: RefreshCw },
  { key: 'download.feature.desktop', icon: Monitor },
] as const

const securityBullets = [
  'download.feature.e2e',
  'download.security.zero',
  'download.feature.records',
  'download.feature.offline',
  'download.feature.sync',
] as const

function platformOf(name: string): DesktopPlatform | null {
  const file = name.toLowerCase()
  if (file.endsWith('.appimage') || file.endsWith('.deb')) return 'linux'
  if (file.endsWith('.msi') || file.endsWith('.exe')) return 'windows'
  if (file.endsWith('.dmg')) return 'macos'
  if (file.endsWith('.apk')) return 'android'
  return null
}

function fileKind(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return FILE_KINDS[ext] ?? ext.toUpperCase()
}

function fileSize(file: ReleaseFile) {
  return (file.size / 1024 / 1024).toFixed(1)
}

function shortHash(hash: string) {
  if (!hash) return '—'
  return hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash
}

onMounted(async () => {
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) recommended.value = 'windows'
  else if (/Android/i.test(ua)) recommended.value = 'android'
  else if (/Macintosh|Mac OS X/i.test(ua)) recommended.value = 'macos'
  else if (/Linux/i.test(ua)) recommended.value = 'linux'

  try {
    const data = await $fetch<Partial<ReleaseManifest>>('/releases.json')
    if (!data) return
    manifest.value = {
      version: data.version ?? '',
      releasedAt: data.releasedAt ?? '',
      webUrl: data.webUrl ?? EMPTY_MANIFEST.webUrl,
      files: Array.isArray(data.files) ? data.files : [],
    }
  } catch {
    // A missing or broken manifest simply keeps the "coming soon" state.
  }
})
</script>

<template>
  <div>
    <!-- hero -->
    <section class="relative overflow-hidden border-b">
      <div aria-hidden="true" class="pointer-events-none absolute inset-0">
        <div class="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div class="absolute -top-32 -right-24 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div class="absolute -bottom-40 -left-24 size-80 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div class="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
        <div class="flex flex-col items-start gap-6">
          <UiBadge variant="outline" class="gap-1.5">
            <ShieldCheck class="size-3.5" />
            {{ $t('download.feature.e2e') }}
          </UiBadge>

          <h1 class="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {{ $t('download.hero.title') }}
          </h1>

          <p class="max-w-xl text-base text-muted-foreground sm:text-lg">
            {{ $t('download.hero.desc') }}
          </p>

          <div class="flex flex-col gap-3 sm:flex-row">
            <UiButton as-child size="lg">
              <a href="#download">
                <Download class="size-4" />
                {{ heroCta }}
              </a>
            </UiButton>
            <UiButton as-child size="lg" variant="outline">
              <a :href="webUrl" target="_blank" rel="noopener">
                <Globe class="size-4" />
                {{ $t('download.web') }}
              </a>
            </UiButton>
          </div>

          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock class="size-3.5" />
            <span>{{ version ? $t('download.version', { v: version }) : $t('download.feature.offline') }}</span>
          </div>
        </div>

        <!-- CSS-only vault window mock -->
        <div class="relative hidden md:block">
          <div aria-hidden="true" class="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-primary/10 via-sky-500/5 to-transparent blur-2xl" />
          <div class="relative overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10">
            <div class="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
              <span class="size-2.5 rounded-full bg-rose-400/80" />
              <span class="size-2.5 rounded-full bg-amber-400/80" />
              <span class="size-2.5 rounded-full bg-emerald-400/80" />
              <div class="mx-3 h-5 flex-1 rounded-md border bg-background/70" />
              <Lock class="size-3.5 text-muted-foreground" />
            </div>

            <div class="grid min-h-[320px] grid-cols-[104px_1fr]">
              <div class="space-y-3 border-r bg-muted/20 p-3">
                <div class="flex items-center gap-2">
                  <span class="size-2 rounded-full bg-primary" />
                  <div class="h-2 flex-1 rounded bg-primary/30" />
                </div>
                <div v-for="i in 4" :key="i" class="flex items-center gap-2">
                  <span class="size-2 rounded-full bg-muted-foreground/30" />
                  <div class="h-2 flex-1 rounded bg-muted-foreground/15" />
                </div>
              </div>

              <div class="space-y-3 p-4">
                <div class="flex items-center gap-2">
                  <div class="h-7 flex-1 rounded-md border bg-background/70" />
                  <div class="size-7 rounded-md bg-primary/15" />
                </div>
                <div v-for="i in 4" :key="i" class="flex items-center gap-3 rounded-lg border bg-background/60 p-3">
                  <div class="size-8 rounded-lg bg-muted" />
                  <div class="flex-1 space-y-1.5">
                    <div class="h-2 w-1/3 rounded bg-foreground/20" />
                    <div class="h-2 w-2/3 rounded bg-muted-foreground/15" />
                  </div>
                  <Lock class="size-3.5 text-muted-foreground/40" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- trust strip -->
    <section class="border-b bg-muted/20">
      <div class="mx-auto grid w-full max-w-6xl sm:grid-cols-3">
        <div v-for="item in trust" :key="item.key" class="flex items-center gap-3 px-6 py-5">
          <component :is="item.icon" class="size-4 text-primary" />
          <span class="text-sm font-medium">{{ $t(item.key) }}</span>
        </div>
      </div>
    </section>

    <!-- features -->
    <section id="features" class="border-b">
      <div class="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <div class="max-w-2xl">
          <h2 class="text-3xl font-bold tracking-tight">{{ $t('download.features') }}</h2>
          <p class="mt-3 text-muted-foreground">{{ $t('download.hero.desc') }}</p>
        </div>

        <div class="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <UiCard
            v-for="feature in features"
            :key="feature.key"
            class="group transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <UiCardHeader>
              <span class="grid size-10 place-items-center rounded-lg bg-muted text-primary">
                <component :is="feature.icon" class="size-5" />
              </span>
              <UiCardTitle class="mt-4 text-base">{{ $t(feature.key) }}</UiCardTitle>
            </UiCardHeader>
            <UiCardContent>
              <p class="text-sm text-muted-foreground">{{ $t(`${feature.key}.desc`) }}</p>
            </UiCardContent>
          </UiCard>
        </div>
      </div>
    </section>

    <!-- highlights -->
    <section id="highlights" class="border-b bg-muted/20">
      <div class="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <div class="max-w-2xl">
          <h2 class="text-3xl font-bold tracking-tight">{{ $t('download.highlights') }}</h2>
          <p class="mt-3 text-muted-foreground">{{ $t('download.highlights.desc') }}</p>
        </div>

        <div class="mt-10 grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          <div v-for="feature in features" :key="`hl-${feature.key}`" class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary shadow-sm">
              <component :is="feature.icon" class="size-4" />
            </span>
            <div>
              <p class="text-sm font-medium">{{ $t(feature.key) }}</p>
              <p class="mt-1 text-sm text-muted-foreground">{{ $t(`${feature.key}.desc`) }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- download -->
    <section id="download" class="border-b">
      <div class="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <div class="max-w-2xl">
          <h2 class="text-3xl font-bold tracking-tight">{{ $t('download.install') }}</h2>
          <p class="mt-3 text-muted-foreground">
            {{ $t('download.web') }} · {{ $t('download.linux') }} · {{ $t('download.windows') }} · {{ $t('download.macos') }} ·
            {{ $t('download.android') }}
          </p>
        </div>

        <div class="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <!-- linux -->
          <UiCard class="flex flex-col">
            <UiCardHeader>
              <div class="flex items-start justify-between gap-2">
                <span class="grid size-10 place-items-center rounded-lg bg-muted">
                  <Terminal class="size-5" />
                </span>
                <UiBadge v-if="recommended === 'linux'" variant="secondary">
                  {{ $t('download.recommended') }}
                </UiBadge>
              </div>
              <UiCardTitle class="mt-4 text-base">{{ $t('download.linux') }}</UiCardTitle>
              <UiCardDescription>{{ $t('download.version', { v: version }) }}</UiCardDescription>
            </UiCardHeader>

            <UiCardContent class="flex flex-1 flex-col gap-3">
              <template v-if="linuxFiles.length">
                <div v-for="file in linuxFiles" :key="file.name" class="rounded-lg border bg-background/60 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <UiBadge variant="outline">{{ fileKind(file.name) }}</UiBadge>
                    <span class="text-xs text-muted-foreground">
                      {{ $t('download.size', { size: fileSize(file) }) }}
                    </span>
                  </div>
                  <div class="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span class="shrink-0 font-medium">{{ $t('download.sha') }}</span>
                    <span class="truncate font-mono">{{ shortHash(file.sha256) }}</span>
                    <UixCopyable :text="file.sha256" :aria-label="$t('download.sha')" class="size-6 shrink-0 px-0">
                      <Copy class="size-3.5" />
                    </UixCopyable>
                  </div>
                  <UiButton as-child size="sm" class="mt-3 w-full">
                    <a :href="file.url" download>
                      <Download class="size-4" />
                      {{ fileKind(file.name) }}
                    </a>
                  </UiButton>
                </div>
              </template>
              <div v-else class="flex flex-1 items-center">
                <UiButton disabled variant="secondary" class="w-full">
                  {{ $t('download.coming.soon') }}
                </UiButton>
              </div>
            </UiCardContent>
          </UiCard>

          <!-- windows -->
          <UiCard class="flex flex-col">
            <UiCardHeader>
              <div class="flex items-start justify-between gap-2">
                <span class="grid size-10 place-items-center rounded-lg bg-muted">
                  <Monitor class="size-5" />
                </span>
                <UiBadge v-if="recommended === 'windows'" variant="secondary">
                  {{ $t('download.recommended') }}
                </UiBadge>
              </div>
              <UiCardTitle class="mt-4 text-base">{{ $t('download.windows') }}</UiCardTitle>
              <UiCardDescription>{{ $t('download.version', { v: version }) }}</UiCardDescription>
            </UiCardHeader>

            <UiCardContent class="flex flex-1 flex-col gap-3">
              <template v-if="windowsFiles.length">
                <div v-for="file in windowsFiles" :key="file.name" class="rounded-lg border bg-background/60 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <UiBadge variant="outline">{{ fileKind(file.name) }}</UiBadge>
                    <span class="text-xs text-muted-foreground">
                      {{ $t('download.size', { size: fileSize(file) }) }}
                    </span>
                  </div>
                  <div class="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span class="shrink-0 font-medium">{{ $t('download.sha') }}</span>
                    <span class="truncate font-mono">{{ shortHash(file.sha256) }}</span>
                    <UixCopyable :text="file.sha256" :aria-label="$t('download.sha')" class="size-6 shrink-0 px-0">
                      <Copy class="size-3.5" />
                    </UixCopyable>
                  </div>
                  <UiButton as-child size="sm" class="mt-3 w-full">
                    <a :href="file.url" download>
                      <Download class="size-4" />
                      {{ fileKind(file.name) }}
                    </a>
                  </UiButton>
                </div>
              </template>
              <div v-else class="flex flex-1 items-center">
                <UiButton disabled variant="secondary" class="w-full">
                  {{ $t('download.coming.soon') }}
                </UiButton>
              </div>
            </UiCardContent>
          </UiCard>

          <!-- macos -->
          <UiCard class="flex flex-col">
            <UiCardHeader>
              <div class="flex items-start justify-between gap-2">
                <span class="grid size-10 place-items-center rounded-lg bg-muted">
                  <Apple class="size-5" />
                </span>
                <UiBadge v-if="recommended === 'macos'" variant="secondary">
                  {{ $t('download.recommended') }}
                </UiBadge>
              </div>
              <UiCardTitle class="mt-4 text-base">{{ $t('download.macos') }}</UiCardTitle>
              <UiCardDescription>{{ $t('download.version', { v: version }) }}</UiCardDescription>
            </UiCardHeader>

            <UiCardContent class="flex flex-1 flex-col gap-3">
              <template v-if="macosFiles.length">
                <div v-for="file in macosFiles" :key="file.name" class="rounded-lg border bg-background/60 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <UiBadge variant="outline">{{ fileKind(file.name) }}</UiBadge>
                    <span class="text-xs text-muted-foreground">
                      {{ $t('download.size', { size: fileSize(file) }) }}
                    </span>
                  </div>
                  <div class="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span class="shrink-0 font-medium">{{ $t('download.sha') }}</span>
                    <span class="truncate font-mono">{{ shortHash(file.sha256) }}</span>
                    <UixCopyable :text="file.sha256" :aria-label="$t('download.sha')" class="size-6 shrink-0 px-0">
                      <Copy class="size-3.5" />
                    </UixCopyable>
                  </div>
                  <UiButton as-child size="sm" class="mt-3 w-full">
                    <a :href="file.url" download>
                      <Download class="size-4" />
                      {{ fileKind(file.name) }}
                    </a>
                  </UiButton>
                </div>
                <p class="text-xs text-muted-foreground">{{ $t('download.macos.note') }}</p>
              </template>
              <div v-else class="flex flex-1 items-center">
                <UiButton disabled variant="secondary" class="w-full">
                  {{ $t('download.coming.soon') }}
                </UiButton>
              </div>
            </UiCardContent>
          </UiCard>

          <!-- android -->
          <UiCard class="flex flex-col">
            <UiCardHeader>
              <div class="flex items-start justify-between gap-2">
                <span class="grid size-10 place-items-center rounded-lg bg-muted">
                  <Smartphone class="size-5" />
                </span>
                <UiBadge v-if="recommended === 'android'" variant="secondary">
                  {{ $t('download.recommended') }}
                </UiBadge>
              </div>
              <UiCardTitle class="mt-4 text-base">{{ $t('download.android') }}</UiCardTitle>
              <UiCardDescription>{{ $t('download.version', { v: version }) }}</UiCardDescription>
            </UiCardHeader>

            <UiCardContent class="flex flex-1 flex-col gap-3">
              <template v-if="androidFiles.length">
                <div v-for="file in androidFiles" :key="file.name" class="rounded-lg border bg-background/60 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <UiBadge variant="outline">{{ fileKind(file.name) }}</UiBadge>
                    <span class="text-xs text-muted-foreground">
                      {{ $t('download.size', { size: fileSize(file) }) }}
                    </span>
                  </div>
                  <div class="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span class="shrink-0 font-medium">{{ $t('download.sha') }}</span>
                    <span class="truncate font-mono">{{ shortHash(file.sha256) }}</span>
                    <UixCopyable :text="file.sha256" :aria-label="$t('download.sha')" class="size-6 shrink-0 px-0">
                      <Copy class="size-3.5" />
                    </UixCopyable>
                  </div>
                  <UiButton as-child size="sm" class="mt-3 w-full">
                    <a :href="file.url" download>
                      <Download class="size-4" />
                      {{ fileKind(file.name) }}
                    </a>
                  </UiButton>
                </div>
                <p class="text-xs text-muted-foreground">{{ $t('download.android.note') }}</p>
              </template>
              <div v-else class="flex flex-1 items-center">
                <UiButton disabled variant="secondary" class="w-full">
                  {{ $t('download.coming.soon') }}
                </UiButton>
              </div>
            </UiCardContent>
          </UiCard>

          <!-- web -->
          <UiCard class="flex flex-col">
            <UiCardHeader>
              <span class="grid size-10 place-items-center rounded-lg bg-muted">
                <Globe class="size-5" />
              </span>
              <UiCardTitle class="mt-4 text-base">{{ $t('download.web') }}</UiCardTitle>
              <UiCardDescription>{{ $t('download.web.offline') }}</UiCardDescription>
            </UiCardHeader>

            <UiCardContent class="flex flex-1 flex-col justify-end">
              <UiButton as-child class="w-full">
                <a :href="webUrl" target="_blank" rel="noopener">
                  <ExternalLink class="size-4" />
                  {{ $t('download.web') }}
                </a>
              </UiButton>
            </UiCardContent>
          </UiCard>
        </div>
      </div>
    </section>

    <!-- security -->
    <section id="security" class="border-b bg-muted/20">
      <div class="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
        <div class="flex flex-col gap-6">
          <h2 class="text-3xl font-bold tracking-tight">{{ $t('download.security') }}</h2>
          <p class="text-muted-foreground">{{ $t('download.hero.desc') }}</p>

          <ul class="flex flex-col gap-3">
            <li v-for="bullet in securityBullets" :key="bullet" class="flex items-start gap-3">
              <span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Check class="size-3" />
              </span>
              <span class="text-sm">{{ $t(bullet) }}</span>
            </li>
          </ul>
        </div>

        <UiCard class="h-fit">
          <UiCardHeader>
            <div class="flex items-center gap-2">
              <span class="grid size-9 place-items-center rounded-lg bg-muted">
                <ShieldCheck class="size-4" />
              </span>
              <UiCardTitle class="text-base">{{ $t('download.feature.e2e') }}</UiCardTitle>
            </div>
          </UiCardHeader>
          <UiCardContent>
            <dl class="divide-y text-sm">
              <div class="flex items-center justify-between gap-4 py-3">
                <dt class="text-muted-foreground">Cipher</dt>
                <dd class="font-mono">AES-256-GCM</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-3">
                <dt class="text-muted-foreground">KDF</dt>
                <dd class="font-mono">PBKDF2-SHA256</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-3">
                <dt class="text-muted-foreground">Iterations</dt>
                <dd class="font-mono">600,000</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-3">
                <dt class="text-muted-foreground">Envelope</dt>
                <dd class="font-mono">JSON</dd>
              </div>
            </dl>
          </UiCardContent>
        </UiCard>
      </div>
    </section>

    <!-- faq -->
    <section id="faq">
      <div class="mx-auto w-full max-w-4xl px-4 py-16 md:py-24">
        <h2 class="text-3xl font-bold tracking-tight">{{ $t('download.faq') }}</h2>

        <UiAccordion type="single" collapsible class="mt-8 w-full">
          <UiAccordionItem value="install">
            <UiAccordionTrigger>{{ $t('download.install') }}</UiAccordionTrigger>
            <UiAccordionContent>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="flex items-center gap-3">
                  <Terminal class="size-4 text-muted-foreground" />
                  <div>
                    <p class="font-medium">{{ $t('download.linux') }}</p>
                    <p class="text-xs text-muted-foreground">AppImage · DEB</p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <Monitor class="size-4 text-muted-foreground" />
                  <div>
                    <p class="font-medium">{{ $t('download.windows') }}</p>
                    <p class="text-xs text-muted-foreground">MSI · EXE</p>
                  </div>
                </div>
              </div>
              <a href="#download" class="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                {{ $t('download.install') }}
                <ArrowRight class="size-3.5" />
              </a>
            </UiAccordionContent>
          </UiAccordionItem>

          <UiAccordionItem value="requirements">
            <UiAccordionTrigger>{{ $t('download.requirements') }}</UiAccordionTrigger>
            <UiAccordionContent>
              <ul class="list-disc space-y-1 pl-4 text-muted-foreground">
                <li>Windows 10 / 11 (x64)</li>
                <li>Linux x86_64 · AppImage / DEB</li>
                <li>Chrome · Edge · Firefox · Safari</li>
              </ul>
            </UiAccordionContent>
          </UiAccordionItem>

          <UiAccordionItem value="security">
            <UiAccordionTrigger>{{ $t('download.security') }}</UiAccordionTrigger>
            <UiAccordionContent>
              <ul class="list-disc space-y-1 pl-4 text-muted-foreground">
                <li>{{ $t('download.feature.e2e') }}</li>
                <li>{{ $t('download.feature.offline') }}</li>
                <li>{{ $t('download.feature.spaces') }}</li>
              </ul>
            </UiAccordionContent>
          </UiAccordionItem>

          <UiAccordionItem value="offline">
            <UiAccordionTrigger>{{ $t('download.faq.offline') }}</UiAccordionTrigger>
            <UiAccordionContent>
              <p class="text-muted-foreground">{{ $t('download.faq.offline.answer') }}</p>
            </UiAccordionContent>
          </UiAccordionItem>

          <UiAccordionItem value="records">
            <UiAccordionTrigger>{{ $t('download.faq.records') }}</UiAccordionTrigger>
            <UiAccordionContent>
              <p class="text-muted-foreground">{{ $t('download.faq.records.answer') }}</p>
            </UiAccordionContent>
          </UiAccordionItem>

          <UiAccordionItem value="sync">
            <UiAccordionTrigger>{{ $t('download.feature.sync') }}</UiAccordionTrigger>
            <UiAccordionContent>
              <p class="text-muted-foreground">{{ $t('download.feature.toml') }}</p>
              <a :href="webUrl" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                {{ $t('download.web') }}
                <ExternalLink class="size-3.5" />
              </a>
            </UiAccordionContent>
          </UiAccordionItem>
        </UiAccordion>
      </div>
    </section>
  </div>
</template>

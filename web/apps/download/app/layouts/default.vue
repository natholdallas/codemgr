<script setup lang="ts">
import { Languages, Moon, ShieldCheck, Sun } from '@lucide/vue'

const { locale, setLocale } = useI18n()
const isDark = useDark()

const localeLabel = computed(() => (locale.value === 'zh-CN' ? '中文' : 'English'))

function toggleLocale() {
  setLocale(locale.value === 'zh-CN' ? 'en-US' : 'zh-CN')
}

function toggleTheme() {
  isDark.value = !isDark.value
}

const nav = computed(() => [
  { label: $t('download.features'), href: '#features' },
  { label: $t('download.security'), href: '#security' },
  { label: $t('download.install'), href: '#download' },
  { label: $t('download.faq'), href: '#faq' },
])

const year = new Date().getFullYear()
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div class="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <NuxtLink to="/" class="flex items-center gap-2">
          <span class="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck class="size-5" />
          </span>
          <span class="text-base font-semibold tracking-tight">{{ $t('app.name') }}</span>
        </NuxtLink>

        <nav class="hidden items-center gap-6 md:flex">
          <a v-for="item in nav" :key="item.href" :href="item.href" class="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {{ item.label }}
          </a>
        </nav>

        <div class="flex items-center gap-1">
          <UiButton variant="ghost" size="sm" class="gap-1.5 font-medium" @click="toggleLocale">
            <Languages class="size-4" />
            {{ localeLabel }}
          </UiButton>
          <UiButton variant="ghost" size="icon" @click="toggleTheme">
            <Sun v-if="isDark" class="size-5" />
            <Moon v-else class="size-5" />
          </UiButton>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t bg-muted/30">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-2">
          <span class="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck class="size-4" />
          </span>
          <div>
            <p class="text-sm font-semibold">{{ $t('app.name') }}</p>
            <p class="text-xs text-muted-foreground">{{ $t('download.footer') }}</p>
          </div>
        </div>

        <nav class="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a v-for="item in nav" :key="item.href" :href="item.href" class="text-xs text-muted-foreground transition-colors hover:text-foreground">
            {{ item.label }}
          </a>
        </nav>

        <p class="text-xs text-muted-foreground">© {{ year }} {{ $t('app.name') }}</p>
      </div>
    </footer>
  </div>
</template>

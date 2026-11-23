<script setup lang="ts">
import { ArrowRight, Cloud, Lock, ShieldCheck, WifiOff } from '@lucide/vue'

definePageMeta({
  name: 'unlock',
  middleware: 'unlock',
  layout: 'minimal',
})

const bullets = [
  { icon: Lock, key: 'local.desc' },
  { icon: WifiOff, key: 'unlock.master.hint' },
  { icon: Cloud, key: 'account.desc' },
]
</script>

<template>
  <div class="grid size-full overflow-auto lg:grid-cols-2">
    <aside
      class="relative hidden flex-col justify-between overflow-hidden border-r bg-gradient-to-br from-primary/15 via-background to-background p-10 lg:flex"
    >
      <div
        class="pointer-events-none absolute inset-0 opacity-[0.04]"
        style="
          background-image: linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px);
          background-size: 32px 32px;
        "
      />
      <div class="relative">
        <div class="flex items-center gap-2.5">
          <span class="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck class="size-5" />
          </span>
          <span class="text-lg font-semibold">{{ $t('app.name') }}</span>
        </div>
        <h1 class="mt-12 max-w-sm text-3xl font-semibold tracking-tight">{{ $t('unlock.title') }}</h1>
        <p class="mt-3 max-w-sm text-sm text-muted-foreground">{{ $t('local.desc') }}</p>
      </div>

      <ul class="relative space-y-3">
        <li v-for="item in bullets" :key="item.key" class="flex items-center gap-3 text-sm text-muted-foreground">
          <span class="grid size-8 place-items-center rounded-lg bg-background/70 text-foreground shadow-xs">
            <component :is="item.icon" class="size-4" />
          </span>
          {{ $t(item.key) }}
        </li>
      </ul>
    </aside>

    <main class="flex items-center justify-center p-6">
      <div class="w-full max-w-md space-y-4">
        <div class="flex items-center gap-2.5 lg:hidden">
          <span class="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck class="size-5" />
          </span>
          <span class="text-lg font-semibold">{{ $t('app.name') }}</span>
        </div>

        <VaultUnlockCard />

        <NuxtLink :to="{ name: 'entrance' }" class="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {{ $t('account.local.link') }}
          <ArrowRight class="size-3" />
        </NuxtLink>
      </div>
    </main>
  </div>
</template>

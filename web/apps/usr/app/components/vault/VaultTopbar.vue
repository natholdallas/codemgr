<script setup lang="ts">
import { Menu, Plus, RefreshCw, Search, SlidersHorizontal } from '@lucide/vue'

const emit = defineEmits<{
  'menu': []
  'new-entry': []
}>()

const vault = useVaultStore()
const auth = useAuthStore()
const { query } = storeToRefs(vault)
const filtersOpen = ref(false)
</script>

<template>
  <header class="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/80 px-3 py-2.5 backdrop-blur">
    <UiButton variant="ghost" size="icon" class="md:hidden" @click="emit('menu')">
      <Menu class="size-5" />
    </UiButton>

    <div class="relative min-w-0 flex-1 md:min-w-40">
      <Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <UiInput v-model="query" class="pl-8" :aria-label="$t('vault.search')" />
    </div>

    <UiButton variant="ghost" size="icon" class="md:hidden" :title="$t('vault.filters')" @click="filtersOpen = true">
      <SlidersHorizontal class="size-4" />
    </UiButton>

    <VaultFilters class="hidden md:flex" />

    <div class="flex items-center gap-1">
      <UiButton
        v-if="auth.accessToken"
        variant="ghost"
        size="icon"
        :title="$t('sync.now')"
        :disabled="vault.syncState === 'saving'"
        @click="vault.$syncNow()"
      >
        <RefreshCw :class="['size-4', vault.syncState === 'saving' && 'animate-spin']" />
      </UiButton>

      <UiButton size="sm" :title="$t('vault.entry.new')" @click="emit('new-entry')">
        <Plus class="size-4" />
        <span class="hidden lg:inline">{{ $t('vault.entry.new') }}</span>
      </UiButton>
    </div>
  </header>

  <UiSheet v-model:open="filtersOpen">
    <UiSheetContent side="bottom" class="max-h-[85dvh] gap-0 p-0">
      <UiSheetHeader class="border-b pr-12">
        <UiSheetTitle>{{ $t('vault.filters') }}</UiSheetTitle>
        <UiSheetDescription class="sr-only">{{ $t('vault.filters') }}</UiSheetDescription>
      </UiSheetHeader>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <VaultFilters />
      </div>
      <UiSheetFooter class="border-t">
        <UiButton class="w-full" @click="filtersOpen = false">{{ $t('confirm') }}</UiButton>
      </UiSheetFooter>
    </UiSheetContent>
  </UiSheet>
</template>

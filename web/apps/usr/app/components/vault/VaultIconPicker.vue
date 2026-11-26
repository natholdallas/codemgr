<script setup lang="ts">
import { X } from '@lucide/vue'
import { VAULT_ICONS } from '~/lib/vault/icons'
import { ENTRY_ICONS } from '~/lib/vault/types'

const model = defineModel<string>({ default: '' })

// Clicking the selected icon again clears it: the grid is the whole control, so
// there is nowhere else a "none" state could be chosen.
function pick(name: string) {
  model.value = model.value === name ? '' : name
}
</script>

<template>
  <div class="space-y-2">
    <!-- auto-fill tracks never shrink below the 2rem button, so a narrow dialog
         wraps instead of squeezing the cells into each other, and no row is cut
         off by a fixed-height scroll box. The dialog itself scrolls when tall. -->
    <div class="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1">
      <button
        v-for="name in ENTRY_ICONS"
        :key="name"
        type="button"
        :class="[
          'grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          model === name ? 'bg-accent text-accent-foreground ring-2 ring-ring' : '',
        ]"
        :title="name"
        :aria-label="name"
        @click="pick(name)"
      >
        <component :is="VAULT_ICONS[name]" class="size-4" />
      </button>
    </div>

    <UiButton v-if="model" variant="ghost" size="sm" class="text-muted-foreground" @click="model = ''">
      <X class="size-3.5" />
      {{ $t('vault.icon.clear') }}
    </UiButton>
  </div>
</template>

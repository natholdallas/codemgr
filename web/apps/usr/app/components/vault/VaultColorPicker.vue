<script setup lang="ts">
import { Ban, Check, Pipette } from '@lucide/vue'
import { SPACE_COLORS, isHexColor } from '~/lib/vault/types'

const model = defineModel<string>({ default: '' })
const props = defineProps<{
  // Offer an explicit "no color" choice that falls back to the space color.
  inherit?: boolean
  inheritLabel?: string
}>()

const inPalette = computed(() => (SPACE_COLORS as readonly string[]).includes(model.value))
// A previously picked custom hex must stay visible and selected, so the swatch
// mirrors the current value instead of resetting to a fixed default.
const custom = computed(() => (model.value && !inPalette.value ? model.value : '#6366f1'))
const customActive = computed(() => !!model.value && !inPalette.value)

function onCustom(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (isHexColor(value)) model.value = value.toLowerCase()
}
</script>

<template>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(1.75rem,1fr))] gap-1.5">
    <button
      v-if="props.inherit"
      type="button"
      :class="[
        'grid size-7 place-items-center rounded-full border border-dashed text-muted-foreground transition-colors ring-offset-2 ring-offset-background hover:bg-accent hover:text-accent-foreground',
        model === '' ? 'ring-2 ring-ring' : '',
      ]"
      :title="props.inheritLabel"
      :aria-label="props.inheritLabel"
      @click="model = ''"
    >
      <Ban class="size-3.5" />
    </button>

    <button
      v-for="color in SPACE_COLORS"
      :key="color"
      type="button"
      :class="[
        'grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform',
        model === color ? 'ring-2 ring-ring' : 'hover:scale-110',
      ]"
      :style="{ backgroundColor: color }"
      :title="color"
      :aria-label="color"
      @click="model = color"
    >
      <Check v-if="model === color" class="size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]" />
    </button>

    <!-- Native picker: any hex is valid, and the ring shows the chosen value
         rather than a fixed swatch of the palette's own colors. -->
    <label
      :class="[
        'relative grid size-7 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform',
        customActive ? 'ring-2 ring-ring' : 'hover:scale-110',
      ]"
      :style="{ background: 'conic-gradient(#ef4444,#f59e0b,#84cc16,#10b981,#0ea5e9,#6366f1,#a855f7,#ec4899,#ef4444)' }"
      :title="$t('vault.color.custom')"
    >
      <input
        type="color"
        class="absolute inset-0 size-full cursor-pointer opacity-0"
        :value="custom"
        :aria-label="$t('vault.color.custom')"
        @input="onCustom"
      >
      <Check v-if="customActive" class="pointer-events-none size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]" />
      <Pipette v-else class="pointer-events-none size-3.5 text-white drop-shadow" />
    </label>
  </div>
</template>

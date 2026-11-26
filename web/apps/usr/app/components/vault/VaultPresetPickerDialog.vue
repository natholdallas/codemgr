<script setup lang="ts">
import { Search } from '@lucide/vue'
import { SYSTEM_PRESETS } from '~/lib/vault/types'
import type { VaultPresetDraft, VaultRecordField } from '~/lib/vault/types'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ select: [draft: VaultPresetDraft | null] }>()
const vault = useVaultStore()

const search = ref('')

watch(open, (isOpen) => {
  if (isOpen) search.value = ''
})

interface PresetOption {
  id: string
  name: string
  fields: VaultRecordField[]
}

// Enabled system presets plus the user's own formats: both are starting points.
const options = computed<PresetOption[]>(() => {
  const system = SYSTEM_PRESETS.filter((preset) => !vault.disabledPresets.includes(preset.id)).map((preset) => ({
    id: `system:${preset.id}`,
    name: $t(preset.nameKey),
    fields: preset.fields,
  }))
  return [...system, ...vault.types.map((type) => ({ id: `custom:${type.id}`, name: type.name, fields: type.fields }))]
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return options.value
  return options.value.filter(
    (option) => option.name.toLowerCase().includes(q) || option.fields.some((field) => field.key.toLowerCase().includes(q)),
  )
})

function choose(option: PresetOption) {
  // Copied, never referenced: editing the new format must not touch a system
  // preset or the format it was derived from.
  emit('select', { name: option.name, fields: option.fields.map((field) => ({ ...field })) })
  open.value = false
}

function blank() {
  emit('select', null)
  open.value = false
}
</script>

<template>
  <UixModal v-model:open="open" :title="$t('vault.preset.choose')" no-footer class="sm:max-w-lg">
    <div class="space-y-3">
      <div class="relative">
        <Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <UiInput v-model="search" class="pl-8" :placeholder="$t('vault.preset.search')" />
      </div>

      <div class="max-h-[50vh] space-y-1 overflow-y-auto">
        <button
          type="button"
          class="flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent"
          @click="blank"
        >
          <span class="text-sm font-medium">{{ $t('vault.preset.blank') }}</span>
        </button>

        <button
          v-for="option in filtered"
          :key="option.id"
          type="button"
          class="flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent"
          @click="choose(option)"
        >
          <span class="text-sm font-medium">{{ option.name }}</span>
          <span class="w-full truncate text-xs text-muted-foreground">{{ option.fields.map((f) => f.key).join(' · ') }}</span>
        </button>

        <p v-if="!filtered.length" class="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {{ $t('vault.preset.empty') }}
        </p>
      </div>
    </div>
  </UixModal>
</template>

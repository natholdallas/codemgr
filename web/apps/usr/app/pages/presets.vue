<script setup lang="ts">
import { Pencil, Plus, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { SYSTEM_PRESETS } from '~/lib/vault/types'
import type { VaultPresetDraft } from '~/lib/vault/types'

definePageMeta({
  name: 'presets',
  middleware: 'vault',
})

const vault = useVaultStore()
const { openType } = useVaultDialogs()
const confirming = ref('')
const pickerOpen = ref(false)

const isEnabled = (id: string) => !vault.disabledPresets.includes(id)

// The switch is optimistic on the store side, but a failed save must surface:
// the toggle would otherwise look applied while the doc never changed.
async function toggle(id: string, enabled: boolean) {
  try {
    await vault.$setPresetEnabled(id, enabled)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function pickPreset(draft: VaultPresetDraft | null) {
  pickerOpen.value = false
  openType(null, draft)
}

// Two-step delete: formats are cheap to recreate but expensive to lose by a
// stray click while browsing the list.
async function remove(id: string) {
  if (confirming.value !== id) {
    confirming.value = id
    return
  }
  try {
    await vault.$removeType(id)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    confirming.value = ''
  }
}
</script>

<template>
  <ComCtl scroll>
    <div class="mx-auto flex max-w-3xl flex-col gap-5 p-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ $t('vault.preset.manager') }}</h1>
        <p class="text-sm text-muted-foreground">{{ $t('vault.preset.manager.desc') }}</p>
      </div>

      <section class="space-y-2">
        <h2 class="text-sm font-medium">{{ $t('vault.preset.system') }}</h2>
        <div class="divide-y rounded-lg border">
          <div v-for="preset in SYSTEM_PRESETS" :key="preset.id" class="flex items-center gap-2 py-2 pr-2 pl-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ $t(preset.nameKey) }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ preset.fields.map((f) => f.key).join(' · ') }}</p>
            </div>
            <UiSwitch :model-value="isEnabled(preset.id)" @update:model-value="(value) => toggle(preset.id, !!value)" />
          </div>
        </div>
      </section>

      <section class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-medium">{{ $t('vault.preset.custom') }}</h2>
          <UiButton size="sm" @click="pickerOpen = true">
            <Plus class="size-3.5" />
            {{ $t('vault.format.new') }}
          </UiButton>
        </div>

        <p v-if="!vault.types.length" class="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {{ $t('vault.preset.custom.empty') }}
        </p>
        <div v-else class="divide-y rounded-lg border">
          <div v-for="type in vault.types" :key="type.id" class="flex items-center gap-1 py-2 pr-1 pl-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ type.name }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ type.fields.map((f) => f.key).join(' · ') }}</p>
            </div>
            <UiButton variant="ghost" size="icon" :title="$t('vault.format.edit')" @click="openType(type)">
              <Pencil class="size-4" />
            </UiButton>
            <UiButton
              :variant="confirming === type.id ? 'destructive' : 'ghost'"
              :size="confirming === type.id ? 'sm' : 'icon'"
              :title="$t('vault.format.delete')"
              @click="remove(type.id)"
            >
              <template v-if="confirming === type.id">{{ $t('confirm') }}</template>
              <Trash2 v-else class="size-4" />
            </UiButton>
          </div>
        </div>
      </section>
    </div>

    <template #modals>
      <VaultPresetPickerDialog v-model:open="pickerOpen" @select="pickPreset" />
    </template>
  </ComCtl>
</template>

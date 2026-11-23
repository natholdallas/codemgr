<script setup lang="ts">
import { ChevronDown, Pencil, Plus, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { RECORD_PRESETS } from '~/lib/vault/types'

const open = defineModel<boolean>('open', { default: false })
const vault = useVaultStore()
const { openType } = useVaultDialogs()
const confirming = ref('')

watch(open, (isOpen) => {
  if (!isOpen) confirming.value = ''
})

async function addPreset(preset: (typeof RECORD_PRESETS)[number]) {
  try {
    await vault.$addType({ name: $t(preset.nameKey), fields: preset.fields })
    toast.success($t('vault.format.new'))
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
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
  <UixModal v-model:open="open" :title="$t('vault.format.list')" no-footer>
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">{{ $t('vault.format.list.desc') }}</p>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <UiDropdownMenu>
          <UiDropdownMenuTrigger as-child>
            <UiButton variant="outline" size="sm">
              <Plus class="size-3.5" />
              {{ $t('vault.format.preset') }}
              <ChevronDown class="size-3.5" />
            </UiButton>
          </UiDropdownMenuTrigger>
          <UiDropdownMenuContent>
            <UiDropdownMenuItem v-for="preset in RECORD_PRESETS" :key="preset.id" @select="addPreset(preset)">
              {{ $t(preset.nameKey) }}
            </UiDropdownMenuItem>
          </UiDropdownMenuContent>
        </UiDropdownMenu>
        <UiButton size="sm" @click="openType()">
          <Plus class="size-3.5" />
          {{ $t('vault.format.new') }}
        </UiButton>
      </div>

      <p v-if="!vault.types.length" class="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        {{ $t('vault.format.empty') }}
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
    </div>
  </UixModal>
</template>

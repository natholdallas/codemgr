<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { DEFAULT_SPACE_COLOR } from '~/lib/vault/types'
import type { VaultSpace } from '~/lib/vault/types'

const props = defineProps<{ space: VaultSpace | null }>()
const open = defineModel<boolean>('open', { default: false })
const vault = useVaultStore()

const form = reactive({ name: '', description: '', color: DEFAULT_SPACE_COLOR as string, icon: '' })
const saving = ref(false)
const confirming = ref(false)

watch(open, (isOpen) => {
  confirming.value = false
  if (!isOpen) return
  form.name = props.space?.name ?? ''
  form.description = props.space?.description ?? ''
  form.color = props.space?.color ?? DEFAULT_SPACE_COLOR
  form.icon = props.space?.icon ?? ''
})

const count = computed(() => (props.space ? (vault.spaceCounts[props.space.id] ?? 0) : 0))
const canDelete = computed(() => !!props.space && vault.spaces.length > 1)

async function save() {
  if (!form.name.trim()) {
    toast.warning($t('vault.space.name'))
    return
  }
  saving.value = true
  try {
    if (props.space) await vault.$updateSpace(props.space.id, { ...form })
    else await vault.$addSpace({ ...form })
    open.value = false
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!props.space) return
  if (!confirming.value) {
    confirming.value = true
    return
  }
  try {
    await vault.$removeSpace(props.space.id)
    open.value = false
  } catch (err) {
    toast.warning(err instanceof Error && err.message === 'vault:space.last' ? $t('vault.space.last') : String(err))
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <UixModal
    v-model:open="open"
    :title="space ? $t('vault.space.edit') : $t('vault.space.new')"
    :loading="saving"
    @cancel="open = false"
    @confirm="save"
  >
    <div class="space-y-4">
      <div class="space-y-1.5">
        <UiLabel for="space-name">{{ $t('vault.space.name') }}</UiLabel>
        <UiInput id="space-name" v-model="form.name" :placeholder="$t('vault.space.name.placeholder')" />
      </div>

      <div class="space-y-1.5">
        <UiLabel for="space-desc">{{ $t('vault.space.desc') }}</UiLabel>
        <UiTextarea id="space-desc" v-model="form.description" rows="2" />
      </div>

      <div class="space-y-2">
        <UiLabel>{{ $t('vault.space.icon') }}</UiLabel>
        <VaultIconPicker v-model="form.icon" />
      </div>

      <div class="space-y-2">
        <UiLabel>{{ $t('vault.space.color') }}</UiLabel>
        <VaultColorPicker v-model="form.color" />
      </div>

      <div v-if="space" class="rounded-lg border border-dashed p-3">
        <p class="text-xs text-muted-foreground">{{ $t('vault.space.delete.desc') }}</p>
        <p v-if="confirming" class="mt-1 text-xs font-medium text-destructive">
          {{ $t('vault.entries', { count }) }}
        </p>
        <UiButton variant="ghost" size="sm" class="mt-1 text-destructive hover:text-destructive" :disabled="!canDelete" @click="remove">
          <Trash2 class="size-3.5" />
          {{ confirming ? $t('confirm') : $t('vault.space.delete') }}
        </UiButton>
      </div>
    </div>
  </UixModal>
</template>

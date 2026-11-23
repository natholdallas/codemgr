<script setup lang="ts">
import { Upload } from '@lucide/vue'
import { toast } from 'vue-sonner'

const props = defineProps<{ spaceId: string }>()
const open = defineModel<boolean>('open', { default: false })
const vault = useVaultStore()

const text = ref('')
const saving = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = ''
  text.value = props.spaceId ? vault.$exportSpaceToml(props.spaceId) : ''
})

const spaceName = computed(() => vault.spaces.find((s) => s.id === props.spaceId)?.name ?? 'space')

function download() {
  const blob = new Blob([text.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${spaceName.value.replace(/[^\w-]+/g, '-').toLowerCase() || 'vault'}.toml`
  link.click()
  URL.revokeObjectURL(url)
}

async function apply() {
  if (!text.value.trim()) {
    error.value = $t('vault.toml.empty')
    return
  }
  saving.value = true
  error.value = ''
  try {
    const result = await vault.$replaceSpaceToml(props.spaceId, text.value)
    toast.success($t('vault.import.done', { created: result.created, updated: result.updated }))
    open.value = false
  } catch (err) {
    error.value = $t('vault.toml.error', { message: err instanceof Error ? err.message : String(err) })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UixModal
    v-model:open="open"
    :title="$t('vault.toml.edit')"
    :description="$t('vault.toml.desc')"
    :loading="saving"
    class="sm:max-w-3xl"
    @cancel="open = false"
    @confirm="apply"
  >
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <UiBadge variant="secondary">{{ spaceName }}</UiBadge>
        <UiButton variant="ghost" size="sm" @click="download">
          <Upload class="size-3.5" />
          {{ $t('vault.export.toml') }}
        </UiButton>
      </div>
      <UiTextarea v-model="text" rows="14" class="max-h-[55vh] font-mono text-xs" spellcheck="false" />
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
    </div>
  </UixModal>
</template>

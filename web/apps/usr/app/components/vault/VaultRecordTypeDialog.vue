<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { PROTOTYPE_KEYS } from '~/lib/vault/types'
import type { VaultRecordField, VaultRecordType } from '~/lib/vault/types'

const props = defineProps<{ type: VaultRecordType | null }>()
const open = defineModel<boolean>('open', { default: false })
const vault = useVaultStore()

const form = reactive({ name: '', fields: [] as VaultRecordField[] })
const saving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  form.name = props.type?.name ?? ''
  form.fields = props.type?.fields.length ? props.type.fields.map((f) => ({ ...f })) : [{ key: '', secret: false }]
})

// Same rules as entry fields, minus per-record values: a format only names
// keys, so an empty key is a real mistake here.
function problem(): string | null {
  if (!form.name.trim()) return $t('vault.format.name.required')
  const keys = form.fields.map((f) => f.key.trim()).filter(Boolean)
  if (!keys.length) return $t('vault.entry.field.key')
  const lower = keys.map((k) => k.toLowerCase())
  if (new Set(lower).size !== lower.length) return $t('vault.field.duplicate')
  if (keys.some((k) => k.startsWith('_') || PROTOTYPE_KEYS.includes(k))) return $t('vault.field.invalid')
  return null
}

async function save() {
  const issue = problem()
  if (issue) {
    toast.warning(issue)
    return
  }
  const fields = form.fields.map((f) => ({ key: f.key.trim(), secret: f.secret })).filter((f) => f.key)
  saving.value = true
  try {
    if (props.type) await vault.$updateType(props.type.id, { name: form.name, fields })
    else await vault.$addType({ name: form.name, fields })
    open.value = false
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UixModal
    v-model:open="open"
    :title="type ? $t('vault.format.edit') : $t('vault.format.new')"
    :loading="saving"
    @cancel="open = false"
    @confirm="save"
  >
    <div class="space-y-4">
      <div class="space-y-1.5">
        <UiLabel for="format-name">{{ $t('vault.format.name') }}</UiLabel>
        <UiInput id="format-name" v-model="form.name" :placeholder="$t('vault.format.name.placeholder')" />
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <UiLabel>{{ $t('vault.format.fields') }}</UiLabel>
          <UiButton variant="ghost" size="sm" @click="form.fields.push({ key: '', secret: false })">
            <Plus class="size-3.5" />
            {{ $t('vault.format.field.add') }}
          </UiButton>
        </div>

        <div v-for="(field, i) in form.fields" :key="i" class="flex items-center gap-2">
          <UiInput v-model="field.key" class="min-w-0 flex-1" :placeholder="$t('vault.format.field.key')" />
          <UiSwitch v-model="field.secret" :title="$t('vault.entry.field.secret')" />
          <UiButton
            variant="ghost"
            size="icon"
            class="shrink-0"
            :disabled="form.fields.length <= 1"
            :title="$t('vault.format.field.remove')"
            @click="form.fields.splice(i, 1)"
          >
            <X class="size-4" />
          </UiButton>
        </div>
      </div>
    </div>
  </UixModal>
</template>

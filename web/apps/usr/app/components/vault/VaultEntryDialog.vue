<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { ENTRY_KINDS, PROTOTYPE_KEYS } from '~/lib/vault/types'
import type { EntryKind, VaultEntry, VaultField, VaultRecordType } from '~/lib/vault/types'

const props = defineProps<{
  entry: VaultEntry | null
  defaultSpaceId?: string
}>()
const open = defineModel<boolean>('open', { default: false })
const vault = useVaultStore()

const form = reactive({
  title: '',
  spaceId: '',
  kind: 'login' as EntryKind,
  tags: [] as string[],
  fields: [] as VaultField[],
  typeId: '',
  notes: '',
  url: '',
})
const saving = ref(false)

// The format the record follows, if any. Its field keys and secret flags are
// authoritative while selected.
const activeType = computed(() => vault.types.find((t) => t.id === form.typeId) ?? null)
// A record whose format was deleted keeps its values but must be editable as a
// free-form record again.
const formatMissing = computed(() => !!props.entry?.typeId && !form.typeId)

const NO_FORMAT = '__none__'

function setSpace(value: unknown) {
  form.spaceId = String(value)
}

function setKind(value: unknown) {
  form.kind = String(value) as EntryKind
}

function setFormat(value: unknown) {
  form.typeId = value === NO_FORMAT ? '' : String(value)
}

function defaults(): VaultField[] {
  return [
    { key: 'username', value: '', secret: false },
    { key: 'password', value: '', secret: true },
  ]
}

// Rebuild the field list from a format, keeping whatever the user already
// typed under matching keys.
function applyType(type: VaultRecordType) {
  const values = new Map(form.fields.map((f) => [f.key.toLowerCase(), f.value]))
  form.fields = type.fields.map((f) => ({
    key: f.key,
    value: values.get(f.key.toLowerCase()) ?? '',
    secret: f.secret,
  }))
}

watch(open, (isOpen) => {
  if (!isOpen) return
  const spaceId = props.entry?.spaceId ?? props.defaultSpaceId ?? vault.spaces[0]?.id ?? ''
  form.title = props.entry?.title ?? ''
  form.spaceId = vault.spaces.some((s) => s.id === spaceId) ? spaceId : (vault.spaces[0]?.id ?? '')
  form.kind = props.entry?.kind ?? 'login'
  form.tags = [...(props.entry?.tags ?? [])]
  form.fields = props.entry ? props.entry.fields.map((f) => ({ ...f })) : defaults()
  form.notes = props.entry?.notes ?? ''
  form.url = props.entry?.url ?? ''
  const typeId = props.entry?.typeId ?? ''
  form.typeId = vault.types.some((t) => t.id === typeId) ? typeId : ''
})

watch(
  () => form.typeId,
  (id) => {
    const type = vault.types.find((t) => t.id === id)
    if (type) applyType(type)
  },
)

// Rejects what the TOML layer and the store cannot round-trip: empty keys,
// duplicate keys, the `_` metadata namespace and prototype-poisoning names.
function invalid(): string | null {
  if (!form.title.trim()) return $t('vault.entry.title')
  if (!form.spaceId) return $t('vault.entry.space')
  const keys = form.fields.map((f) => f.key.trim())
  if (keys.some((k) => !k)) return $t('vault.entry.field.key')
  const lower = keys.map((k) => k.toLowerCase())
  if (new Set(lower).size !== lower.length) return $t('vault.field.duplicate')
  if (keys.some((k) => k.startsWith('_') || PROTOTYPE_KEYS.includes(k))) return $t('vault.field.invalid')
  return null
}

async function save() {
  const problem = invalid()
  if (problem) {
    toast.warning(problem)
    return
  }
  saving.value = true
  try {
    const payload = {
      title: form.title,
      spaceId: form.spaceId,
      kind: form.kind,
      tags: form.tags,
      fields: form.fields.filter((f) => f.key.trim()),
      typeId: form.typeId || undefined,
      notes: form.notes,
      url: form.url,
    }
    if (props.entry) await vault.$updateEntry(props.entry.id, payload)
    else await vault.$addEntry(payload)
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
    :title="entry ? $t('vault.entry.edit') : $t('vault.entry.new')"
    :loading="saving"
    class="sm:max-w-2xl"
    @cancel="open = false"
    @confirm="save"
  >
    <div class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <UiLabel for="entry-title">{{ $t('vault.entry.title') }}</UiLabel>
          <UiInput id="entry-title" v-model="form.title" :placeholder="$t('vault.entry.title.placeholder')" />
        </div>
        <div class="space-y-1.5">
          <UiLabel for="entry-space">{{ $t('vault.entry.space') }}</UiLabel>
          <UiSelect :model-value="form.spaceId" @update:model-value="setSpace">
            <UiSelectTrigger id="entry-space" class="w-full">
              <UiSelectValue :placeholder="$t('vault.entry.space')" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="space in vault.spaces" :key="space.id" :value="space.id">{{ space.name }}</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="space-y-1.5">
          <UiLabel for="entry-kind">{{ $t('vault.entry.kind') }}</UiLabel>
          <UiSelect :model-value="form.kind" @update:model-value="setKind">
            <UiSelectTrigger id="entry-kind" class="w-full">
              <UiSelectValue :placeholder="$t('vault.entry.kind')" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="kind in ENTRY_KINDS" :key="kind" :value="kind">{{ $t(`vault.kind.${kind}`) }}</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="space-y-1.5">
          <UiLabel for="entry-format">{{ $t('vault.entry.format') }}</UiLabel>
          <UiSelect :model-value="form.typeId || NO_FORMAT" @update:model-value="setFormat">
            <UiSelectTrigger id="entry-format" class="w-full">
              <UiSelectValue :placeholder="$t('vault.entry.format.none')" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem :value="NO_FORMAT">{{ $t('vault.entry.format.none') }}</UiSelectItem>
              <UiSelectItem v-for="type in vault.types" :key="type.id" :value="type.id">{{ type.name }}</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="space-y-1.5 sm:col-span-2">
          <UiLabel>{{ $t('vault.entry.url') }}</UiLabel>
          <UiInput v-model="form.url" placeholder="https://" />
        </div>
      </div>

      <div class="space-y-1.5">
        <UiLabel>{{ $t('vault.entry.tags') }}</UiLabel>
        <UiTagsInput v-model="form.tags">
          <UiTagsInputItem v-for="tag in form.tags" :key="tag" :value="tag">
            <UiTagsInputItemText />
            <UiTagsInputItemDelete />
          </UiTagsInputItem>
          <UiTagsInputInput :placeholder="$t('vault.entry.tags.placeholder')" />
        </UiTagsInput>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <UiLabel>{{ $t('vault.entry.fields') }}</UiLabel>
          <UiButton
            v-if="!activeType"
            variant="ghost"
            size="sm"
            @click="form.fields.push({ key: '', value: '', secret: false })"
          >
            <Plus class="size-3.5" />
            {{ $t('vault.entry.field.add') }}
          </UiButton>
        </div>

        <p v-if="activeType" class="text-xs text-muted-foreground">{{ $t('vault.entry.format.hint') }}</p>
        <p v-else-if="formatMissing" class="text-xs text-muted-foreground">{{ $t('vault.entry.format.missing') }}</p>

        <div v-for="(field, i) in form.fields" :key="i" class="flex items-center gap-2">
          <UiInput
            v-model="field.key"
            class="w-32 shrink-0"
            :placeholder="$t('vault.entry.field.key')"
            :disabled="!!activeType"
          />
          <UiInput
            v-model="field.value"
            class="min-w-0 flex-1"
            :type="field.secret ? 'password' : 'text'"
            :placeholder="$t('vault.entry.field.value')"
          />
          <UiSwitch v-model="field.secret" :title="$t('vault.entry.field.secret')" :disabled="!!activeType" />
          <UiButton
            v-if="!activeType"
            variant="ghost"
            size="icon"
            class="shrink-0"
            @click="form.fields.splice(i, 1)"
          >
            <X class="size-4" />
          </UiButton>
        </div>
      </div>

      <div class="space-y-1.5">
        <UiLabel for="entry-notes">{{ $t('vault.entry.notes') }}</UiLabel>
        <UiTextarea id="entry-notes" v-model="form.notes" rows="3" />
      </div>
    </div>
  </UixModal>
</template>

<script setup lang="ts">
import { FileDown } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { parseVaultToml } from '~/lib/vault/toml'
import type { ParsedEntry } from '~/lib/vault/toml'

const props = defineProps<{ spaceId?: string }>()
const open = defineModel<boolean>('open', { default: false })
const vault = useVaultStore()

const MAX_SIZE = 2 * 1024 * 1024

const files = ref<{ name: string; text: string }[]>([])
const errors = ref<{ file: string; message: string }[]>([])
const mode = ref<'merge' | 'replace'>('merge')
const target = ref('')
const extraTags = ref<string[]>([])
const dragging = ref(false)
const busy = ref(false)
const parsed = ref<ParsedEntry[]>([])

const basename = (name: string) => name.replace(/\.toml$/i, '')

// Parse as soon as the files change so the preview counts and per-file errors are
// visible before anything touches the vault.
function parseAll() {
  parsed.value = []
  errors.value = []
  for (const file of files.value) {
    try {
      const tags = [...new Set([basename(file.name), ...extraTags.value.map((t) => t.trim()).filter(Boolean)])]
      parsed.value.push(...parseVaultToml(file.text, { file: file.name, baseTags: tags }))
    } catch (err) {
      errors.value.push({ file: file.name, message: err instanceof Error ? err.message : String(err) })
    }
  }
}

watch([extraTags, files], parseAll, { deep: true })

watch(open, (isOpen) => {
  if (!isOpen) return
  files.value = []
  errors.value = []
  parsed.value = []
  extraTags.value = []
  mode.value = 'merge'
  target.value = props.spaceId && vault.spaces.some((s) => s.id === props.spaceId) ? props.spaceId : (vault.spaces[0]?.id ?? '')
})

async function addFiles(list: FileList | File[] | null) {
  if (!list) return
  for (const file of Array.from(list)) {
    if (!/\.toml$/i.test(file.name)) {
      errors.value.push({ file: file.name, message: 'not a .toml file' })
      continue
    }
    if (file.size > MAX_SIZE) {
      errors.value.push({ file: file.name, message: 'file is larger than 2 MB' })
      continue
    }
    files.value.push({ name: file.name, text: await file.text() })
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void addFiles(event.dataTransfer?.files ?? null)
}

// A detached input still opens the picker on a user gesture, and it keeps the
// dialog's draggable content from having to host an interactive child.
function openPicker() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.toml'
  input.multiple = true
  input.addEventListener('change', () => void addFiles(input.files), { once: true })
  input.click()
}

function setTarget(value: unknown) {
  target.value = String(value)
}

async function run() {
  if (!parsed.value.length) {
    toast.warning($t('vault.toml.empty'))
    return
  }
  if (!target.value) {
    toast.warning($t('vault.entry.space'))
    return
  }
  busy.value = true
  try {
    const result = await vault.$importToml({ spaceId: target.value, mode: mode.value, entries: parsed.value })
    toast.success($t('vault.import.done', { created: result.created, updated: result.updated }))
    open.value = false
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UixModal
    v-model:open="open"
    :title="$t('vault.import')"
    :description="$t('vault.import.desc')"
    :loading="busy"
    class="sm:max-w-xl"
    @cancel="open = false"
    @confirm="run"
  >
    <div class="space-y-4">
      <button
        type="button"
        :class="[
          'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50',
        ]"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
        @click="openPicker"
      >
        <FileDown class="size-6 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">{{ $t('vault.import.drop') }}</p>
      </button>

      <ul v-if="files.length" class="space-y-1 text-sm">
        <li v-for="file in files" :key="file.name" class="flex items-center justify-between gap-2">
          <span class="truncate font-mono text-xs">{{ file.name }}</span>
          <button type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="files.splice(files.indexOf(file), 1)">
            {{ $t('remove') }}
          </button>
        </li>
      </ul>

      <div v-if="errors.length" class="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p v-for="err in errors" :key="err.file + err.message" class="text-xs text-destructive">
          {{ $t('vault.import.error', { file: err.file, message: err.message }) }}
        </p>
      </div>

      <p class="text-sm text-muted-foreground">
        {{ $t('vault.import.preview', { files: files.length, entries: parsed.length }) }}
      </p>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <UiLabel>{{ $t('vault.entry.space') }}</UiLabel>
          <UiSelect :model-value="target" @update:model-value="setTarget">
            <UiSelectTrigger class="w-full">
              <UiSelectValue :placeholder="$t('vault.entry.space')" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="space in vault.spaces" :key="space.id" :value="space.id">{{ space.name }}</UiSelectItem>
            </UiSelectContent>
          </UiSelect>
        </div>
        <div class="space-y-1.5">
          <UiLabel>{{ $t('vault.import.base.tags') }}</UiLabel>
          <UiTagsInput v-model="extraTags">
            <UiTagsInputItem v-for="tag in extraTags" :key="tag" :value="tag">
              <UiTagsInputItemText />
              <UiTagsInputItemDelete />
            </UiTagsInputItem>
            <UiTagsInputInput :placeholder="$t('vault.entry.tags.placeholder')" />
          </UiTagsInput>
        </div>
      </div>

      <div class="space-y-2">
        <UiLabel>{{ $t('vault.import.mode') }}</UiLabel>
        <UiRadioGroup v-model="mode" class="flex flex-wrap gap-4">
          <div class="flex items-center gap-2">
            <UiRadioGroupItem id="mode-merge" value="merge" />
            <UiLabel for="mode-merge" class="font-normal">{{ $t('vault.import.merge') }}</UiLabel>
          </div>
          <div class="flex items-center gap-2">
            <UiRadioGroupItem id="mode-replace" value="replace" />
            <UiLabel for="mode-replace" class="font-normal">{{ $t('vault.import.replace') }}</UiLabel>
          </div>
        </UiRadioGroup>
      </div>
    </div>
  </UixModal>
</template>

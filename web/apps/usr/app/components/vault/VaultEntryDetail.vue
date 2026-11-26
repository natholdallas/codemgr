<script setup lang="ts">
import { Copy, Eye, EyeOff, Pencil, StickyNote, Trash2 } from '@lucide/vue'
import { vaultIcon } from '~/lib/vault/icons'
import { KIND_META } from '~/lib/vault/kinds'
import type { VaultEntry, VaultField } from '~/lib/vault/types'

const props = defineProps<{ entry: VaultEntry | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  edit: []
  remove: []
}>()

const isSecret = (field: VaultField) => field.secret || (props.entry?.kind === 'key' && field.key.toLowerCase() === 'value')

// Reveal state is per field index and resets when another entry is opened, so a
// password revealed once is not still visible on the next entry.
const revealed = ref<Record<number, boolean>>({})
watch(
  () => props.entry?.id,
  () => {
    revealed.value = {}
  },
)
const meta = computed(() => (props.entry ? KIND_META[props.entry.kind] : KIND_META.custom))
const icon = computed(() => (props.entry ? (vaultIcon(props.entry.icon) ?? meta.value.icon) : KIND_META.custom.icon))
// Same rule as the card: empty values have nothing to show, and `__` keys are
// import metadata that older parsers stored as ordinary fields.
const fields = computed(() => (props.entry?.fields ?? []).filter((f) => f.value.trim() !== '' && !f.key.startsWith('__')))
const vault = useVaultStore()
// The format name is more useful than the generic kind once a record follows
// one.
const formatName = computed(() => {
  const typeId = props.entry?.typeId
  if (!typeId) return ''
  return vault.types.find((t) => t.id === typeId)?.name ?? ''
})
</script>

<template>
  <UiSheet v-model:open="open">
    <UiSheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-md">
      <template v-if="entry">
        <UiSheetHeader class="space-y-2 border-b p-4 pr-12">
          <div class="flex items-center gap-3">
            <span :class="['grid size-9 shrink-0 place-items-center rounded-lg', meta.tile]">
              <component :is="icon" class="size-4.5" />
            </span>
            <div class="min-w-0">
              <UiSheetTitle class="truncate">{{ entry.title }}</UiSheetTitle>
              <UiSheetDescription class="truncate">{{ formatName || $t(`vault.kind.${entry.kind}`) }}</UiSheetDescription>
            </div>
          </div>
          <div v-if="entry.tags.length" class="flex flex-wrap gap-1.5">
            <UiBadge v-for="tag in entry.tags" :key="tag" variant="secondary" class="font-normal">{{ tag }}</UiBadge>
          </div>
        </UiSheetHeader>

        <UiScrollArea class="min-h-0 flex-1">
          <div class="space-y-2 p-4">
            <div v-for="(field, i) in fields" :key="`${field.key}-${i}`" class="rounded-lg border bg-card px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-muted-foreground">{{ field.key }}</span>
                <div class="flex items-center gap-0.5">
                  <UiButton
                    v-if="isSecret(field)"
                    variant="ghost"
                    size="icon"
                    class="size-7"
                    :title="revealed[i] ? $t('vault.hide') : $t('vault.reveal')"
                    @click="revealed[i] = !revealed[i]"
                  >
                    <EyeOff v-if="revealed[i]" class="size-3.5" />
                    <Eye v-else class="size-3.5" />
                  </UiButton>
                  <UixCopyable :text="field.value" class="size-7 justify-center">
                    <Copy class="size-3.5" />
                  </UixCopyable>
                </div>
              </div>
              <p class="mt-0.5 font-mono text-sm break-all whitespace-pre-wrap">
                {{ isSecret(field) && !revealed[i] ? '••••••••' : field.value }}
              </p>
            </div>

            <div v-if="entry.url" class="rounded-lg border bg-card px-3 py-2">
              <span class="text-xs text-muted-foreground">{{ $t('vault.entry.url') }}</span>
              <a :href="entry.url" target="_blank" rel="noopener noreferrer" class="mt-0.5 block truncate text-sm text-primary hover:underline">
                {{ entry.url }}
              </a>
            </div>

            <div v-if="entry.notes" class="rounded-lg border bg-card px-3 py-2">
              <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
                <StickyNote class="size-3.5" />
                {{ $t('vault.entry.notes') }}
              </span>
              <p class="mt-1 text-sm whitespace-pre-wrap">{{ entry.notes }}</p>
            </div>

            <p v-if="entry.source" class="pt-1 text-xs text-muted-foreground">
              {{ $t('vault.source', { file: entry.source.file }) }}
            </p>
          </div>
        </UiScrollArea>

        <UiSheetFooter class="flex-row gap-2 border-t p-4">
          <UiButton variant="outline" class="flex-1" @click="emit('edit')">
            <Pencil class="size-4" />
            {{ $t('vault.entry.edit') }}
          </UiButton>
          <UiButton variant="ghost" class="flex-1 text-destructive hover:text-destructive" @click="emit('remove')">
            <Trash2 class="size-4" />
            {{ $t('vault.entry.delete') }}
          </UiButton>
        </UiSheetFooter>
      </template>
    </UiSheetContent>
  </UiSheet>
</template>

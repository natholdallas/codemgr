<script setup lang="ts">
import { Copy, ExternalLink, Eye, EyeOff, Pencil, Trash2 } from '@lucide/vue'
import { KIND_META } from '~/lib/vault/kinds'
import type { VaultEntry, VaultField } from '~/lib/vault/types'

const props = defineProps<{ entry: VaultEntry }>()
const emit = defineEmits<{
  open: []
  edit: []
  remove: []
}>()

const meta = computed(() => KIND_META[props.entry.kind])
const revealed = ref(false)

// Card rows come from field names rather than a fixed shape: imported TOML is
// arbitrary, and this keeps the account, the label and the secret visible
// without opening the entry.
const ACCOUNT_KEYS = ['username', 'email', 'account', 'phone']
const DETAIL_KEYS = ['name', 'description', 'label', 'remark', 'host', 'site']

const usable = (field: VaultField) => !field.secret && !!field.value.trim() && field.value !== props.entry.title

const accountField = computed(() =>
  props.entry.fields.find((field) => ACCOUNT_KEYS.includes(field.key.toLowerCase()) && usable(field)),
)

const detailField = computed(() => {
  for (const key of DETAIL_KEYS) {
    const field = props.entry.fields.find((f) => f.key.toLowerCase() === key && usable(f))
    if (field) return field
  }
  return undefined
})

// Key records store their payload in `value`, which older entries imported
// before the parser flagged it still carry as a plain field.
const secretField = computed(() =>
  props.entry.fields.find(
    (field) =>
      !!field.value.trim() &&
      (field.secret || (props.entry.kind === 'key' && field.key.toLowerCase() === 'value')),
  ),
)

// dayjs ships `en` and `zh-cn` (see the infra module defaults), not the i18n
// locale codes, so map before formatting.
const { locale } = useI18n()
const dayjs = useDayjs()
const updated = computed(() => {
  const lang = locale.value.startsWith('zh') ? 'zh-cn' : 'en'
  return dayjs(props.entry.updatedAt).locale(lang).fromNow()
})
</script>

<template>
  <div
    class="group cursor-pointer rounded-xl border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    @click="emit('open')"
  >
    <div class="flex items-start gap-3">
      <span :class="['grid size-9 shrink-0 place-items-center rounded-lg', meta.tile]">
        <component :is="meta.icon" class="size-4.5" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="break-words text-lg leading-snug font-semibold">{{ entry.title }}</p>
        <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ entry.source?.path || $t(`vault.kind.${entry.kind}`) }}</p>
      </div>
      <div
        class="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
      >
        <a
          v-if="entry.url"
          :href="entry.url"
          target="_blank"
          rel="noopener noreferrer"
          class="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          @click.stop
        >
          <ExternalLink class="size-3.5" />
        </a>
        <UiButton variant="ghost" size="icon" class="size-7" @click.stop="emit('edit')">
          <Pencil class="size-3.5" />
        </UiButton>
        <UiButton variant="ghost" size="icon" class="size-7" @click.stop="emit('remove')">
          <Trash2 class="size-3.5" />
        </UiButton>
      </div>
    </div>

    <dl v-if="detailField || accountField || secretField" class="mt-3 space-y-1.5 text-sm">
      <div v-if="detailField" class="flex gap-2">
        <dt class="w-20 shrink-0 truncate text-xs text-muted-foreground">{{ detailField.key }}</dt>
        <dd class="min-w-0 flex-1 truncate" :title="detailField.value">{{ detailField.value }}</dd>
      </div>
      <div v-if="accountField" class="flex gap-2">
        <dt class="w-20 shrink-0 truncate text-xs text-muted-foreground">{{ accountField.key }}</dt>
        <dd class="min-w-0 flex-1 truncate" :title="accountField.value">{{ accountField.value }}</dd>
      </div>
      <div v-if="secretField" class="flex items-center gap-1.5">
        <dt class="w-20 shrink-0 truncate text-xs text-muted-foreground">{{ secretField.key }}</dt>
        <dd class="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm" :title="revealed ? secretField.value : ''">
          {{ revealed ? secretField.value : '••••••••' }}
        </dd>
        <UiButton
          variant="ghost"
          size="icon"
          class="size-7"
          :title="revealed ? $t('vault.hide') : $t('vault.reveal')"
          @click.stop="revealed = !revealed"
        >
          <EyeOff v-if="revealed" class="size-3.5" />
          <Eye v-else class="size-3.5" />
        </UiButton>
        <span @click.stop>
          <UixCopyable :text="secretField.value" class="size-7 justify-center">
            <Copy class="size-3.5" />
          </UixCopyable>
        </span>
      </div>
    </dl>

    <div class="mt-3 flex flex-wrap items-center gap-1.5">
      <UiBadge v-for="tag in entry.tags.slice(0, 3)" :key="tag" variant="secondary" class="font-normal">{{ tag }}</UiBadge>
      <UiBadge v-if="entry.tags.length > 3" variant="secondary" class="font-normal">+{{ entry.tags.length - 3 }}</UiBadge>
      <span class="ml-auto text-xs text-muted-foreground">{{ updated }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Copy, ExternalLink, Eye, EyeOff, Pencil, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { vaultIcon } from '~/lib/vault/icons'
import { KIND_META } from '~/lib/vault/kinds'
import type { VaultEntry, VaultField } from '~/lib/vault/types'

const props = defineProps<{ entry: VaultEntry }>()
const emit = defineEmits<{
  open: []
  edit: []
  remove: []
}>()

const vault = useVaultStore()
const meta = computed(() => KIND_META[props.entry.kind])
const icon = computed(() => vaultIcon(props.entry.icon) ?? meta.value.icon)
// Explicit card color wins; otherwise the card wears its space's color, so the
// grid reads as color-coded even before anyone touches a card.
const accent = computed(() => props.entry.color || vault.spaces.find((s) => s.id === props.entry.spaceId)?.color || '')
// Custom properties go on the card so the hover border/shadow can reference the
// same color without a second reactive class name.
const cardStyle = computed<Record<string, string> | undefined>(() => {
  const color = accent.value
  if (!color) return undefined
  return {
    '--card-accent': color,
    backgroundImage: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${color} 12%, transparent), transparent 62%)`,
  }
})
const { t, locale } = useI18n()

// Every non-empty field is shown, with no cap: the card is the entry's summary,
// and a record whose sixth field is the one that matters must not hide it.
// `__` keys are the import metadata namespace leaking into old records, not
// user fields.
const fields = computed(() => props.entry.fields.filter((f) => f.value.trim() !== '' && !f.key.startsWith('__')))

// Key records store their payload in `value`; entries imported before the
// parser flagged it still carry it as a plain field.
const isSecret = (field: VaultField) => field.secret || (props.entry.kind === 'key' && field.key.toLowerCase() === 'value')

// Reveal state is per row, so reading one password does not expose the rest.
const revealed = ref<Record<number, boolean>>({})

const formatName = computed(() => (props.entry.typeId ? (vault.types.find((x) => x.id === props.entry.typeId)?.name ?? '') : ''))
const subtitle = computed(() => formatName.value || t(`vault.kind.${props.entry.kind}`))

const editing = ref(false)
const draft = ref('')
const titleWrap = ref<HTMLElement | null>(null)

async function startRename() {
  draft.value = props.entry.title
  editing.value = true
  await nextTick()
  const el = titleWrap.value?.querySelector('input')
  if (!el) return
  el.focus()
  // The click that opened the editor places the caret on mouseup, which runs
  // after nextTick; selecting on the next frame keeps the whole title selected
  // so typing replaces it instead of splicing into the middle.
  requestAnimationFrame(() => el.select())
}

async function commitRename() {
  if (!editing.value) return
  // Cleared first: the Enter handler also blurs, and a second commit would be a
  // no-op edit against the already-renamed record.
  editing.value = false
  const title = draft.value.trim()
  if (!title || title === props.entry.title) return
  try {
    await vault.$updateEntry(props.entry.id, { title })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function cancelRename() {
  editing.value = false
  draft.value = props.entry.title
}

// dayjs ships `en` and `zh-cn` (see the infra module defaults), not the i18n
// locale codes, so map before formatting.
const dayjs = useDayjs()
const updated = computed(() => {
  const lang = locale.value.startsWith('zh') ? 'zh-cn' : 'en'
  return dayjs(props.entry.updatedAt).locale(lang).fromNow()
})
</script>

<template>
  <div
    class="group relative cursor-pointer overflow-hidden rounded-xl border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:[border-color:color-mix(in_srgb,var(--card-accent)_45%,transparent)] hover:[box-shadow:0_10px_28px_-16px_var(--card-accent)]"
    :style="cardStyle"
    @click="emit('open')"
  >
    <span v-if="accent" class="pointer-events-none absolute inset-y-0 left-0 w-1" :style="{ backgroundColor: accent }" />
    <div class="flex items-start gap-3">
      <span :class="['grid size-9 shrink-0 place-items-center rounded-lg', meta.tile]">
        <component :is="icon" class="size-4.5" />
      </span>
      <div class="min-w-0 flex-1">
        <div ref="titleWrap" @click.stop="startRename">
          <UiInput
            v-if="editing"
            v-model="draft"
            class="h-8 text-lg font-semibold"
            @click.stop
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <p v-else class="break-words text-lg leading-snug font-semibold" :title="t('vault.entry.title.edit')">
            {{ entry.title }}
          </p>
        </div>
        <p class="mt-0.5 truncate text-xs text-muted-foreground">{{ subtitle }}</p>
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

    <dl v-if="fields.length" class="mt-3 space-y-1.5 text-sm">
      <div v-for="(field, i) in fields" :key="`${field.key}-${i}`" class="flex items-center gap-1.5">
        <dt class="w-20 shrink-0 truncate text-xs text-muted-foreground">{{ field.key }}</dt>
        <dd
          class="min-w-0 flex-1 truncate"
          :class="isSecret(field) ? 'font-mono text-xs sm:text-sm' : ''"
          :title="isSecret(field) && !revealed[i] ? '' : field.value"
        >
          {{ isSecret(field) && !revealed[i] ? '••••••••' : field.value }}
        </dd>
        <template v-if="isSecret(field)">
          <UiButton
            variant="ghost"
            size="icon"
            class="size-7"
            :title="revealed[i] ? $t('vault.hide') : $t('vault.reveal')"
            @click.stop="revealed[i] = !revealed[i]"
          >
            <EyeOff v-if="revealed[i]" class="size-3.5" />
            <Eye v-else class="size-3.5" />
          </UiButton>
          <span @click.stop>
            <UixCopyable :text="field.value" class="size-7 justify-center">
              <Copy class="size-3.5" />
            </UixCopyable>
          </span>
        </template>
      </div>
    </dl>

    <div class="mt-3 flex flex-wrap items-center gap-1.5">
      <UiBadge v-for="tag in entry.tags.slice(0, 3)" :key="tag" variant="secondary" class="font-normal">{{ tag }}</UiBadge>
      <UiBadge v-if="entry.tags.length > 3" variant="secondary" class="font-normal">+{{ entry.tags.length - 3 }}</UiBadge>
      <span class="ml-auto text-xs text-muted-foreground">{{ updated }}</span>
    </div>
  </div>
</template>

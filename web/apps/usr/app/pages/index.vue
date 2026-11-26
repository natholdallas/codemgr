<script setup lang="ts">
import { Search, Trash2 } from '@lucide/vue'
import { ALL_SPACES } from '~/stores/vault'
import type { VaultEntry } from '~/lib/vault/types'

definePageMeta({
  name: 'index',
  middleware: 'vault',
})

const vault = useVaultStore()
const { openEntry, importOpen, openType } = useVaultDialogs()
const { filteredEntries } = storeToRefs(vault)

interface EntryGroup {
  key: string
  label: string
  spaceName: string
  manual: boolean
  entries: VaultEntry[]
}

// Entries keep the TOML section they came from (`behaviour[0]`, `[bank.agricultural]`),
// so grouping by it keeps records of one section adjacent instead of scattered.
function sectionOf(entry: VaultEntry): string {
  const path = entry.source?.path ?? ''
  if (!path) return ''
  // Root-scalar credential files (key.toml) have no section: keep those records
  // together under the file name instead of making one group per key.
  const rootScalar = !path.includes('.') && !path.includes('[') && entry.kind === 'key'
  if (rootScalar) return entry.source?.file ?? ''
  const first = path.split('.')[0] ?? ''
  // A top-level `[[xxxxx]]` array expands to `xxxxx[0]`, `xxxxx[1]`, ...: the
  // key is often random and the index says nothing, so the file name is the
  // only meaningful group label.
  if (/\[\d+\]$/.test(first)) return (entry.source?.file ?? '').replace(/\.toml$/i, '')
  return first.replace(/\[\d+\]$/, '')
}

const groups = computed<EntryGroup[]>(() => {
  const byKey = new Map<string, EntryGroup>()
  for (const entry of filteredEntries.value) {
    const section = sectionOf(entry)
    const label = section || $t('vault.group.manual')
    const key = `${entry.spaceId}::${entry.source?.file ?? ''}::${label}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        key,
        label,
        spaceName: vault.spaces.find((space) => space.id === entry.spaceId)?.name ?? '',
        manual: !section,
        entries: [],
      }
      byKey.set(key, group)
    }
    group.entries.push(entry)
  }
  return [...byKey.values()].sort((a, b) => Number(a.manual) - Number(b.manual) || a.label.localeCompare(b.label))
})

const detail = ref<VaultEntry | null>(null)
const detailOpen = ref(false)
const removing = ref<VaultEntry | null>(null)

function openDetail(entry?: VaultEntry) {
  if (!entry) return
  detail.value = entry
  detailOpen.value = true
}

async function removeEntry() {
  if (!removing.value) return
  await vault.$removeEntry(removing.value.id)
  removing.value = null
  detailOpen.value = false
}
</script>

<template>
  <ComCtl scroll>
    <div class="p-3 sm:p-4">
      <VaultEmpty v-if="!vault.entries.length" @new="openEntry()" @format="openType()" @import="importOpen = true" />

      <UiEmpty v-else-if="!filteredEntries.length" class="mx-auto mt-10 max-w-md border-dashed">
        <UiEmptyHeader>
          <UiEmptyMedia variant="icon">
            <Search class="size-6" />
          </UiEmptyMedia>
          <UiEmptyTitle>{{ $t('vault.empty.title') }}</UiEmptyTitle>
          <UiEmptyDescription>{{ $t('vault.search') }}</UiEmptyDescription>
        </UiEmptyHeader>
      </UiEmpty>

      <div v-else class="space-y-5">
        <section v-for="group in groups" :key="group.key" class="rounded-xl border bg-muted/20 p-3 sm:p-4">
          <header class="mb-3 flex items-center gap-2">
            <h2 class="text-sm font-semibold">{{ group.label }}</h2>
            <UiBadge variant="secondary" class="font-normal">{{ group.entries.length }}</UiBadge>
            <span v-if="vault.activeSpaceId === ALL_SPACES" class="ml-auto truncate text-xs text-muted-foreground">
              {{ group.spaceName }}
            </span>
          </header>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <VaultEntryCard
              v-for="entry in group.entries"
              :key="entry.id"
              :entry="entry"
              @open="openDetail(entry)"
              @edit="openEntry(entry)"
              @remove="removing = entry"
            />
          </div>
        </section>
        <p class="text-center text-xs text-muted-foreground">
          {{ $t('vault.entries', { count: filteredEntries.length }) }}
        </p>
      </div>
    </div>

    <template #modals>
      <VaultEntryDetail v-model:open="detailOpen" :entry="detail" @edit="openEntry(detail)" @remove="removing = detail" />
      <UixModal
        :open="!!removing"
        :title="$t('vault.entry.delete')"
        :description="$t('vault.entry.delete.desc')"
        @cancel="removing = null"
        @confirm="removeEntry"
      >
        <p class="flex items-center gap-2 text-sm text-muted-foreground">
          <Trash2 class="size-4" />
          {{ removing?.title }}
        </p>
      </UixModal>
    </template>
  </ComCtl>
</template>

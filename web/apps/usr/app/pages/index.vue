<script setup lang="ts">
import { Pencil, Search, Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { ALL_SPACES } from '~/stores/vault'
import type { VaultEntry } from '~/lib/vault/types'

definePageMeta({
  name: 'index',
  middleware: 'vault',
})

const vault = useVaultStore()
const { openEntry } = useVaultDialogs()
const { filteredEntries } = storeToRefs(vault)

interface EntryGroup {
  key: string
  // The stored group label; empty means the ungrouped bucket.
  group: string
  label: string
  spaceId: string
  spaceName: string
  spaceColor: string
  entries: VaultEntry[]
}

// Groups belong to a space: two spaces may each keep their own `apple` card.
const groups = computed<EntryGroup[]>(() => {
  const byKey = new Map<string, EntryGroup>()
  for (const entry of filteredEntries.value) {
    const key = `${entry.spaceId}::${entry.group}`
    let group = byKey.get(key)
    if (!group) {
      const space = vault.spaces.find((s) => s.id === entry.spaceId)
      group = {
        key,
        group: entry.group,
        label: entry.group || $t('vault.group.none'),
        spaceId: entry.spaceId,
        spaceName: space?.name ?? '',
        spaceColor: space?.color ?? '',
        entries: [],
      }
      byKey.set(key, group)
    }
    group.entries.push(entry)
  }
  // Ungrouped last, then alphabetically: grouped records are the ones the user
  // organized on purpose.
  return [...byKey.values()].sort((a, b) => Number(!a.group) - Number(!b.group) || a.label.localeCompare(b.label))
})

const detail = ref<VaultEntry | null>(null)
const detailOpen = ref(false)
const removing = ref<VaultEntry | null>(null)

const renameOpen = ref(false)
const renameTarget = ref<EntryGroup | null>(null)
const renameDraft = ref('')

function openDetail(entry?: VaultEntry) {
  if (!entry) return
  detail.value = entry
  detailOpen.value = true
}

function openRename(group: EntryGroup) {
  renameTarget.value = group
  renameDraft.value = group.group
  renameOpen.value = true
}

async function renameGroup() {
  if (!renameTarget.value) return
  try {
    await vault.$renameGroup(renameTarget.value.spaceId, renameTarget.value.group, renameDraft.value)
    renameOpen.value = false
    renameTarget.value = null
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
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
      <VaultEmpty v-if="!vault.entries.length" @new="openEntry()" />

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
            <UiButton
              v-if="group.group"
              variant="ghost"
              size="icon"
              class="size-6"
              :title="$t('vault.group.rename')"
              @click="openRename(group)"
            >
              <Pencil class="size-3.5" />
            </UiButton>
            <span v-if="vault.activeSpaceId === ALL_SPACES" class="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: group.spaceColor }" />
              <span class="truncate">{{ group.spaceName }}</span>
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
      <UixModal v-model:open="renameOpen" :title="$t('vault.group.rename')" @cancel="renameOpen = false" @confirm="renameGroup">
        <div class="space-y-1.5">
          <UiLabel for="group-name">{{ $t('vault.group.name') }}</UiLabel>
          <UiInput id="group-name" v-model="renameDraft" :placeholder="$t('vault.group.name.placeholder')" />
        </div>
      </UixModal>
    </template>
  </ComCtl>
</template>

<script setup lang="ts">
import { ALL_SPACES, useVaultStore } from '~/stores/vault'
import type { VaultSpace } from '~/lib/vault/types'

const vault = useVaultStore()
const app = useAppStore()
const user = useUserStore()
// The sidebar avatar and the settings page need the profile populated; without
// this the vault screens render an empty user.
app.$load()
user.$load()
const {
  entryOpen,
  editingEntry,
  importOpen,
  tomlOpen,
  spaceOpen,
  editingSpace,
  typesOpen,
  typeOpen,
  editingType,
  openEntry,
  openSpace,
} = useVaultDialogs()
const isMobileOpen = ref(false)

const scopedSpaceId = computed(() => (vault.activeSpaceId === ALL_SPACES ? undefined : vault.activeSpaceId))
const tomlSpaceId = computed(() => scopedSpaceId.value ?? vault.spaces[0]?.id ?? '')

function downloadToml(space: VaultSpace) {
  const text = vault.$exportSpaceToml(space.id)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${space.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'vault'}.toml`
  link.click()
  URL.revokeObjectURL(url)
}

// "Export" means the space in view; with no space selected every space is
// exported as its own file rather than one merged document.
function exportToml() {
  if (vault.activeSpaceId === ALL_SPACES) {
    for (const space of vault.spaces) downloadToml(space)
    return
  }
  const space = vault.spaces.find((s) => s.id === vault.activeSpaceId)
  if (space) downloadToml(space)
}
</script>

<template>
  <div class="flex size-full overflow-hidden">
    <UiSheet v-model:open="isMobileOpen">
      <UiSheetContent side="left" class="w-70 p-0" :show-close-button="false">
        <UiSheetTitle class="sr-only">{{ $t('app.name') }}</UiSheetTitle>
        <UiSheetDescription class="sr-only">{{ $t('vault.spaces') }}</UiSheetDescription>
        <VaultSidebar @new-space="openSpace()" @edit-space="openSpace($event)" @import="importOpen = true" @navigate="isMobileOpen = false" />
      </UiSheetContent>
    </UiSheet>

    <VaultSidebar class="hidden md:flex" @new-space="openSpace()" @edit-space="openSpace($event)" @import="importOpen = true" />

    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <VaultTopbar
        @menu="isMobileOpen = true"
        @new-entry="openEntry()"
        @import="importOpen = true"
        @export-toml="exportToml"
        @edit-toml="tomlOpen = true"
      />
      <main class="min-h-0 flex-1 overflow-hidden">
        <slot />
      </main>
      <slot name="clean" />
    </div>

    <VaultEntryDialog v-model:open="entryOpen" :entry="editingEntry" :default-space-id="scopedSpaceId" />
    <VaultRecordTypesDialog v-model:open="typesOpen" />
    <VaultRecordTypeDialog v-model:open="typeOpen" :type="editingType" />
    <VaultSpaceDialog v-model:open="spaceOpen" :space="editingSpace" />
    <VaultImportDialog v-model:open="importOpen" :space-id="scopedSpaceId" />
    <VaultTomlDialog v-model:open="tomlOpen" :space-id="tomlSpaceId" />
  </div>
</template>

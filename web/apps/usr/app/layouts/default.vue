<script setup lang="ts">
import { downloadTomlFile } from '~/lib/vault/download'
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
  spaceOpen,
  editingSpace,
  typeOpen,
  editingType,
  editingTypePreset,
  openEntry,
  openSpace,
} = useVaultDialogs()
const isMobileOpen = ref(false)
const exportOpen = ref(false)

const scopedSpaceId = computed(() => (vault.activeSpaceId === ALL_SPACES ? undefined : vault.activeSpaceId))
const activeSpace = computed(() => vault.spaces.find((s) => s.id === vault.activeSpaceId) ?? null)

function downloadToml(space: VaultSpace) {
  downloadTomlFile(space.name, vault.$exportSpaceToml(space.id))
}

// "Export" means the space in view; with no space selected every space is
// exported as its own file rather than one merged document.
function exportToml() {
  exportOpen.value = false
  if (vault.activeSpaceId === ALL_SPACES) {
    for (const space of vault.spaces) downloadToml(space)
    return
  }
  if (activeSpace.value) downloadToml(activeSpace.value)
}
</script>

<template>
  <div class="flex size-full overflow-hidden">
    <UiSheet v-model:open="isMobileOpen">
      <UiSheetContent side="left" class="w-70 p-0" :show-close-button="false">
        <UiSheetTitle class="sr-only">{{ $t('app.name') }}</UiSheetTitle>
        <UiSheetDescription class="sr-only">{{ $t('vault.spaces') }}</UiSheetDescription>
        <VaultSidebar
          @new-space="openSpace()"
          @edit-space="openSpace($event)"
          @import="importOpen = true"
          @export-toml="exportOpen = true"
          @navigate="isMobileOpen = false"
        />
      </UiSheetContent>
    </UiSheet>

    <VaultSidebar
      class="hidden md:flex"
      @new-space="openSpace()"
      @edit-space="openSpace($event)"
      @import="importOpen = true"
      @export-toml="exportOpen = true"
    />

    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <VaultTopbar @menu="isMobileOpen = true" @new-entry="openEntry()" />
      <main class="min-h-0 flex-1 overflow-hidden">
        <slot />
      </main>
      <slot name="clean" />
    </div>

    <VaultEntryDialog v-model:open="entryOpen" :entry="editingEntry" :default-space-id="scopedSpaceId" />
    <VaultRecordTypeDialog v-model:open="typeOpen" :type="editingType" :preset="editingTypePreset" />
    <VaultSpaceDialog v-model:open="spaceOpen" :space="editingSpace" />
    <VaultImportDialog v-model:open="importOpen" :space-id="scopedSpaceId" />
    <UixModal
      v-model:open="exportOpen"
      :title="$t('vault.export.confirm')"
      :description="
        vault.activeSpaceId === ALL_SPACES
          ? $t('vault.export.confirm.all')
          : $t('vault.export.confirm.space', { space: activeSpace?.name ?? '' })
      "
      @cancel="exportOpen = false"
      @confirm="exportToml"
    />
  </div>
</template>

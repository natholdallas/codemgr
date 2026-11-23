<script setup lang="ts">
import { CloudDownload, ShieldAlert } from '@lucide/vue'
import { toast } from 'vue-sonner'

const vault = useVaultStore()
const busy = ref(false)

const open = computed({
  get: () => !!vault.pendingConflict,
  set: (value) => {
    if (!value) vault.pendingConflict = null
  },
})

async function keepLocal() {
  busy.value = true
  try {
    await vault.$overwriteRemote()
    vault.pendingConflict = null
    toast.success($t('sync.account'))
  } catch (err) {
    toast.error($t('sync.error'))
    void err
  } finally {
    busy.value = false
  }
}

async function useCloud() {
  vault.$useRemote()
  await navigateTo({ name: 'unlock' })
}

async function retry() {
  busy.value = true
  try {
    await vault.$mergeRemote()
    if (!vault.pendingConflict) toast.success($t('sync.account'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiDialog v-model:open="open">
    <UiDialogContent class="sm:max-w-md">
      <UiDialogHeader>
        <UiDialogTitle class="flex items-center gap-2">
          <ShieldAlert class="size-4 text-amber-500" />
          {{ $t('conflict.title') }}
        </UiDialogTitle>
        <UiDialogDescription>{{ $t('conflict.desc') }}</UiDialogDescription>
      </UiDialogHeader>

      <div class="space-y-2 py-2">
        <button
          type="button"
          class="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
          :disabled="busy"
          @click="keepLocal"
        >
          <span class="text-sm font-medium">{{ $t('conflict.local') }}</span>
          <span class="block text-xs text-muted-foreground">{{ $t('conflict.local.desc') }}</span>
        </button>
        <button
          type="button"
          class="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
          :disabled="busy"
          @click="useCloud"
        >
          <span class="flex items-center gap-1.5 text-sm font-medium">
            <CloudDownload class="size-3.5" />
            {{ $t('conflict.cloud') }}
          </span>
          <span class="block text-xs text-muted-foreground">{{ $t('conflict.cloud.desc') }}</span>
        </button>
        <UiButton v-if="vault.pendingConflict === 'merge'" variant="ghost" class="w-full" :disabled="busy" @click="retry">
          {{ $t('sync.now') }}
        </UiButton>
      </div>

      <UiDialogFooter>
        <UiButton variant="secondary" @click="open = false">{{ $t('cancel') }}</UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>

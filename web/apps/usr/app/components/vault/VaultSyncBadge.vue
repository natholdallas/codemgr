<script setup lang="ts">
const props = withDefaults(defineProps<{ badge?: boolean }>(), { badge: false })

const vault = useVaultStore()
const auth = useAuthStore()

const label = computed(() => {
  if (vault.pendingConflict) return $t('sync.conflict')
  if (!auth.accessToken) return $t('sync.local')
  if (vault.syncState === 'saving') return $t('sync.saving')
  if (vault.syncState === 'offline') return $t('sync.offline')
  if (vault.syncState === 'error') return $t('sync.error')
  return vault.remoteExists ? $t('sync.account') : $t('sync.local')
})

const dot = computed(() => {
  if (vault.pendingConflict) return 'bg-amber-500'
  if (!auth.accessToken) return 'bg-muted-foreground/50'
  if (vault.syncState === 'offline' || vault.syncState === 'error') return 'bg-destructive'
  if (vault.syncState === 'saving') return 'bg-amber-500 animate-pulse'
  return 'bg-emerald-500'
})

const title = computed(() => (vault.lastSyncAt ? $t('sync.last', { time: vault.lastSyncAt }) : ''))
</script>

<template>
  <UiBadge v-if="props.badge" variant="outline" :title="title" class="gap-1.5 bg-muted/40 px-2 py-0.5 font-normal">
    <span :class="['size-1.5 rounded-full', dot]" />
    {{ label }}
  </UiBadge>
  <span v-else class="inline-flex items-center gap-1.5 text-xs text-muted-foreground" :title="title">
    <span :class="['size-2 rounded-full', dot]" />
    <span class="truncate">{{ label }}</span>
  </span>
</template>

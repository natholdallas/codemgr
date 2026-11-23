<script setup lang="ts">
import { Apis, Stats } from '~/lib/sdk'

definePageMeta({
  name: 'index',
  middleware: 'auth',
})

const { data, send } = useRequest(Apis.Admin.getStats, {
  initialData: inst(Stats),
})

useInterval(send, 30_000)

// Human-readable envelope storage total; the raw byte count is unreadable in a
// KPI card.
function formatBytes(value: number): string {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
</script>

<template>
  <ComCtl class="p-4" scroll>
    <div class="mx-auto max-w-4xl">
      <h1 class="text-h5 mb-4">{{ $t('dashboard.title') }}</h1>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <VCard border>
          <VCardItem>
            <template #prepend>
              <VAvatar color="blue" rounded size="48">
                <VIcon icon="mdi-shield-account" size="28" />
              </VAvatar>
            </template>

            <VCardTitle class="text-h4 font-weight-bold">{{ data.admins }}</VCardTitle>
            <VCardSubtitle>{{ $t('dashboard.total.admins') }}</VCardSubtitle>
          </VCardItem>
        </VCard>

        <VCard border>
          <VCardItem>
            <template #prepend>
              <VAvatar color="green" rounded size="48">
                <VIcon icon="mdi-account-group" size="28" />
              </VAvatar>
            </template>

            <VCardTitle class="text-h4 font-weight-bold">{{ data.users }}</VCardTitle>
            <VCardSubtitle>{{ $t('dashboard.total.users') }}</VCardSubtitle>
          </VCardItem>
        </VCard>

        <VCard border>
          <VCardItem>
            <template #prepend>
              <VAvatar color="purple" rounded size="48">
                <VIcon icon="mdi-safe-square-outline" size="28" />
              </VAvatar>
            </template>

            <VCardTitle class="text-h4 font-weight-bold">{{ data.vaults }}</VCardTitle>
            <VCardSubtitle>{{ $t('dashboard.total.vaults') }}</VCardSubtitle>
          </VCardItem>
        </VCard>

        <VCard border>
          <VCardItem>
            <template #prepend>
              <VAvatar color="amber" rounded size="48">
                <VIcon icon="mdi-database-outline" size="28" />
              </VAvatar>
            </template>

            <VCardTitle class="text-h4 font-weight-bold">{{ formatBytes(data.vaultBytes) }}</VCardTitle>
            <VCardSubtitle>{{ $t('dashboard.total.vault.bytes') }}</VCardSubtitle>
          </VCardItem>
        </VCard>
      </div>
    </div>
  </ComCtl>
</template>

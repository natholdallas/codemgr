<script setup lang="ts">
import { Download, ListChecks, Plus, ShieldCheck } from '@lucide/vue'

const emit = defineEmits<{
  new: []
  format: []
  import: []
}>()
</script>

<template>
  <UiEmpty class="mx-auto mt-10 max-w-md border-dashed">
    <UiEmptyHeader>
      <UiEmptyMedia variant="icon">
        <ShieldCheck class="size-6" />
      </UiEmptyMedia>
      <UiEmptyTitle>{{ $t('vault.empty.title') }}</UiEmptyTitle>
      <UiEmptyDescription>{{ $t('vault.empty.desc') }}</UiEmptyDescription>
    </UiEmptyHeader>
    <UiEmptyContent class="flex-col justify-center sm:flex-row">
      <UiButton @click="emit('new')">
        <Plus class="size-4" />
        {{ $t('vault.entry.new') }}
      </UiButton>
      <UiButton variant="outline" @click="emit('format')">
        <ListChecks class="size-4" />
        {{ $t('vault.format.new') }}
      </UiButton>
      <UiButton variant="outline" @click="emit('import')">
        <Download class="size-4" />
        {{ $t('vault.import') }}
      </UiButton>
    </UiEmptyContent>
  </UiEmpty>
</template>

<script setup lang="ts">
import { Plus, ShieldCheck } from '@lucide/vue'

const emit = defineEmits<{ new: [] }>()
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
    <UiEmptyContent class="justify-center">
      <UiButton @click="emit('new')">
        <Plus class="size-4" />
        {{ $t('vault.entry.new') }}
      </UiButton>
    </UiEmptyContent>
  </UiEmpty>
</template>

<script setup lang="ts">
import { ENTRY_KINDS } from '~/lib/vault/types'
import type { EntryKind } from '~/lib/vault/types'

const vault = useVaultStore()
const { activeKind, activeTypeId, activeTag, sort, allTags } = storeToRefs(vault)

const ALL_FILTER = '__all__'

function setKind(value: unknown) {
  activeKind.value = value === 'all' ? 'all' : (String(value) as EntryKind)
}

function setType(value: unknown) {
  activeTypeId.value = value === ALL_FILTER ? '' : String(value)
}

function setTag(value: unknown) {
  activeTag.value = value === ALL_FILTER ? '' : String(value)
}

function setSort(value: unknown) {
  sort.value = value === 'updated' ? 'updated' : 'title'
}
</script>

<template>
  <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-2">
    <UiSelect :model-value="activeKind" @update:model-value="setKind">
      <UiSelectTrigger class="w-full md:w-32">
        <UiSelectValue :placeholder="$t('vault.filter.kind')" />
      </UiSelectTrigger>
      <UiSelectContent>
        <UiSelectItem value="all">{{ $t('vault.filter.kind') }}</UiSelectItem>
        <UiSelectItem v-for="kind in ENTRY_KINDS" :key="kind" :value="kind">
          {{ $t(`vault.kind.${kind}`) }}
        </UiSelectItem>
      </UiSelectContent>
    </UiSelect>

    <UiSelect v-if="vault.types.length" :model-value="activeTypeId || ALL_FILTER" @update:model-value="setType">
      <UiSelectTrigger class="w-full md:w-32">
        <UiSelectValue :placeholder="$t('vault.filter.format')" />
      </UiSelectTrigger>
      <UiSelectContent>
        <UiSelectItem :value="ALL_FILTER">{{ $t('vault.filter.format') }}</UiSelectItem>
        <UiSelectItem v-for="type in vault.types" :key="type.id" :value="type.id">{{ type.name }}</UiSelectItem>
      </UiSelectContent>
    </UiSelect>

    <UiSelect v-if="allTags.length" :model-value="activeTag || ALL_FILTER" @update:model-value="setTag">
      <UiSelectTrigger class="w-full md:w-32">
        <UiSelectValue :placeholder="$t('vault.filter.tag')" />
      </UiSelectTrigger>
      <UiSelectContent>
        <UiSelectItem :value="ALL_FILTER">{{ $t('vault.filter.tag') }}</UiSelectItem>
        <UiSelectItem v-for="tag in allTags" :key="tag" :value="tag">{{ tag }}</UiSelectItem>
      </UiSelectContent>
    </UiSelect>

    <UiSelect :model-value="sort" @update:model-value="setSort">
      <UiSelectTrigger class="w-full md:w-36">
        <UiSelectValue :placeholder="$t('vault.sort.title')" />
      </UiSelectTrigger>
      <UiSelectContent>
        <UiSelectItem value="title">{{ $t('vault.sort.title') }}</UiSelectItem>
        <UiSelectItem value="updated">{{ $t('vault.sort.updated') }}</UiSelectItem>
      </UiSelectContent>
    </UiSelect>
  </div>
</template>

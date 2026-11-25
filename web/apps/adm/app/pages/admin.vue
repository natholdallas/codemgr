<script setup lang="ts">
import { Admin, AdminIn, Apis } from '~/lib/sdk'
import type { TargetPasswordIn } from '~/lib/sdk'

definePageMeta({
  name: 'admin',
  middleware: 'auth',
})

const app = useAppStore()
app.$load()

const { smAndDown } = useVDisplay()
const { t } = useI18n()
const queries = ref({ page: 1, size: 20, column: 'id', desc: true })

const { mi, mo, sc, su, reset } = useCrud({ ...inst(AdminIn), id: 0 })
const { loading, data, send } = useRequest(
  () =>
    Apis.Admin.list({
      params: queries.value,
    }),
  {
    initialData: { total: 0, page: 0, content: [] },
  },
).onSuccess(reset)
const { loading: creating, send: create } = useRequest(
  () =>
    Apis.Admin.create({
      data: { username: mi.value.username, password: mi.value.password },
    }),
  {
    immediate: false,
  },
).onSuccess(send)
const { loading: updating, send: update } = useRequest(
  () =>
    Apis.Admin.update({
      pathParams: { id: mo.value.id },
      data: { username: mo.value.username },
    }),
  {
    immediate: false,
  },
).onSuccess(() => {
  su.value = false
  send()
})
const { loading: removing, send: remove } = useRequest(
  () =>
    Apis.Admin.remove({
      pathParams: { id: mo.value.id },
    }),
  {
    immediate: false,
  },
).onSuccess(() => {
  removeOpen.value = false
  send()
})

const removeOpen = ref(false)
const infoOpen = ref(false)
const infoItem = ref<Admin>(inst(Admin))

const resetOpen = ref(false)
const resetResult = ref('')
const resetTarget = ref<Admin>(inst(Admin))
const { loading: resetting, send: resetPassword } = useRequest(
  (body: TargetPasswordIn) =>
    Apis.Admin.resetAdminPassword({
      pathParams: { id: resetTarget.value.id },
      data: body,
    }),
  {
    immediate: false,
  },
).onSuccess(({ data }) => {
  resetResult.value = data.password
})

function askReset(item: Admin) {
  resetTarget.value = item
  resetResult.value = ''
  resetOpen.value = true
}

const headers = computed(() =>
  [
    { title: t('model.id'), key: 'id', sortable: true },
    { title: t('user.username'), key: 'username', sortable: true },
    { title: t('user.avatar'), key: 'avatar', sortable: false },
    { key: 'actions', sortable: false, align: 'end' as const },
  ].filter((h) => !(smAndDown.value && h.key === 'id')),
)

function edit(item: Admin) {
  mo.value = cpm({ ...item, password: '' }) as typeof mo.value
  su.value = true
}
function showInfo(item: Admin) {
  infoItem.value = item
  infoOpen.value = true
}
function askRemove(item: Admin) {
  mo.value = cpm({ ...item, password: '' }) as typeof mo.value
  removeOpen.value = true
}

watch(queries, send, { deep: true })
</script>

<template>
  <ComCtl :loading="[loading, resetting]" class="flex flex-col gap-4 p-4 lg:p-6">
    <AppPageHeader icon="mdi-shield-account" :title="$t('urls.admin')" :description="$t('admin.desc')" :count="data.total">
      <template #actions>
        <VBtn color="primary" prepend-icon="mdi-plus" class="text-none" @click="sc = true">{{ $t('create') }}</VBtn>
      </template>
    </AppPageHeader>

    <VCard border rounded="lg" class="flex-1 min-h-0 overflow-hidden">
      <VDataTableServer
        v-model:items-per-page="queries.size"
        v-model:page="queries.page"
        :headers="headers"
        :items="data.content"
        :items-length="data.total"
        :items-per-page-options="[10, 20, 50, 100]"
        :loading="loading || removing"
        :no-data-text="$t('no.data')"
        class="adm-table"
        density="comfortable"
        hover
        @update:options="({ sortBy }) => vtables.sort(queries, sortBy)"
      >
        <template #[`item.id`]="{ item }"
          ><span class="tabular-nums">{{ item.id }}</span></template
        >
        <template #[`item.username`]="{ item }">{{ item.username }}</template>
        <template #[`item.avatar`]="{ item }">
          <VAvatar size="36" rounded="lg" color="primary" variant="tonal" class="overflow-hidden">
            <VxImg v-if="item.avatar" :src="app.mediaUrl(item.avatar)" cover />
            <span v-else class="text-body-medium font-weight-bold">{{ (item.username || '?').slice(0, 1).toUpperCase() }}</span>
          </VAvatar>
        </template>
        <template #[`item.actions`]="{ item }">
          <div class="flex items-center justify-end gap-1">
            <AppIconBtn icon="mdi-pencil" :tooltip="$t('update')" @click="edit(item)" />
            <AppIconBtn v-if="!smAndDown" icon="mdi-lock-reset" :tooltip="$t('reset.password')" @click="askReset(item)" />
            <AppIconBtn v-if="!smAndDown" icon="mdi-information" :tooltip="$t('info')" @click="showInfo(item)" />
            <AppIconBtn icon="mdi-delete" tone="error" :tooltip="$t('remove')" @click="askRemove(item)" />
          </div>
        </template>
      </VDataTableServer>
    </VCard>

    <AppModal v-model="sc" :title="$t('create')" icon="mdi-plus" no-footer>
      <FormAdmin v-model="mi" :loading="creating" @submit="create" />
    </AppModal>

    <AppModal v-model="su" :title="$t('update')" icon="mdi-pencil" no-footer>
      <FormAdmin v-model="mo" :loading="updating" :show-password="false" @submit="update" />
    </AppModal>

    <AppModal v-model="infoOpen" :title="$t('info')" icon="mdi-information" no-footer>
      <AppRecordInfo :info="infoItem" />
    </AppModal>

    <AppResetPassword v-model="resetOpen" :loading="resetting" :result="resetResult" @confirm="(password) => resetPassword({ password })" />

    <AppModal
      v-model="removeOpen"
      :title="$t('dialog')"
      :description="$t('dialog.desc')"
      icon="mdi-delete"
      tone="error"
      :confirm-text="$t('remove')"
      :loading="removing"
      @cancel="removeOpen = false"
      @confirm="remove"
    />
  </ComCtl>
</template>

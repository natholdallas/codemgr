<script setup lang="ts">
import { toast } from 'vue-sonner'

const open = defineModel<boolean>('open', { default: false })
const vault = useVaultStore()

const oldMaster = ref('')
const newMaster = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  oldMaster.value = ''
  newMaster.value = ''
  confirm.value = ''
  error.value = ''
})

async function save() {
  error.value = ''
  if (newMaster.value.length < 8) {
    error.value = $t('unlock.master.hint')
    return
  }
  if (newMaster.value !== confirm.value) {
    error.value = $t('unlock.master.confirm')
    return
  }
  busy.value = true
  try {
    await vault.$changeMaster(oldMaster.value, newMaster.value)
    toast.success($t('success'))
    open.value = false
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message === 'vault:wrong-password' ? $t('unlock.wrong') : message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UixModal
    v-model:open="open"
    :title="$t('unlock.change')"
    :description="$t('unlock.master.hint')"
    :loading="busy"
    @cancel="open = false"
    @confirm="save"
  >
    <div class="space-y-3">
      <div class="space-y-1.5">
        <UiLabel for="old-master">{{ $t('unlock.old') }}</UiLabel>
        <UiInput id="old-master" v-model="oldMaster" type="password" autocomplete="current-password" />
      </div>
      <div class="space-y-1.5">
        <UiLabel for="new-master">{{ $t('unlock.new') }}</UiLabel>
        <UiInput id="new-master" v-model="newMaster" type="password" autocomplete="new-password" />
      </div>
      <div class="space-y-1.5">
        <UiLabel for="new-master-confirm">{{ $t('unlock.master.confirm') }}</UiLabel>
        <UiInput id="new-master-confirm" v-model="confirm" type="password" autocomplete="new-password" />
      </div>
      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
    </div>
  </UixModal>
</template>

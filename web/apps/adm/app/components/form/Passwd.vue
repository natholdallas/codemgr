<script setup lang="ts">
import type { ResetPasswordIn } from '~/lib/sdk'

defineProps<{
  loading: boolean
  submitText?: string
}>()
defineEmits<{
  (e: 'submit'): void
}>()

const model = defineModel<ResetPasswordIn>({ required: true })

const confirm = ref('')

// The dialog is reused across opens; drop the confirmation once the parent
// resets the model after a successful submit.
watch(
  () => model.value.new,
  (v) => {
    if (!v) confirm.value = ''
  },
)

const tooShort = computed(() => model.value.new.length > 0 && model.value.new.length < 4)
const mismatch = computed(() => !tooShort.value && confirm.value.length > 0 && model.value.new !== confirm.value)
const valid = computed(() => model.value.old.length >= 4 && model.value.new.length >= 4 && model.value.new === confirm.value)
</script>

<template>
  <AppForm :loading="loading" :submit-text="submitText" :submit-disabled="!valid" @submit="$emit('submit')">
    <AppPasswordField v-model="model.old" autocomplete="current-password" :label="$t('settings.password.old')" />
    <AppPasswordField v-model="model.new" autocomplete="new-password" :label="$t('settings.password.new')" />
    <AppPasswordField v-model="confirm" autocomplete="new-password" :label="$t('reset.password.confirm')" />
    <p v-if="tooShort" class="text-body-small text-error">{{ $t('reset.password.min') }}</p>
    <p v-else-if="mismatch" class="text-body-small text-error">{{ $t('reset.password.mismatch') }}</p>
  </AppForm>
</template>

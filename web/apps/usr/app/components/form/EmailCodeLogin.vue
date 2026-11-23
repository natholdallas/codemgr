<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import z from 'zod'
import { Apis, CodeIn, EmailCodeIn } from '~/lib/sdk'

defineProps<{
  loading: boolean
  text?: string
}>()
defineEmits<{
  (e: 'submit'): void
}>()

const model = defineModel<EmailCodeIn>({ default: () => inst(EmailCodeIn) })
const schema = toTypedSchema(
  z.object({
    email: z.string({ message: $t('va.required') }).email({ message: $t('auth.email.invalid') }),
    code: z.string({ message: $t('va.required') }).length(6, { message: $t('auth.code.length') }),
  }),
)

const { remaining, start } = useCodeCooldown()
const { loading: sending, send: sendCode } = useRequest(
  () => Apis.Auth.sendCode({ data: inst(CodeIn, { email: model.value.email }) }),
  { immediate: false },
).onSuccess(start)

// A missing address would only produce a 400; wait until there is something to
// send to.
function requestCode() {
  if (sending.value || remaining.value > 0 || !model.value.email) return
  sendCode()
}
</script>

<template>
  <UixForm :model="model" :loading="loading" :text="text" :schema="schema" @submit="$emit('submit')">
    <UixFieldText
      v-model="model.email"
      :label="$t('auth.email')"
      :placeholder="$t('auth.email.placeholder')"
      name="email"
      type="email"
    />
    <UiButton type="button" variant="outline" :disabled="sending || remaining > 0" @click="requestCode">
      {{ remaining > 0 ? $t('auth.resend', { s: remaining }) : $t('auth.send.code') }}
    </UiButton>
    <UixFieldText
      v-model="model.code"
      :label="$t('auth.code')"
      :placeholder="$t('auth.code.placeholder')"
      name="code"
      type="text"
    />
  </UixForm>
</template>

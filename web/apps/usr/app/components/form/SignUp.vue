<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import z from 'zod'
import { Apis, CodeIn, SignUpIn } from '~/lib/sdk'

defineProps<{
  loading: boolean
  text?: string
}>()
defineEmits<{
  (e: 'submit'): void
}>()

const model = defineModel<SignUpIn>({ default: () => inst(SignUpIn) })
const schema = toTypedSchema(
  z
    .object({
      email: z.string({ message: $t('va.required') }).email({ message: $t('auth.email.invalid') }),
      code: z.string({ message: $t('va.required') }).length(6, { message: $t('auth.code.length') }),
      username: z.string({ message: $t('va.required') }).min(3, { message: $t('va.min', { v: 3 }) }).max(50, { message: $t('va.max', { v: 50 }) }),
      password: z.string({ message: $t('va.required') }).min(8, { message: $t('va.min', { v: 8 }) }),
      confirm: z.string({ message: $t('va.required') }),
    })
    .refine((data) => data.password === data.confirm, {
      message: $t('va.eq.passwd'),
      path: ['confirm'],
    }),
)

const { remaining, start } = useCodeCooldown()
const { loading: sending, send: sendCode } = useRequest(
  () => Apis.Auth.signUpCode({ data: inst(CodeIn, { email: model.value.email }) }),
  { immediate: false },
).onSuccess(start)

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
    <UixFieldText
      v-model="model.username"
      :label="$t('user.username')"
      :placeholder="$t('auth.username.placeholder')"
      name="username"
      type="text"
    />
    <UixFieldText
      v-model="model.password"
      :label="$t('user.password')"
      :placeholder="$t('auth.password.placeholder')"
      name="password"
      type="password"
    />
    <UixFieldText
      v-model="model.confirm"
      :label="$t('auth.password.confirm')"
      :placeholder="$t('auth.password.placeholder')"
      name="confirm"
      type="password"
    />
  </UixForm>
</template>

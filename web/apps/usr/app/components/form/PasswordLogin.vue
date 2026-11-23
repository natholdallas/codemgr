<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import z from 'zod'
import { PasswordIn } from '~/lib/sdk'

defineProps<{
  loading: boolean
  text?: string
}>()
defineEmits<{
  (e: 'submit'): void
}>()

const model = defineModel<PasswordIn>({ default: () => inst(PasswordIn) })
const schema = toTypedSchema(
  z.object({
    account: z.string({ message: $t('va.required') }).min(1, { message: $t('va.required') }),
    password: z.string({ message: $t('va.required') }).min(8, { message: $t('va.min', { v: 8 }) }),
  }),
)
</script>

<template>
  <UixForm :model="model" :loading="loading" :text="text" :schema="schema" @submit="$emit('submit')">
    <UixFieldText
      v-model="model.account"
      :label="$t('auth.account')"
      :placeholder="$t('auth.account.placeholder')"
      name="account"
      type="text"
    />
    <UixFieldText
      v-model="model.password"
      :label="$t('user.password')"
      :placeholder="$t('user.password.placeholder')"
      name="password"
      type="password"
    />
  </UixForm>
</template>

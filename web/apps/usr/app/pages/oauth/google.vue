<script setup lang="ts">
import { Apis, GoogleAuthIn } from '~/lib/sdk'

definePageMeta({
  name: 'oauth-google',
  layout: 'minimal',
})

const auth = useAuthStore()
const route = useRoute()
const loading = ref(true)
const msg = ref('')

onMounted(async () => {
  const code = (route.query.code as string) || ''
  const [mode, nonce] = ((route.query.state as string) || '').split(':')
  const expected = mode === 'login' || mode === 'bind' ? sessionStorage.getItem('oauth:' + mode) : null
  // Reject callbacks whose nonce does not match the one this tab generated.
  if (!code || !nonce || expected !== nonce) {
    msg.value = 'oauth.failed'
    loading.value = false
    return
  }
  sessionStorage.removeItem('oauth:' + mode)
  try {
    if (mode === 'bind' && auth.accessToken) {
      await Apis.Profile.bindGoogle({ data: inst(GoogleAuthIn, { code }) })
      msg.value = 'oauth.bound'
      setTimeout(() => navigateTo({ name: 'settings' }), 1000)
    } else {
      const data = await Apis.Auth.signInGoogle({ data: inst(GoogleAuthIn, { code }) })
      auth.$signIn({ data })
    }
  } catch {
    msg.value = 'oauth.failed'
  }
  loading.value = false
})
</script>

<template>
  <ComCtl class="flex items-center justify-center">
    <UiCard class="w-112.5 gap-4 p-6 text-center">
      <UiButton class="pointer-events-none" :class="{ hidden: !loading }" variant="ghost" loading />
      <template v-if="!loading">
        <p class="text-muted-foreground">{{ msg ? $t(msg) : '' }}</p>
        <UiButton v-if="msg === 'oauth.failed'" variant="outline" @click="navigateTo({ name: 'entrance' })">
          {{ $t('sign.in') }}
        </UiButton>
      </template>
    </UiCard>
  </ComCtl>
</template>
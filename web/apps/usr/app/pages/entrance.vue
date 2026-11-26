<script setup lang="ts">
import { ShieldCheck } from '@lucide/vue'
import { Apis, EmailCodeIn, PasswordIn, SignUpIn } from '~/lib/sdk'
import type { TelegramAuth } from '~/lib/sdk'

definePageMeta({
  name: 'entrance',
  middleware: 'entrance',
  layout: 'minimal',
})

const vault = useVaultStore()
// The login page is the only entry for a local-only vault. Lock an existing
// session so “use without an account” always means entering the master password.
if (vault.status === 'unlocked') vault.$lock()
const auth = useAuthStore()
const app = useAppStore()
app.$load()

const tab = ref<'local' | 'account'>('local')
const accountTab = ref<'password' | 'email' | 'signup'>('password')

const passwordForm = ref(inst(PasswordIn))
const { loading: signingPassword, send: signInPassword } = useRequest(
  () =>
    Apis.Auth.signInPassword({
      data: passwordForm.value,
    }),
  {
    immediate: false,
  },
).onSuccess(auth.$signIn)

const emailForm = ref(inst(EmailCodeIn))
const { loading: signingEmail, send: signInEmail } = useRequest(
  () =>
    Apis.Auth.signInEmail({
      data: emailForm.value,
    }),
  {
    immediate: false,
  },
).onSuccess(auth.$signIn)

const signUpForm = ref<SignUpIn & { confirm: string }>({ ...inst(SignUpIn), confirm: '' })
const { loading: signingUp, send: signUp } = useRequest(
  () =>
    Apis.Auth.signUp({
      data: signUpForm.value,
    }),
  {
    immediate: false,
  },
).onSuccess(auth.$signIn)

const google = computed(() => app.cfg.oauth?.google)
const telegram = computed(() => app.cfg.oauth?.telegram)

function signInGoogle() {
  const url = app.googleAuthURL('login')
  if (url) window.location.href = url
}

const { send: signInTelegram } = useRequest(
  (d: TelegramAuth) =>
    Apis.Auth.signInTelegram({
      data: d,
    }),
  {
    immediate: false,
  },
).onSuccess(auth.$signIn)

function onTgAuth(d: TelegramAuth | null) {
  if (d) signInTelegram(d)
}
</script>

<template>
  <div class="grid size-full overflow-auto lg:grid-cols-2">
    <aside
      class="relative hidden flex-col justify-between overflow-hidden border-r bg-gradient-to-br from-primary/15 via-background to-background p-10 lg:flex"
    >
      <div class="flex items-center gap-2.5">
        <span class="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck class="size-5" />
        </span>
        <span class="text-lg font-semibold">{{ $t('app.name') }}</span>
      </div>
      <div class="max-w-sm">
        <h1 class="text-3xl font-semibold tracking-tight">{{ $t('local.title') }}</h1>
        <p class="mt-3 text-sm text-muted-foreground">{{ $t('local.desc') }}</p>
      </div>
      <p class="text-xs text-muted-foreground">{{ $t('account.desc') }}</p>
    </aside>

    <main class="flex items-center justify-center p-6">
      <div class="w-full max-w-md space-y-4">
        <div class="flex items-center gap-2.5 lg:hidden">
          <span class="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck class="size-5" />
          </span>
          <span class="text-lg font-semibold">{{ $t('app.name') }}</span>
        </div>

        <UiTabs v-model="tab" class="w-full">
          <UiTabsList class="grid h-auto w-full grid-cols-2 items-stretch">
            <UiTabsTrigger value="local" class="h-auto min-h-8 py-1.5 text-center leading-tight whitespace-normal">
              {{ $t('local.title') }}
            </UiTabsTrigger>
            <UiTabsTrigger value="account" class="h-auto min-h-8 py-1.5 text-center leading-tight whitespace-normal">
              {{ $t('account.title') }}
            </UiTabsTrigger>
          </UiTabsList>

          <UiTabsContent value="local" class="pt-4">
            <VaultUnlockCard />
          </UiTabsContent>

          <UiTabsContent value="account" class="pt-4">
            <UiCard>
              <UiCardHeader>
                <UiCardTitle>{{ $t('account.title') }}</UiCardTitle>
                <UiCardDescription>{{ $t('account.desc') }}</UiCardDescription>
              </UiCardHeader>
              <UiCardContent>
                <UiTabs v-model="accountTab" class="w-full">
                  <UiTabsList class="grid h-auto w-full grid-cols-3 items-stretch">
                    <UiTabsTrigger value="password" class="h-auto min-h-8 py-1.5 text-center leading-tight whitespace-normal">
                      {{ $t('auth.tab.password') }}
                    </UiTabsTrigger>
                    <UiTabsTrigger value="email" class="h-auto min-h-8 py-1.5 text-center leading-tight whitespace-normal">
                      {{ $t('auth.tab.email') }}
                    </UiTabsTrigger>
                    <UiTabsTrigger value="signup" class="h-auto min-h-8 py-1.5 text-center leading-tight whitespace-normal">
                      {{ $t('auth.tab.signup') }}
                    </UiTabsTrigger>
                  </UiTabsList>
                  <UiTabsContent value="password" class="pt-4">
                    <FormPasswordLogin v-model="passwordForm" :loading="signingPassword" :text="$t('sign.in')" @submit="signInPassword" />
                  </UiTabsContent>
                  <UiTabsContent value="email" class="pt-4">
                    <FormEmailCodeLogin v-model="emailForm" :loading="signingEmail" :text="$t('sign.in')" @submit="signInEmail" />
                  </UiTabsContent>
                  <UiTabsContent value="signup" class="pt-4">
                    <FormSignUp v-model="signUpForm" :loading="signingUp" :text="$t('sign.up')" @submit="signUp" />
                  </UiTabsContent>
                </UiTabs>
                <p v-if="accountTab === 'signup'" class="mt-3 text-xs text-muted-foreground">
                  {{ $t('auth.signup.desc') }}
                </p>

                <template v-if="google?.enabled || telegram?.enabled">
                  <div class="my-5 flex items-center gap-3">
                    <UiSeparator class="flex-1" />
                    <span class="text-xs text-muted-foreground">{{ $t('oauth.divider') }}</span>
                    <UiSeparator class="flex-1" />
                  </div>

                  <div class="flex flex-col gap-2">
                    <UiButton v-if="google?.enabled" variant="outline" type="button" @click="signInGoogle">
                      {{ $t('sign.in.google') }}
                    </UiButton>
                    <div v-if="telegram?.enabled" class="flex min-h-10 items-center justify-center">
                      <OauthTelegramLogin v-if="telegram.botUsername" :bot-username="telegram.botUsername" @auth="onTgAuth" />
                    </div>
                  </div>
                </template>
              </UiCardContent>
            </UiCard>
          </UiTabsContent>
        </UiTabs>
      </div>
    </main>
  </div>
</template>

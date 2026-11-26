<script setup lang="ts">
import { CloudOff, KeyRound, Link2, Lock, Palette, ShieldCheck, Trash2, Upload, UserRound } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { downloadTomlFile } from '~/lib/vault/download'
import { locales } from '~/lib/locale'
import { Apis, ProfileIn, ResetPasswordIn } from '~/lib/sdk'
import type { TelegramAuth } from '~/lib/sdk'

definePageMeta({
  name: 'settings',
  middleware: 'vault',
})

const vault = useVaultStore()
const auth = useAuthStore()
const app = useAppStore()
const user = useUserStore()
app.$load()
user.$load()

const signedIn = computed(() => !!auth.accessToken)
const { profile, loading: findingUser } = storeToRefs(user)

const usrForm = ref(inst(ProfileIn, { username: '' }))
watch(
  () => profile.value.username,
  (v) => {
    usrForm.value.username = v
  },
  { immediate: true },
)
const { loading: savingUsr, send: saveUsr } = useRequest(() => Apis.Profile.update({ data: { username: usrForm.value.username } }), {
  immediate: false,
}).onSuccess(() => {
  user.$load(true)
})
const pwdForm = ref(inst(ResetPasswordIn))
const { loading: savingPwd, send: savePwd } = useRequest(
  () =>
    Apis.Profile.resetPassword({
      data: pwdForm.value,
    }),
  {
    immediate: false,
  },
).onSuccess(() => {
  rst(pwdForm.value, ResetPasswordIn)
})

// ---- third-party login binding ----
const google = computed(() => app.cfg.oauth?.google)
const telegram = computed(() => app.cfg.oauth?.telegram)

function bindGoogle() {
  const url = app.googleAuthURL('bind')
  if (url) window.location.href = url
}

const { loading: bindingTg, send: bindTelegram } = useRequest((d: TelegramAuth) => Apis.Profile.bindTelegram({ data: d }), {
  immediate: false,
}).onSuccess(() => {
  user.$load(true)
})

function onTgAuth(d: TelegramAuth | null) {
  if (d) bindTelegram(d)
}

const { loading: unbinding, send: unbind } = useRequest((platform: string) => Apis.Profile.unbindPlatform({ pathParams: { platform } }), {
  immediate: false,
}).onSuccess(() => {
  user.$load(true)
})

const boundGoogle = computed(() => !!profile.value.googleEmail)
const boundTelegram = computed(() => !!profile.value.telegramName)

// ---- vault security ----
const masterOpen = ref(false)
const resetOpen = ref(false)
const deleteCloudOpen = ref(false)
const exportOpen = ref(false)
const resetText = ref('')
const busy = ref(false)

watch(resetOpen, (open) => {
  if (!open) resetText.value = ''
})

function exportAll() {
  exportOpen.value = false
  // One file per space: merging them would hide which space each record
  // belongs to behind a single filename.
  for (const space of vault.spaces) downloadTomlFile(space.name, vault.$exportSpaceToml(space.id))
}

async function lockNow() {
  vault.$lock()
  await navigateTo({ name: 'unlock' })
}

async function removeCloud() {
  busy.value = true
  try {
    await vault.$deleteRemote()
    toast.success($t('success'))
    deleteCloudOpen.value = false
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

async function resetVault() {
  if (resetText.value !== 'RESET') return
  busy.value = true
  try {
    await vault.$resetVault()
    resetOpen.value = false
    await navigateTo({ name: 'entrance' })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ComCtl :loading="findingUser" class="p-4 lg:p-6" scroll>
    <div class="mx-auto flex max-w-3xl flex-col gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ $t('profile') }}</h1>
        <p class="text-sm text-muted-foreground">{{ $t('settings.desc') }}</p>
      </div>

      <UiCard>
        <UiCardHeader class="space-y-1">
          <UiCardTitle class="flex items-center gap-2 text-base">
            <span class="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Palette class="size-4" />
            </span>
            {{ $t('settings.appearance') }}
          </UiCardTitle>
          <UiCardDescription>{{ $t('settings.appearance.desc') }}</UiCardDescription>
        </UiCardHeader>
        <UiCardContent class="flex flex-col gap-5">
          <div class="space-y-2.5">
            <div class="space-y-0.5">
              <span class="text-sm font-medium">{{ $t('settings.theme') }}</span>
              <p class="text-sm text-muted-foreground">{{ $t('settings.theme.desc') }}</p>
            </div>
            <ThemeSelect />
          </div>
          <UiSeparator />
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="space-y-0.5">
              <span class="text-sm font-medium">{{ $t('locale') }}</span>
              <p class="text-sm text-muted-foreground">{{ $t('locale.desc') }}</p>
            </div>
            <SwitchLang
              :options="Object.values(locales).map(({ k, v }) => ({ label: $t(k), key: k, value: v }))"
              :value="$t(locales[$i18n.locale].k)"
              @update="$i18n.setLocale"
            />
          </div>
        </UiCardContent>
      </UiCard>

      <template v-if="signedIn">
        <UiCard>
          <UiCardContent class="flex items-center gap-4 p-6 sm:gap-5">
            <ProfileAvatarUpload v-model="profile.avatar" class="shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-lg font-semibold">{{ profile.username || $t('settings.no.username') }}</p>
              <p class="truncate text-sm text-muted-foreground">{{ profile.email }}</p>
              <p class="mt-1 text-sm text-muted-foreground">ID: {{ profile.id }}</p>
            </div>
          </UiCardContent>
        </UiCard>

        <UiCard class="flex flex-col">
          <UiCardHeader class="space-y-1">
            <UiCardTitle class="flex items-center gap-2 text-base">
              <span class="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <UserRound class="size-4" />
              </span>
              {{ $t('settings.edit.profile') }}
            </UiCardTitle>
            <UiCardDescription>{{ $t('settings.edit.profile.desc') }}</UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="flex-1">
            <FormProfile v-model="usrForm" :loading="savingUsr" class="flex h-full flex-col" @submit="saveUsr" />
          </UiCardContent>
        </UiCard>

        <UiCard class="flex flex-col">
          <UiCardHeader class="space-y-1">
            <UiCardTitle class="flex items-center gap-2 text-base">
              <span class="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Link2 class="size-4" />
              </span>
              {{ $t('settings.oauth') }}
            </UiCardTitle>
            <UiCardDescription>{{ $t('settings.oauth.desc') }}</UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="flex flex-col divide-y">
            <div v-if="google?.enabled" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="space-y-0.5">
                <span class="text-sm font-medium">{{ $t('oauth.google') }}</span>
                <p class="text-sm text-muted-foreground">
                  {{ boundGoogle ? profile.googleEmail || $t('oauth.bound') : $t('oauth.bind.desc') }}
                </p>
              </div>
              <UiButton v-if="!boundGoogle" variant="outline" size="sm" :disabled="bindingTg || unbinding" @click="bindGoogle">
                {{ $t('oauth.bind') }}
              </UiButton>
              <UiButton v-else variant="ghost" size="sm" :disabled="bindingTg || unbinding" @click="unbind('google')">
                {{ $t('oauth.unbind') }}
              </UiButton>
            </div>

            <div v-if="telegram?.enabled" class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="space-y-0.5">
                <span class="text-sm font-medium">{{ $t('oauth.telegram') }}</span>
                <p class="text-sm text-muted-foreground">
                  {{ boundTelegram ? profile.telegramName : $t('oauth.bind.desc') }}
                </p>
              </div>
              <OauthTelegramLogin v-if="!boundTelegram && telegram.botUsername" :bot-username="telegram.botUsername" @auth="onTgAuth" />
              <UiButton v-else-if="boundTelegram" variant="ghost" size="sm" :disabled="bindingTg || unbinding" @click="unbind('telegram')">
                {{ $t('oauth.unbind') }}
              </UiButton>
            </div>

            <p v-if="!google?.enabled && !telegram?.enabled" class="py-3 text-sm text-muted-foreground">
              {{ $t('oauth.disabled') }}
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard class="flex flex-col">
          <UiCardHeader class="space-y-1">
            <UiCardTitle class="flex items-center gap-2 text-base">
              <span class="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Lock class="size-4" />
              </span>
              {{ $t('settings.change.password') }}
            </UiCardTitle>
            <UiCardDescription>{{ $t('settings.change.password.desc') }}</UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="flex-1">
            <FormRstPwd v-model="pwdForm" :loading="savingPwd" class="flex h-full flex-col" @submit="savePwd" />
          </UiCardContent>
        </UiCard>
      </template>

      <UiCard class="flex flex-col">
        <UiCardHeader class="space-y-1">
          <UiCardTitle class="flex items-center gap-2 text-base">
            <span class="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <ShieldCheck class="size-4" />
            </span>
            {{ $t('settings.vault') }}
          </UiCardTitle>
          <UiCardDescription>{{ $t('settings.vault.desc') }}</UiCardDescription>
        </UiCardHeader>
        <UiCardContent class="flex flex-col divide-y">
          <div class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium">{{ $t('sync.status') }}</span>
              <VaultSyncBadge badge />
            </div>
            <UiButton variant="outline" size="sm" @click="lockNow">
              <Lock class="size-3.5" />
              {{ $t('settings.vault.lock') }}
            </UiButton>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div class="space-y-0.5">
              <span class="text-sm font-medium">{{ $t('unlock.change') }}</span>
              <p class="text-sm text-muted-foreground">{{ $t('unlock.master.hint') }}</p>
            </div>
            <UiButton variant="outline" size="sm" @click="masterOpen = true">
              <KeyRound class="size-3.5" />
              {{ $t('settings.vault.change') }}
            </UiButton>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div class="space-y-0.5">
              <span class="text-sm font-medium">{{ $t('settings.vault.export') }}</span>
              <p class="text-sm text-muted-foreground">{{ $t('settings.vault.export.desc') }}</p>
            </div>
            <UiButton variant="outline" size="sm" @click="exportOpen = true">
              <Upload class="size-3.5" />
              {{ $t('vault.export.toml') }}
            </UiButton>
          </div>

          <div v-if="signedIn" class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div class="space-y-0.5">
              <span class="text-sm font-medium">{{ $t('settings.vault.delete.cloud') }}</span>
              <p class="text-sm text-muted-foreground">{{ $t('settings.vault.delete.cloud.desc') }}</p>
            </div>
            <UiButton variant="outline" size="sm" :disabled="!vault.remoteExists" @click="deleteCloudOpen = true">
              <CloudOff class="size-3.5" />
              {{ $t('settings.vault.delete.cloud') }}
            </UiButton>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div class="space-y-0.5">
              <span class="text-sm font-medium">{{ $t('settings.vault.reset') }}</span>
              <p class="text-sm text-muted-foreground">{{ $t('unlock.forgot.desc') }}</p>
            </div>
            <UiButton
              variant="outline"
              size="sm"
              class="self-center border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              @click="resetOpen = true"
            >
              <Trash2 class="size-3.5" />
              {{ $t('settings.vault.reset') }}
            </UiButton>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <template #modals>
      <VaultMasterPasswordDialog v-model:open="masterOpen" />

      <UixModal
        v-model:open="deleteCloudOpen"
        :title="$t('settings.vault.delete.cloud')"
        :description="$t('settings.vault.delete.cloud.desc')"
        :loading="busy"
        @cancel="deleteCloudOpen = false"
        @confirm="removeCloud"
      />

      <UixModal
        v-model:open="exportOpen"
        :title="$t('vault.export.confirm')"
        :description="$t('vault.export.confirm.all')"
        @cancel="exportOpen = false"
        @confirm="exportAll"
      />

      <UixModal v-model:open="resetOpen" :title="$t('settings.vault.reset')" :description="$t('unlock.forgot.desc')" no-footer>
        <div class="space-y-3">
          <UiInput v-model="resetText" :placeholder="$t('unlock.reset.confirm')" />
          <div class="flex justify-end gap-2">
            <UiButton variant="secondary" @click="resetOpen = false">{{ $t('cancel') }}</UiButton>
            <UiButton variant="destructive" :disabled="resetText !== 'RESET' || busy" @click="resetVault">
              {{ $t('confirm') }}
            </UiButton>
          </div>
        </div>
      </UixModal>
    </template>
  </ComCtl>
</template>

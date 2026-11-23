<script setup lang="ts">
import { toast } from 'vue-sonner'

const vault = useVaultStore()

const master = ref('')
const confirm = ref('')
const resetText = ref('')
const busy = ref(false)
const error = ref('')
const forgot = ref(false)

const mode = computed(() => (vault.corrupt ? 'corrupt' : vault.status === 'empty' ? 'create' : 'unlock'))

function resetFields() {
  master.value = ''
  confirm.value = ''
  resetText.value = ''
  error.value = ''
  forgot.value = false
}

watch(mode, resetFields)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    if (mode.value === 'create') {
      if (master.value.length < 8) {
        error.value = $t('unlock.master.hint')
        return
      }
      if (master.value !== confirm.value) {
        error.value = $t('unlock.master.confirm')
        return
      }
      await vault.$create(master.value)
      resetFields()
      await navigateTo({ name: 'index' })
      return
    }
    await vault.$unlock(master.value)
    resetFields()
    await navigateTo({ name: 'index' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message === 'vault:wrong-password' ? $t('unlock.wrong') : message
  } finally {
    busy.value = false
  }
}

async function reset() {
  if (resetText.value !== 'RESET') return
  busy.value = true
  try {
    await vault.$resetVault()
    resetFields()
    await navigateTo({ name: 'unlock' })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

function useCloud() {
  vault.$useRemote()
  resetFields()
}
</script>

<template>
  <UiCard class="w-full max-w-md">
    <UiCardHeader>
      <UiCardTitle>{{ mode === 'create' ? $t('unlock.create') : $t('unlock.title') }}</UiCardTitle>
      <UiCardDescription>
        {{ mode === 'create' ? $t('unlock.create.desc') : mode === 'corrupt' ? $t('unlock.corrupt') : $t('unlock.desc') }}
      </UiCardDescription>
    </UiCardHeader>

    <UiCardContent class="space-y-4">
      <template v-if="mode === 'corrupt'">
        <p class="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {{ $t('unlock.corrupt') }}
        </p>
        <UiButton v-if="vault.remoteEnvelope" variant="outline" class="w-full" @click="useCloud">
          {{ $t('conflict.cloud') }}
        </UiButton>
        <div class="space-y-2 rounded-lg border border-dashed p-3">
          <p class="text-xs text-muted-foreground">{{ $t('unlock.forgot.desc') }}</p>
          <UiInput v-model="resetText" :placeholder="$t('unlock.reset.confirm')" />
          <UiButton variant="destructive" class="w-full" :disabled="resetText !== 'RESET' || busy" @click="reset">
            {{ $t('unlock.reset') }}
          </UiButton>
        </div>
      </template>

      <template v-else>
        <form class="space-y-3" @submit.prevent="submit">
          <div class="space-y-1.5">
            <UiLabel for="master">{{ $t('unlock.master') }}</UiLabel>
            <UiInput id="master" v-model="master" type="password" autocomplete="current-password" autofocus />
            <p v-if="mode === 'create'" class="text-xs text-muted-foreground">{{ $t('unlock.master.hint') }}</p>
          </div>
          <div v-if="mode === 'create'" class="space-y-1.5">
            <UiLabel for="master-confirm">{{ $t('unlock.master.confirm') }}</UiLabel>
            <UiInput id="master-confirm" v-model="confirm" type="password" autocomplete="new-password" />
          </div>

          <p v-if="error" class="text-xs text-destructive">{{ error }}</p>

          <UiButton type="submit" class="w-full" :disabled="busy || !master">
            <UiSpinner v-if="busy" class="size-4 animate-spin" />
            {{ mode === 'create' ? $t('unlock.create') : $t('unlock.title') }}
          </UiButton>
        </form>

        <div v-if="mode === 'unlock'" class="border-t pt-3">
          <button type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="forgot = !forgot">
            {{ $t('unlock.forgot') }}
          </button>
          <div v-if="forgot" class="mt-2 space-y-2 rounded-lg border border-dashed p-3">
            <p class="text-xs text-muted-foreground">{{ $t('unlock.forgot.desc') }}</p>
            <UiInput v-model="resetText" :placeholder="$t('unlock.reset.confirm')" />
            <UiButton variant="destructive" size="sm" class="w-full" :disabled="resetText !== 'RESET' || busy" @click="reset">
              {{ $t('unlock.reset') }}
            </UiButton>
          </div>
        </div>
      </template>
    </UiCardContent>
  </UiCard>
</template>

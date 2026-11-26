import { useLocalStorage } from '@vueuse/core'
import type { Auth as AuthType } from '~/lib/sdk/models'
import Apis from '~/lib/sdk'
import { Auth } from '~/lib/sdk/models'

let refreshing: Promise<boolean> | null = null

export const useAuthStore = defineStore('auth', () => {
  const auth = useLocalStorage('auth', inst(Auth), { mergeDefaults: true })

  // Signing in also reconciles the vault: an unlocked vault merges/uploads its
  // envelope, a locked one keeps its local copy and lets the unlock screen ask
  // for the master password.
  async function $signIn({ data }: { data: AuthType }) {
    Object.assign(auth.value, data)
    useUserStore().$reset()
    const vault = useVaultStore()
    await vault.$onSignedIn()
    // The layout asked for the profile before there was a token, so fetch it now
    // that the account (and the avatar) are known.
    await useUserStore().$load(true)
    navigateTo({ name: vault.status === 'unlocked' ? 'index' : 'unlock' })
  }

  async function $refresh(): Promise<boolean> {
    if (refreshing) {
      return refreshing
    }
    refreshing = (async () => {
      try {
        // The refresh token itself is an httpOnly cookie the browser attaches
        // to this call; nothing here can read it.
        const data = await Apis.Auth.refresh({ meta: { isRefresh: true } })
        Object.assign(auth.value, { id: data.id, accessToken: data.accessToken })
        return true
      } catch {
        return false
      }
    })()
    try {
      return await refreshing
    } finally {
      refreshing = null
    }
  }

  async function $signOut() {
    try {
      // Unconditional: the server clears the cookie and treats "no session" as
      // success, so signing out of an already-expired session still works.
      await Apis.Auth.logout()
    } catch {
      // ignore
    }
    // Lock before clearing the tokens: the encrypted local copy stays, so the
    // vault keeps working offline after signing out.
    useVaultStore().$onSignedOut()
    Object.assign(auth.value, inst(Auth))
    useUserStore().$reset()
    navigateTo({ name: 'entrance' })
  }

  return { ...toRefs(auth.value), $signIn, $signOut, $refresh }
})

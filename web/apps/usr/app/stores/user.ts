import Apis, { Profile } from '~/lib/sdk'

// Current user's profile, shared by the settings page and the header avatar so
// both stay in sync after an avatar upload or profile edit.
export const useUserStore = defineStore('user', () => {
  const profile = ref<Profile>(inst(Profile))
  const loading = ref(false)

  async function $load(force = false) {
    // Signed-out sessions (local-only vaults) have no profile endpoint to call.
    if (!useAuthStore().accessToken) return
    if (!force && profile.value.id) return
    loading.value = true
    try {
      Object.assign(profile.value, await Apis.Profile.find())
    } catch {
      // 401 is handled by the SDK; any other failure keeps the previous value
      // so the page still renders.
    } finally {
      loading.value = false
    }
  }

  function $reset() {
    profile.value = inst(Profile)
  }

  return { profile, loading, $load, $reset }
})

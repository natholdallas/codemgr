// Guard for the unlock/create screen: an unlocked vault has nothing to do here,
// and a signed-out visitor with no local vault belongs on the entrance page.
export default defineNuxtRouteMiddleware(async () => {
  const vault = useVaultStore()
  const auth = useAuthStore()
  await vault.$init()
  if (vault.status === 'unlocked') {
    return navigateTo({ name: 'index' })
  }
  if (vault.status === 'empty' && !auth.accessToken) {
    return navigateTo({ name: 'entrance' })
  }
})

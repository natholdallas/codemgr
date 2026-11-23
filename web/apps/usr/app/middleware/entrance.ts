// Guard for the sign-in / local-vault chooser. Signed-out visitors may always
// stay: they can sign in, or unlock a local vault without an account.
export default defineNuxtRouteMiddleware(async () => {
  const vault = useVaultStore()
  const auth = useAuthStore()
  await vault.$init()
  if (!auth.accessToken) return
  return navigateTo({ name: vault.status === 'unlocked' ? 'index' : 'unlock' })
})

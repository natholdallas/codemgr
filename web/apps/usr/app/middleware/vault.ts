// Guard for every authenticated vault screen: the vault must be initialised
// (local envelope read, cloud copy fetched) before the page renders.
export default defineNuxtRouteMiddleware(async () => {
  const vault = useVaultStore()
  const auth = useAuthStore()
  await vault.$init()
  if (vault.status === 'empty') {
    return navigateTo({ name: auth.accessToken ? 'unlock' : 'entrance' })
  }
  if (vault.status === 'locked') {
    return navigateTo({ name: 'unlock' })
  }
})

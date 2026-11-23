<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <UiToaster />
  <!-- Mounted once, above every layout: a sync conflict must be resolvable from
       whichever page the user happens to be on. Lazy, because the vault store
       pulls in the SDK, which reads runtimeConfig at module scope and therefore
       cannot be part of the eagerly-evaluated entry chunk. -->
  <LazyVaultConflictDialog />
</template>

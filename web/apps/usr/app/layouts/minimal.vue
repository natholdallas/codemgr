<template>
  <div class="flex fixed size-full overflow-hidden">
    <div class="flex flex-col size-full overflow-hidden">
      <main class="flex-1 min-h-0 overflow-hidden">
        <slot />
      </main>
      <div class="contents">
        <slot name="clean" />
      </div>
    </div>
  </div>
</template>

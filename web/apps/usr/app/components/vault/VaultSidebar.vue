<script setup lang="ts">
import { Download, GripVertical, LibraryBig, Lock, LogIn, LogOut, Pencil, Plus, Settings, ShieldCheck, UserRound } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { VueDraggable } from 'vue-draggable-plus'
import { vaultIcon } from '~/lib/vault/icons'
import type { VaultSpace } from '~/lib/vault/types'

const emit = defineEmits<{
  'new-space': []
  'edit-space': [space: VaultSpace]
  'import': []
  'navigate': []
}>()

const vault = useVaultStore()
const auth = useAuthStore()
const user = useUserStore()
const app = useAppStore()
const { spaces, spaceCounts, activeSpaceId, entries, status } = storeToRefs(vault)
const { profile } = storeToRefs(user)
const isLogoutOpen = ref(false)

const signedIn = computed(() => !!auth.accessToken)
const total = computed(() => entries.value.length)

// The draggable list owns its own array: mutating `spaces` (a derived, filtered
// view) directly would fight the store on every save.
const orderedSpaces = ref<VaultSpace[]>([])
watch(
  spaces,
  (list) => {
    orderedSpaces.value = [...list]
  },
  { immediate: true },
)

async function commitOrder() {
  try {
    await vault.$reorderSpaces(orderedSpaces.value.map((s) => s.id))
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
  }
}

function select(id: string) {
  vault.$setActiveSpace(id)
  emit('navigate')
  // The sidebar is visible on settings too; picking a space must leave the
  // settings page instead of only changing state behind it.
  if (useRoute().name !== 'index') void navigateTo({ name: 'index' })
}

// Locking must leave the decrypted view: staying on the index with an empty doc
// would show "no entries" as if the vault had been emptied.
async function lockNow() {
  vault.$lock()
  await navigateTo({ name: 'unlock' })
}
</script>

<template>
  <div class="flex h-full w-70 shrink-0 flex-col border-r bg-sidebar">
    <div class="flex h-15 items-center gap-2.5 border-b px-4">
      <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <ShieldCheck class="size-4.5" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold tracking-[0.12em]">{{ $t('app.name') }}</p>
        <VaultSyncBadge />
      </div>
      <UiButton v-if="status === 'unlocked'" variant="ghost" size="icon" :title="$t('vault.lock')" @click="lockNow">
        <Lock class="size-4" />
      </UiButton>
    </div>

    <UiScrollArea class="flex-1">
      <nav class="space-y-1 p-2">
        <button
          type="button"
          :class="[
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
            activeSpaceId === 'all'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
          ]"
          @click="select('all')"
        >
          <LibraryBig class="size-4 shrink-0" />
          <span class="flex-1 truncate">{{ $t('vault.all') }}</span>
          <span class="text-xs text-muted-foreground">{{ total }}</span>
        </button>

        <VueDraggable
          v-model="orderedSpaces"
          :animation="150"
          handle=".space-grip"
          :delay="250"
          :delay-on-touch-only="true"
          ghost-class="opacity-40"
          class="space-y-1"
          @end="commitOrder"
        >
          <div v-for="space in orderedSpaces" :key="space.id" class="group/space relative">
            <button
              type="button"
              :class="[
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                activeSpaceId === space.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
              ]"
              @click="select(space.id)"
            >
              <template v-if="vaultIcon(space.icon)">
                <span
                  class="grid size-5 shrink-0 place-items-center rounded-md"
                  :style="{ backgroundColor: `color-mix(in srgb, ${space.color} 18%, transparent)`, color: space.color }"
                >
                  <component :is="vaultIcon(space.icon)" class="size-3.5" />
                </span>
              </template>
              <span v-else class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: space.color }" />
              <span class="flex-1 truncate">{{ space.name }}</span>
              <span class="hidden text-xs text-muted-foreground md:inline md:group-hover/space:opacity-0">
                {{ spaceCounts[space.id] ?? 0 }}
              </span>
            </button>
            <div
              class="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/space:opacity-100 md:focus-within:opacity-100"
            >
              <!-- The handle is the only drag origin: a row swipe on a phone must
                   still scroll the list, so touch drags wait for a 250ms hold. -->
              <span
                class="space-grip grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing"
                :title="$t('vault.space.reorder')"
                @click.stop
              >
                <GripVertical class="size-3.5" />
              </span>
              <button
                type="button"
                class="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground"
                :title="$t('vault.space.edit')"
                @click.stop="emit('edit-space', space)"
              >
                <Pencil class="size-3.5" />
              </button>
            </div>
          </div>
        </VueDraggable>

        <UiButton variant="ghost" size="sm" class="w-full justify-start text-muted-foreground" @click="emit('new-space')">
          <Plus class="size-4" />
          {{ $t('vault.space.new') }}
        </UiButton>
      </nav>
    </UiScrollArea>

    <div class="space-y-1 border-t p-2">
      <UiButton variant="ghost" size="sm" class="w-full justify-start text-muted-foreground" @click="emit('import')">
        <Download class="size-4" />
        {{ $t('vault.import') }}
      </UiButton>

      <NuxtLink
        v-if="!signedIn"
        :to="{ name: 'entrance' }"
        class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        @click="emit('navigate')"
      >
        <LogIn class="size-4" />
        {{ $t('sync.signin') }}
      </NuxtLink>

      <div class="flex items-center gap-2 rounded-lg px-2 py-1.5">
        <NuxtLink :to="{ name: 'settings' }" class="shrink-0" @click="emit('navigate')">
          <UiAvatar v-if="signedIn" class="size-8">
            <UiAvatarImage v-if="profile.avatar" :src="app.mediaUrl(profile.avatar)" alt="" />
            <UiAvatarFallback>{{ (profile.username || '?').slice(0, 1).toUpperCase() }}</UiAvatarFallback>
          </UiAvatar>
          <span v-else class="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <UserRound class="size-4" />
          </span>
        </NuxtLink>
        <NuxtLink :to="{ name: 'settings' }" class="min-w-0 flex-1" @click="emit('navigate')">
          <p class="truncate text-sm font-medium">{{ signedIn ? profile.username || $t('user') : $t('profile.local') }}</p>
          <p class="truncate text-xs text-muted-foreground">{{ signedIn ? $t('sync.on') : $t('sync.local') }}</p>
        </NuxtLink>
        <NuxtLink :to="{ name: 'settings' }" class="text-muted-foreground hover:text-foreground" :title="$t('settings')" @click="emit('navigate')">
          <Settings class="size-4" />
        </NuxtLink>
        <button
          v-if="signedIn"
          type="button"
          class="text-muted-foreground hover:text-foreground"
          :title="$t('sign.out')"
          @click="isLogoutOpen = true"
        >
          <LogOut class="size-4" />
        </button>
      </div>
    </div>

    <UixModal
      v-model:open="isLogoutOpen"
      :title="$t('sign.out')"
      :description="$t('sign.out.desc')"
      @cancel="isLogoutOpen = false"
      @confirm="auth.$signOut()"
    />
  </div>
</template>

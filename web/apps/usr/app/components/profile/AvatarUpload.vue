<script setup lang="ts">
import { Camera, Loader2, UserRound } from '@lucide/vue'
import { Cropper } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'
import { toast } from 'vue-sonner'
import Apis from '~/lib/sdk'

// Avatar picker: the user selects a local image, crops it in a modal, and the
// cropped 512x512 PNG is uploaded. The backend stores the bytes verbatim, so
// the aspect ratio and output size are decided here.
const model = defineModel<string>({ default: '' })

const { t } = useI18n()
const app = useAppStore()
app.$load()

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const MAX_INPUT_SIZE = 10 * 1024 * 1024
const MAX_INPUT_DIMENSION = 4096

const src = ref('')
const cropping = ref(false)
const fileInput = ref<HTMLInputElement>()
const cropper = ref<{ getResult: () => { canvas: HTMLCanvasElement | null } }>()

const { loading: uploading, send: upload } = useRequest(
  (file: File) => Apis.Profile.uploadAvatar({ data: { file } }),
  { immediate: false },
).onSuccess(({ data }) => {
  model.value = data.avatar
  cropping.value = false
})

const { loading: removing, send: remove } = useRequest(() => Apis.Profile.deleteAvatar(), {
  immediate: false,
}).onSuccess(({ data }) => {
  model.value = data.avatar
})

function clearSrc() {
  if (src.value) {
    URL.revokeObjectURL(src.value)
    src.value = ''
  }
}

// The object URL is only valid while the cropper is open.
watch(cropping, (open) => {
  if (!open) clearSrc()
})

function onPick(e: Event) {
  const el = e.target as HTMLInputElement
  const file = el.files?.[0]
  // Reset immediately so picking the same file twice fires change again.
  el.value = ''
  if (!file) return
  if (!ACCEPT.includes(file.type)) {
    toast.error(t('avatar.invalid.type'))
    return
  }
  if (file.size > MAX_INPUT_SIZE) {
    toast.error(t('avatar.invalid.size'))
    return
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    if (img.naturalWidth > MAX_INPUT_DIMENSION || img.naturalHeight > MAX_INPUT_DIMENSION) {
      toast.error(t('avatar.invalid.dimensions'))
      URL.revokeObjectURL(url)
      return
    }
    clearSrc()
    src.value = url
    cropping.value = true
  }
  img.onerror = () => {
    toast.error(t('avatar.invalid.type'))
    URL.revokeObjectURL(url)
  }
  img.src = url
}

function confirm() {
  const canvas = cropper.value?.getResult().canvas
  if (!canvas) return
  canvas.toBlob((blob) => {
    if (!blob) return
    // PNG keeps the crop lossless and gives the server a predictable MIME type.
    upload(new File([blob], 'avatar.png', { type: 'image/png' }))
  }, 'image/png')
}
</script>

<template>
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="relative grid size-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground transition hover:opacity-80 disabled:pointer-events-none disabled:opacity-50"
      :disabled="uploading || removing"
      @click="fileInput?.click()"
    >
      <UiAvatar class="size-full rounded-full">
        <UiAvatarImage v-if="model" :src="app.mediaUrl(model)" alt="" class="size-full object-cover" />
        <UiAvatarFallback v-else class="bg-transparent">
          <UserRound class="size-6" />
        </UiAvatarFallback>
      </UiAvatar>
      <span class="absolute bottom-1 right-1 grid size-5 place-items-center rounded-full bg-background shadow-sm">
        <Camera class="size-3" />
      </span>
      <Loader2 v-if="uploading" class="absolute size-5 animate-spin" />
    </button>
    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      accept="image/jpeg,image/png,image/webp"
      :disabled="uploading || removing"
      @change="onPick"
    >
    <div class="min-w-0 space-y-1">
      <p class="text-sm font-medium">{{ $t('avatar') }}</p>
      <UiButton
        v-if="model"
        variant="link"
        size="xs"
        class="h-auto p-0 text-muted-foreground"
        :disabled="uploading || removing"
        @click="remove()"
      >
        {{ $t('avatar.remove') }}
      </UiButton>
    </div>
  </div>

  <UiDialog v-model:open="cropping">
    <UiDialogContent>
      <UiDialogHeader>
        <UiDialogTitle>{{ $t('avatar.crop.title') }}</UiDialogTitle>
        <UiDialogDescription>{{ $t('avatar.crop.desc') }}</UiDialogDescription>
      </UiDialogHeader>
      <Cropper
        ref="cropper"
        :src="src"
        :stencil-props="{ aspectRatio: 1 }"
        :canvas="{ width: 512, height: 512 }"
        class="h-80 w-full"
      />
      <UiDialogFooter>
        <UiButton variant="outline" :disabled="uploading" @click="cropping = false">
          {{ $t('cancel') }}
        </UiButton>
        <UiButton :disabled="uploading" @click="confirm">
          <Loader2 v-if="uploading" class="animate-spin" />
          {{ $t('confirm') }}
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>

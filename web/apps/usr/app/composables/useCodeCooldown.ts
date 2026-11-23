// 60-second resend cooldown shared by the code-based auth forms. The server
// enforces the same window; this only keeps the button honest.
export function useCodeCooldown(seconds = 60) {
  const remaining = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined

  function start() {
    remaining.value = seconds
    clearInterval(timer)
    timer = setInterval(() => {
      remaining.value -= 1
      if (remaining.value <= 0) clearInterval(timer)
    }, 1000)
  }

  onUnmounted(() => clearInterval(timer))

  return { remaining, start }
}

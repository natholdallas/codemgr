// Visual identity per entry kind, shared by the card, detail sheet and editor so
// the same kind always looks the same.
import { Boxes, Globe, KeyRound, Server, StickyNote } from '@lucide/vue'
import type { Component } from 'vue'
import type { EntryKind } from './types'

export const KIND_META: Record<EntryKind, { icon: Component; tile: string }> = {
  login: { icon: Globe, tile: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  key: { icon: KeyRound, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  server: { icon: Server, tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  note: { icon: StickyNote, tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  custom: { icon: Boxes, tile: 'bg-muted text-muted-foreground' },
}

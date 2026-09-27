import { create } from "zustand"
import { persist } from "zustand/middleware"
import { guardedLocalStorage } from "../lib/persistStorage"

export type WorkspacePage = "game" | "character" | "history" | "manage" | "rooms" | "settings"
interface PlayWorkspace {
  page: WorkspacePage
  drafts: Record<string, string>
  scroll: Record<string, number>
  recentDice: string[]
  sendOnEnter: boolean
  setPage: (page: WorkspacePage) => void
  setDraft: (scope: string, text: string) => void
  setScroll: (scope: string, position: number) => void
  rememberDice: (expression: string) => void
  setSendOnEnter: (value: boolean) => void
}

export const usePlayWorkspace = create<PlayWorkspace>()(
  persist(
    (set) => ({
      page: "game",
      drafts: {},
      scroll: {},
      recentDice: [],
      sendOnEnter: true,
      setPage: (page) => set({ page }),
      setDraft: (scope, text) => set((s) => ({ drafts: { ...s.drafts, [scope]: text.slice(0, 20000) } })),
      setScroll: (scope, position) => set((s) => ({ scroll: { ...s.scroll, [scope]: position } })),
      rememberDice: (expression) =>
        set((s) => ({
          recentDice: [expression, ...s.recentDice.filter((x) => x !== expression)].slice(0, 6),
        })),
      setSendOnEnter: (sendOnEnter) => set({ sendOnEnter }),
    }),
    {
      name: "loreweaver-play-workspace",
      storage: guardedLocalStorage,
      partialize: (s) => ({ drafts: s.drafts, recentDice: s.recentDice, sendOnEnter: s.sendOnEnter }),
    },
  ),
)

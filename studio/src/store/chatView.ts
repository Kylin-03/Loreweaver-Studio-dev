import { create } from "zustand"
import { persist } from "zustand/middleware"
import { guardedLocalStorage } from "../lib/persistStorage"

export type ChatLimit = 50 | 100 | 200
interface ChatViewState {
  limit: ChatLimit
  sidebarCollapsed: boolean
  scope: string | null
  highWatermark: number
  cleared: Record<string, number>
  setLimit: (limit: ChatLimit) => void
  toggleSidebar: () => void
  enter: (scope: string | null, watermark?: number) => void
  observe: (frame: unknown) => boolean
  markCleared: () => void
}

export const useChatViewStore = create<ChatViewState>()(
  persist(
    (set, get) => ({
      limit: 100,
      sidebarCollapsed: false,
      scope: null,
      highWatermark: 0,
      cleared: {},
      setLimit: (limit) => set({ limit: [50, 100, 200].includes(limit) ? limit : 100 }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      enter: (scope, watermark = 0) => set({ scope, highWatermark: watermark }),
      observe: (frame) => {
        if (!frame || typeof frame !== "object") return true
        const value = frame as Record<string, unknown>
        if (!["narrative", "dice", "system", "error"].includes(String(value.type))) return true
        const seq =
          Number.isSafeInteger(value.history_seq) && Number(value.history_seq) >= 0
            ? Number(value.history_seq)
            : 0
        if (typeof value.history_scope === "string" && value.history_scope !== get().scope) {
          set({ scope: value.history_scope, highWatermark: 0 })
        }
        const state = get()
        if (seq > state.highWatermark) set({ highWatermark: seq })
        if (!state.scope || value.replay !== true) return true
        const cutoff = state.cleared[state.scope]
        return cutoff === undefined || seq > cutoff
      },
      markCleared: () => {
        const { scope, highWatermark, cleared } = get()
        if (scope) set({ cleared: { ...cleared, [scope]: highWatermark } })
      },
    }),
    {
      name: "loreweaver-chat-view",
      storage: guardedLocalStorage,
      partialize: (s) => ({ limit: s.limit, sidebarCollapsed: s.sidebarCollapsed, cleared: s.cleared }),
    },
  ),
)

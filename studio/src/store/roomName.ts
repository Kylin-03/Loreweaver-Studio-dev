import { create } from "zustand"
import { transportSend } from "../lib/transport"

interface RoomNameState {
  name: string | null
  editable: boolean
  pending: boolean
  error: string | null
  save: (name: string) => Promise<void>
  ingest: (frame: unknown, room: string | undefined) => boolean
  reset: () => void
}

const EMPTY = { name: null, editable: false, pending: false, error: null }

export const useRoomNameStore = create<RoomNameState>((set, get) => ({
  ...EMPTY,
  reset: () => set(EMPTY),
  save: async (name) => {
    if (get().pending || !get().editable) return
    set({ pending: true, error: null })
    try {
      await transportSend({ type: "admin_set_room_name", name: name.trim() })
    } catch (error) {
      set({ pending: false, error: String(error) })
    }
  },
  ingest: (frame, room) => {
    if (!frame || typeof frame !== "object") return false
    const value = frame as Record<string, unknown>
    if (value.type === "admin_room_name") {
      if (room && value.room === room && typeof value.name === "string") {
        set({ name: value.name, pending: false, error: null })
      }
      return true
    }
    if (value.type === "state") {
      set({
        name: typeof value.room_name === "string" ? value.room_name : null,
        editable: value.room_name_editable === true,
      })
    }
    if (value.type === "admin_error" && get().pending) {
      set({ pending: false, error: String(value.message ?? value.code ?? "") })
    }
    return false
  },
}))

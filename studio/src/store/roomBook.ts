import { invoke } from "@tauri-apps/api/core"
import { create } from "zustand"
import type { WelcomeFrame } from "@loreweaver/protocol"
import { isTauri, type TransportConnectParams } from "../lib/transport"
import { useRoomNameStore } from "./roomName"

export interface SavedRoom {
  id: string
  serverId: string
  room: string
  name: string
  identity: string
  role: string
  home: string | null
  lastUsed: number
}
interface RoomBookState {
  rooms: SavedRoom[]
  active: SavedRoom | null
  pending: (TransportConnectParams & { home?: string }) | null
  error: string | null
  refresh: () => Promise<void>
  begin: (params: TransportConnectParams, home?: string) => void
  remember: (welcome: WelcomeFrame) => Promise<void>
  updateName: (name: string) => Promise<void>
}

let refreshGeneration = 0
let welcomeGeneration = 0
let renameQueue = Promise.resolve()
const errorCode = (error: unknown) =>
  /^roomBook\.[a-zA-Z]+$/.test(String(error)) ? String(error) : "roomBook.writeFailed"

/** Credentials remain in memory for the active handshake; persistence is native-only. */
export const useRoomBookStore = create<RoomBookState>((set, get) => ({
  rooms: [],
  active: null,
  pending: null,
  error: null,
  refresh: async () => {
    if (!isTauri()) return
    const generation = ++refreshGeneration
    try {
      const rooms = await invoke<SavedRoom[]>("room_book_list")
      if (generation === refreshGeneration) set({ rooms, error: null })
    } catch (error) {
      if (generation === refreshGeneration) set({ error: errorCode(error) })
    }
  },
  begin: (params, home) => {
    ++welcomeGeneration
    set({ pending: { ...params, home }, active: null, error: null })
  },
  remember: async (welcome) => {
    const pending = get().pending
    if (!pending || !isTauri()) return
    const generation = ++welcomeGeneration
    try {
      const active = await invoke<SavedRoom>("room_book_save", {
        connection: {
          ticket: pending.ticket,
          key: pending.key,
          home: pending.home ?? null,
          room: welcome.room,
          name: welcome.room,
          identity: welcome.you.id,
          role: welcome.you.role,
        },
      })
      if (get().pending !== pending || generation !== welcomeGeneration) return
      set({ active, error: null })
      // Initial state may arrive while the native save is pending.
      const name = useRoomNameStore.getState().name
      if (name !== null && name !== active.name) await get().updateName(name)
      else await get().refresh()
    } catch (error) {
      if (get().pending === pending && generation === welcomeGeneration) set({ error: errorCode(error) })
    }
  },
  updateName: async (name) => {
    const active = get().active
    if (!active || !isTauri()) return
    // Preserve server frame order even if the native bridge completes slowly.
    const operation = renameQueue.then(async () => {
      await invoke("room_book_rename", { id: active.id, name })
      if (get().active?.id === active.id)
        set({ active: { ...get().active!, name: name.trim() || active.room }, error: null })
      await get().refresh()
    })
    renameQueue = operation.catch(() => {})
    try {
      await operation
    } catch (error) {
      if (get().active?.id === active.id) set({ error: errorCode(error) })
    }
  },
}))

// Room-name state is already validated against the current room by connection.ts.
useRoomNameStore.subscribe((state, previous) => {
  if (state.name !== null && state.name !== previous.name)
    void useRoomBookStore.getState().updateName(state.name)
})

export function roomCredentials(id: string): Promise<TransportConnectParams> {
  return invoke("room_book_credentials", { id })
}

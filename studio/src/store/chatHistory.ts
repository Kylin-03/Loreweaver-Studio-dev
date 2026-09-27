import { create } from "zustand"
import { isServerFrame } from "@loreweaver/protocol"
import type { LogEntry } from "./session"
import { transportSend } from "../lib/transport"

export type HistoryFilter = "all" | "chat" | "dice" | "system"
interface ChatHistoryState {
  supported: boolean
  searchSupported: boolean
  opened: boolean
  loading: boolean
  error: string | null
  filter: HistoryFilter
  query: string
  setQuery: (query: string) => void
  items: LogEntry[]
  cursor: string | null
  nextCursor: string | null
  previous: (string | null)[]
  requestId: string | null
  initialize: (supported: boolean, searchSupported?: boolean) => void
  open: () => void
  close: () => void
  fetch: (cursor?: string | null) => Promise<void>
  older: () => void
  newer: () => void
  setFilter: (filter: HistoryFilter) => void
  ingest: (frame: unknown) => boolean
}

let requestNumber = 0
let requestTimeout: ReturnType<typeof setTimeout> | undefined
const EMPTY = {
  supported: false,
  searchSupported: false,
  opened: false,
  loading: false,
  error: null,
  filter: "all" as HistoryFilter,
  query: "",
  items: [],
  cursor: null,
  nextCursor: null,
  previous: [],
  requestId: null,
}

export const useChatHistoryStore = create<ChatHistoryState>((set, get) => ({
  ...EMPTY,
  initialize: (supported, searchSupported = false) => {
    clearTimeout(requestTimeout)
    set({ ...EMPTY, supported, searchSupported })
  },
  open: () => {
    set({ opened: true, previous: [] })
    void get().fetch(null)
  },
  close: () => {
    clearTimeout(requestTimeout)
    set({ opened: false, requestId: null, loading: false })
  },
  fetch: async (cursor = null) => {
    if (!get().supported) return
    clearTimeout(requestTimeout)
    const requestId = `history-${Date.now()}-${++requestNumber}`
    set({ loading: true, error: null, requestId, cursor })
    requestTimeout = setTimeout(() => {
      if (get().requestId === requestId) set({ loading: false, error: "timeout", requestId: null })
    }, 15_000)
    try {
      await transportSend({
        type: "history_request",
        request_id: requestId,
        ...(cursor ? { cursor } : {}),
        filter: get().filter,
        limit: 50,
        ...(get().query ? { query: get().query } : {}),
      })
    } catch (error) {
      if (get().requestId === requestId) {
        clearTimeout(requestTimeout)
        set({ loading: false, error: String(error), requestId: null })
      }
    }
  },
  older: () => {
    const { nextCursor, cursor, loading, previous } = get()
    if (!nextCursor || loading) return
    set({ previous: [...previous, cursor] })
    void get().fetch(nextCursor)
  },
  newer: () => {
    const { previous, loading } = get()
    if (!previous.length || loading) return
    const cursor = previous[previous.length - 1]
    set({ previous: previous.slice(0, -1) })
    void get().fetch(cursor)
  },
  setFilter: (filter) => {
    set({ filter, previous: [] })
    void get().fetch(null)
  },
  setQuery: (query) => {
    if (!get().searchSupported) return
    set({ query: Array.from(query.trim()).slice(0, 200).join(""), previous: [] })
    void get().fetch(null)
  },
  ingest: (frame) => {
    if (!frame || typeof frame !== "object") return false
    const value = frame as Record<string, unknown>
    if (value.type !== "history_page" && value.type !== "history_error") return false
    if (value.request_id !== get().requestId || !get().opened) return true
    clearTimeout(requestTimeout)
    if (value.type === "history_error") {
      set({ loading: false, requestId: null, error: String(value.message ?? value.code ?? "invalid") })
      return true
    }
    if (
      !Array.isArray(value.items) ||
      value.items.length > 50 ||
      value.filter !== get().filter ||
      (typeof value.query === "string" ? value.query : "") !== get().query ||
      !(value.next_cursor === null || typeof value.next_cursor === "string")
    ) {
      set({ loading: false, requestId: null, error: "invalid" })
      return true
    }
    const items: LogEntry[] = []
    for (const [seq, item] of value.items.entries()) {
      if (!isServerFrame(item)) continue
      if (
        item.type === "narrative" ||
        item.type === "dice" ||
        item.type === "system" ||
        item.type === "error"
      ) {
        items.push({ seq, kind: item.type, frame: item } as LogEntry)
      }
    }
    set({ loading: false, requestId: null, items, nextCursor: value.next_cursor as string | null })
    return true
  },
}))

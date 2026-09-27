import { invoke } from "@tauri-apps/api/core"
import { useRoomBookStore } from "../store/roomBook"
import { transportSend } from "./transport"

interface NewRoom {
  room: string
  name: string
  key: string
  identity: string
}
interface Origin {
  ticket: string
  home?: string
}
interface Waiter {
  resolve: (room: NewRoom) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}
interface Request {
  id: string
  name: string
  origin: Origin
  waiter?: Waiter
  created?: NewRoom
  saving: boolean
}

// Keep origin snapshots after timeout/disconnect: a late ack still contains a
// unique new access key that must be saved, but must never switch the current room.
const requests = new Map<string, Request>()
const MAX_PENDING_REQUESTS = 32

function rejectWaiter(request: Request, reason: string): void {
  const waiter = request.waiter
  if (!waiter) return
  clearTimeout(waiter.timer)
  request.waiter = undefined
  waiter.reject(new Error(reason))
}

export function cancelRoomCreationRequests(reason = "rooms.disconnected"): void {
  for (const request of requests.values()) rejectWaiter(request, reason)
}

async function persistCreated(request: Request): Promise<void> {
  if (!request.created || request.saving) return
  request.saving = true
  const created = request.created
  try {
    await invoke("room_book_save", {
      connection: {
        ticket: request.origin.ticket,
        home: request.origin.home ?? null,
        room: created.room,
        name: created.name,
        key: created.key,
        identity: created.identity,
        role: "keeper",
      },
    })
    await useRoomBookStore.getState().refresh()
    requests.delete(request.id)
    const waiter = request.waiter
    if (waiter) {
      clearTimeout(waiter.timer)
      request.waiter = undefined
      waiter.resolve(created)
    }
  } catch (error) {
    // Retain the issued key in memory so another attempt retries saving it,
    // rather than creating a second campaign after a transient disk failure.
    const message = error instanceof Error ? error.message : String(error)
    useRoomBookStore.setState({ error: message })
    rejectWaiter(request, message)
  } finally {
    request.saving = false
  }
}

export function createRoom(name: string, origin: Origin): Promise<NewRoom> {
  name = name.trim()
  if (!name || Array.from(name).length > 80) return Promise.reject(new Error("rooms.createFailed"))
  if ([...requests.values()].some((request) => request.waiter || request.saving)) {
    return Promise.reject(new Error("rooms.creating"))
  }
  const retry = [...requests.values()].find(
    (request) =>
      request.created &&
      request.name === name &&
      request.origin.ticket === origin.ticket &&
      request.origin.home === origin.home,
  )
  if (!retry && requests.size >= MAX_PENDING_REQUESTS) return Promise.reject(new Error("rooms.timeout"))
  const request: Request = retry ?? { id: crypto.randomUUID(), name, origin: { ...origin }, saving: false }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => rejectWaiter(request, "rooms.timeout"), 20_000)
    request.waiter = { resolve, reject, timer }
    requests.set(request.id, request)
    if (request.created) {
      void persistCreated(request)
      return
    }
    void transportSend({ type: "admin_create_room", request_id: request.id, name }).catch((error) => {
      rejectWaiter(request, error instanceof Error ? error.message : String(error))
    })
  })
}

export function ingestRoomCreation(frame: unknown): boolean {
  if (!frame || typeof frame !== "object") return false
  const value = frame as Record<string, unknown>
  const request = typeof value.request_id === "string" ? requests.get(value.request_id) : undefined
  if (value.type !== "admin_room_created" && !(value.type === "admin_error" && request)) return false
  if (!request) return true
  if (value.type === "admin_error") {
    rejectWaiter(request, String(value.message ?? "rooms.createFailed"))
    requests.delete(request.id)
  } else if (
    [value.room, value.name, value.key, value.identity].every(
      (item) => typeof item === "string" && item.length > 0,
    )
  ) {
    request.created = {
      room: value.room as string,
      name: value.name as string,
      key: value.key as string,
      identity: value.identity as string,
    }
    void persistCreated(request)
  } else rejectWaiter(request, "rooms.createFailed")
  return true
}

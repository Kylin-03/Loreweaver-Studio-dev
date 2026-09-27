import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WelcomeFrame } from "@loreweaver/protocol"
const native = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => native)
vi.mock("../lib/transport", () => ({ isTauri: () => true, transportSend: vi.fn() }))
import { useRoomBookStore, type SavedRoom } from "./roomBook"
import { useRoomNameStore } from "./roomName"
const room: SavedRoom = {
  id: "saved-a",
  serverId: "server",
  room: "a",
  name: "Campaign",
  identity: "alice",
  role: "player",
  home: "/host",
  lastUsed: 1,
}
const welcome = { type: "welcome", room: "a", you: { id: "alice", role: "player" } } as WelcomeFrame
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.clearAllMocks()
  useRoomBookStore.setState({ rooms: [], active: null, pending: null, error: null })
  useRoomNameStore.getState().reset()
  native.invoke.mockImplementation(async (command: string) =>
    command === "room_book_list" ? [room] : command === "room_book_save" ? room : undefined,
  )
})
describe("saved rooms", () => {
  it("persists authenticated identity and resolved home without browser storage", async () => {
    useRoomBookStore.getState().begin({ ticket: "ticket-a", key: "key-a" }, "/host")
    await useRoomBookStore.getState().remember(welcome)
    expect(native.invoke).toHaveBeenCalledWith("room_book_save", {
      connection: {
        ticket: "ticket-a",
        key: "key-a",
        home: "/host",
        room: "a",
        name: "a",
        identity: "alice",
        role: "player",
      },
    })
    expect(useRoomBookStore.getState().active).toEqual(room)
    expect(JSON.stringify(useRoomBookStore.getState().rooms)).not.toContain("key-a")
  })
  it("does not select an old room when a delayed native save finishes", async () => {
    const save = deferred<SavedRoom>()
    native.invoke.mockReturnValueOnce(save.promise)
    useRoomBookStore.getState().begin({ ticket: "old", key: "old-key" })
    const pending = useRoomBookStore.getState().remember(welcome)
    useRoomBookStore.getState().begin({ ticket: "new", key: "new-key" })
    save.resolve(room)
    await pending
    expect(useRoomBookStore.getState().active).toBeNull()
    expect(useRoomBookStore.getState().pending?.ticket).toBe("new")
  })
  it("catches a room name arriving before the initial native save", async () => {
    const save = deferred<SavedRoom>()
    native.invoke.mockReturnValueOnce(save.promise)
    useRoomBookStore.getState().begin({ ticket: "ticket", key: "key" })
    const pending = useRoomBookStore.getState().remember(welcome)
    useRoomNameStore.setState({ name: "Renamed campaign" })
    save.resolve(room)
    await pending
    expect(native.invoke).toHaveBeenCalledWith("room_book_rename", { id: room.id, name: "Renamed campaign" })
    expect(useRoomBookStore.getState().active?.name).toBe("Renamed campaign")
  })
  it("serializes name updates so an older response cannot undo a newer name", async () => {
    useRoomBookStore.setState({ active: room })
    const first = deferred<void>()
    native.invoke.mockImplementation((command: string) =>
      command === "room_book_rename" && native.invoke.mock.calls.filter(([c]) => c === command).length === 1
        ? first.promise
        : Promise.resolve(command === "room_book_list" ? [] : undefined),
    )
    const one = useRoomBookStore.getState().updateName("First")
    const two = useRoomBookStore.getState().updateName(room.name)
    await Promise.resolve()
    expect(native.invoke.mock.calls.filter(([c]) => c === "room_book_rename")).toHaveLength(1)
    first.resolve()
    await Promise.all([one, two])
    expect(useRoomBookStore.getState().active?.name).toBe(room.name)
  })
})

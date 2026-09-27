import { beforeEach, expect, it, vi } from "vitest"
import { useRoomNameStore } from "./roomName"
import { transportSend } from "../lib/transport"

vi.mock("../lib/transport", () => ({ transportSend: vi.fn().mockResolvedValue(undefined) }))
beforeEach(() => {
  useRoomNameStore.getState().reset()
  vi.clearAllMocks()
})

it("keeps old servers usable without offering an unsupported edit", async () => {
  useRoomNameStore.getState().ingest({ type: "state" }, "table")
  await useRoomNameStore.getState().save("New room")
  expect(transportSend).not.toHaveBeenCalled()
  expect(useRoomNameStore.getState().name).toBeNull()
})

it("only changes the displayed name after the server confirms the current room", async () => {
  const store = useRoomNameStore.getState()
  store.ingest({ type: "state", room_name: "table", room_name_editable: true }, "table")
  await store.save(" New room ")
  expect(transportSend).toHaveBeenCalledWith({ type: "admin_set_room_name", name: "New room" })
  expect(useRoomNameStore.getState().name).toBe("table")
  store.ingest({ type: "admin_room_name", room: "other", name: "Wrong" }, "table")
  expect(useRoomNameStore.getState().pending).toBe(true)
  store.ingest({ type: "admin_room_name", room: "table", name: "New room" }, "table")
  expect(useRoomNameStore.getState()).toMatchObject({ name: "New room", pending: false })
})

it("receives renamed state and clears it for a new connection", () => {
  const store = useRoomNameStore.getState()
  store.ingest({ type: "state", room_name: "Shared name", room_name_editable: true }, "table")
  expect(useRoomNameStore.getState().name).toBe("Shared name")
  store.reset()
  expect(useRoomNameStore.getState()).toMatchObject({ name: null, editable: false })
})

it("retains the old name and releases pending state on server rejection", async () => {
  const store = useRoomNameStore.getState()
  store.ingest({ type: "state", room_name: "Original", room_name_editable: true }, "table")
  await store.save("Rejected")
  store.ingest({ type: "admin_error", code: "forbidden", message: "Denied" }, "table")
  expect(useRoomNameStore.getState()).toMatchObject({ name: "Original", pending: false, error: "Denied" })
})

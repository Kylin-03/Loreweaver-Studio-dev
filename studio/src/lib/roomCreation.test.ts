import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  send: vi.fn(),
  refresh: vi.fn(),
  setState: vi.fn(),
}))
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }))
vi.mock("./transport", () => ({ transportSend: mocks.send }))
vi.mock("../store/roomBook", () => ({
  useRoomBookStore: {
    getState: () => ({ refresh: mocks.refresh }),
    setState: mocks.setState,
  },
}))

let creation: typeof import("./roomCreation")
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.invoke.mockResolvedValue(undefined)
  mocks.send.mockResolvedValue(undefined)
  mocks.refresh.mockResolvedValue(undefined)
  creation = await import("./roomCreation")
})
afterEach(() => {
  creation.cancelRoomCreationRequests()
  vi.useRealTimers()
})

function acknowledgement() {
  const sent = mocks.send.mock.lastCall![0]
  return {
    type: "admin_room_created",
    request_id: sent.request_id,
    room: "new-room",
    name: "Second",
    key: "new-key",
    identity: "new-identity",
  }
}

it("saves the authoritative new identity and key before resolving", async () => {
  const pending = creation.createRoom("Second", { ticket: "source-ticket", home: "source-home" })
  const ack = acknowledgement()
  creation.ingestRoomCreation(ack)
  await expect(pending).resolves.toMatchObject({ identity: "new-identity", key: "new-key" })
  expect(mocks.invoke).toHaveBeenCalledWith("room_book_save", {
    connection: {
      ticket: "source-ticket",
      home: "source-home",
      room: "new-room",
      name: "Second",
      key: "new-key",
      identity: "new-identity",
      role: "keeper",
    },
  })
})

it("persists a late success to the original server after timeout", async () => {
  const origin = { ticket: "original", home: "original-home" }
  const pending = creation.createRoom("Second", origin)
  const rejected = expect(pending).rejects.toThrow("rooms.timeout")
  const ack = acknowledgement()
  origin.ticket = "another-server"
  await vi.advanceTimersByTimeAsync(20_000)
  await rejected
  creation.ingestRoomCreation(ack)
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.invoke).toHaveBeenCalledWith(
    "room_book_save",
    expect.objectContaining({
      connection: expect.objectContaining({ ticket: "original", identity: "new-identity" }),
    }),
  )
})

it("disconnect rejects immediately but does not discard a late issued key", async () => {
  const pending = creation.createRoom("Second", { ticket: "original" })
  const rejected = expect(pending).rejects.toThrow("rooms.disconnected")
  const ack = acknowledgement()
  creation.cancelRoomCreationRequests()
  await rejected
  creation.ingestRoomCreation(ack)
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.invoke).toHaveBeenCalledTimes(1)
})

it("retries a failed native save without creating another room", async () => {
  mocks.invoke.mockRejectedValueOnce(new Error("disk failure"))
  const pending = creation.createRoom("Second", { ticket: "original" })
  const rejected = expect(pending).rejects.toThrow("disk failure")
  creation.ingestRoomCreation(acknowledgement())
  await rejected
  const retry = creation.createRoom("Second", { ticket: "original" })
  await expect(retry).resolves.toMatchObject({ key: "new-key" })
  expect(mocks.send).toHaveBeenCalledTimes(1)
  expect(mocks.invoke).toHaveBeenCalledTimes(2)
})

it("ignores an unrelated response and requires the new identity", async () => {
  const pending = creation.createRoom("Second", { ticket: "original" })
  const rejected = expect(pending).rejects.toThrow("rooms.createFailed")
  const ack = acknowledgement()
  creation.ingestRoomCreation({ ...ack, request_id: "other" })
  expect(mocks.invoke).not.toHaveBeenCalled()
  creation.ingestRoomCreation({ ...ack, identity: undefined })
  await rejected
  expect(mocks.invoke).not.toHaveBeenCalled()
})

it("counts room names by Unicode codepoint and handles correlated denial", async () => {
  await expect(creation.createRoom("a".repeat(81), { ticket: "t" })).rejects.toThrow("rooms.createFailed")
  const pending = creation.createRoom("🎲".repeat(80), { ticket: "t" })
  const rejected = expect(pending).rejects.toThrow("Denied")
  creation.ingestRoomCreation({
    type: "admin_error",
    request_id: acknowledgement().request_id,
    message: "Denied",
  })
  await rejected
  expect(mocks.send).toHaveBeenCalledTimes(1)
  expect(mocks.invoke).not.toHaveBeenCalled()
})

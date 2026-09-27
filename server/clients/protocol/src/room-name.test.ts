import { expect, test } from "bun:test"
import { isServerFrame } from "./client"

test("room labels are optional and new acknowledgements are validated", () => {
  const state = { type: "state", party: [], initiative: [], online: 0 }
  expect(isServerFrame(state)).toBe(true)
  expect(isServerFrame({ ...state, room_name: "Harbour", room_name_editable: true })).toBe(true)
  expect(isServerFrame({ ...state, room_name: 12 })).toBe(false)
  expect(isServerFrame({ ...state, room_name_editable: "yes" })).toBe(false)
  expect(isServerFrame({ type: "admin_room_name", room: "stable", name: "Harbour" })).toBe(true)
  expect(isServerFrame({ type: "admin_room_name", room: "stable" })).toBe(false)
})

test("isolated room creation acknowledgements require correlation and access key", () => {
  const created = { type: "admin_room_created", request_id: "c1", room: "new", name: "Second campaign", key: "opaque", identity: "derived-id" }
  expect(isServerFrame(created)).toBe(true)
  expect(isServerFrame({ ...created, key: undefined })).toBe(false)
  expect(isServerFrame({ ...created, request_id: undefined })).toBe(false)
})

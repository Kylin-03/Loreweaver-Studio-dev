import { expect, test } from "bun:test"
import { isServerFrame } from "./client"

test("history page accepts bounded projected display frames and rejects nested/private frames", () => {
  const page = {
    type: "history_page", request_id: "p1", filter: "all", has_more: false,
    next_cursor: null, high_watermark: 1, history_scope: "scope",
    items: [{ type: "system", level: "info", text: "notice", history_id: "one", history_seq: 1 }],
  }
  expect(isServerFrame(page)).toBe(true)
  expect(isServerFrame({ ...page, query: "harbor" })).toBe(true)
  expect(isServerFrame({ ...page, query: 12 })).toBe(false)
  expect(isServerFrame({ ...page, items: [{ type: "admin_keys", keys: [] }] })).toBe(false)
  expect(isServerFrame({ ...page, items: Array(51).fill(page.items[0]) })).toBe(false)
  expect(isServerFrame({ ...page, high_watermark: -1 })).toBe(false)
  expect(isServerFrame({ type: "history_error", request_id: "p1", code: "bad_frame", message: "Invalid request" })).toBe(true)
})

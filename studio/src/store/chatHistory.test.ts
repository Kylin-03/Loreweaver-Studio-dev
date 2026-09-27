import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("../lib/transport", () => ({ transportSend: vi.fn(async () => {}) }))
import { transportSend } from "../lib/transport"
import { useChatHistoryStore as history } from "./chatHistory"

function page(next: string | null = null, extra = {}) {
  return {
    type: "history_page",
    request_id: history.getState().requestId,
    filter: history.getState().filter,
    items: [{ type: "system", level: "info", text: "saved" }],
    next_cursor: next,
    ...extra,
  }
}
describe("paged chat history", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    history.getState().initialize(true)
  })
  afterEach(() => {
    history.getState().close()
    vi.useRealTimers()
  })
  it("requests 50 items, replaces pages, and traverses cursors both ways", () => {
    history.getState().open()
    expect(transportSend).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50, filter: "all" }))
    history.getState().ingest(page("older-page"))
    history.getState().older()
    expect(transportSend).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "older-page" }))
    history.getState().ingest(page())
    expect(history.getState().items).toHaveLength(1)
    history.getState().newer()
    expect(history.getState().cursor).toBeNull()
    expect(history.getState().previous).toEqual([])
  })
  it("ignores stale results after filters, close and connection reset", () => {
    history.getState().open()
    const stale = page()
    history.getState().setFilter("dice")
    history.getState().ingest(stale)
    expect(history.getState().loading).toBe(true)
    history.getState().ingest(page(null, { items: [] }))
    expect(history.getState().loading).toBe(false)
    history.getState().initialize(false)
    history.getState().ingest(stale)
    expect(history.getState().items).toEqual([])
    expect(history.getState().opened).toBe(false)
  })
  it("times out and handles correlated server errors without hanging", () => {
    history.getState().open()
    vi.advanceTimersByTime(15000)
    expect(history.getState().error).toBe("timeout")
    void history.getState().fetch()
    history
      .getState()
      .ingest({ type: "history_error", request_id: history.getState().requestId, message: "invalid cursor" })
    expect(history.getState().loading).toBe(false)
    expect(history.getState().error).toBe("invalid cursor")
  })
  it("rejects oversized pages rather than retaining unbounded entries", () => {
    history.getState().open()
    history
      .getState()
      .ingest(page(null, { items: Array(51).fill({ type: "system", level: "info", text: "bad" }) }))
    expect(history.getState().error).toBe("invalid")
    expect(history.getState().items).toEqual([])
  })
  it("binds Unicode search to fresh pages and rejects mismatched response queries", () => {
    history.getState().initialize(true, true)
    history.getState().open()
    history.getState().ingest(page("older"))
    history.getState().older()
    history.getState().setQuery(" 🔎 clue ")
    expect(history.getState().previous).toEqual([])
    expect(transportSend).toHaveBeenLastCalledWith(expect.objectContaining({ query: "🔎 clue" }))
    history.getState().ingest(page(null, { query: "other" }))
    expect(history.getState().error).toBe("invalid")
    history.getState().setQuery("🔎".repeat(201))
    expect(Array.from(history.getState().query)).toHaveLength(200)
  })

  it("does not send unsupported search to older servers", () => {
    history.getState().initialize(true)
    history.getState().setQuery("clue")
    expect(history.getState().query).toBe("")
    expect(transportSend).not.toHaveBeenCalled()
  })
})

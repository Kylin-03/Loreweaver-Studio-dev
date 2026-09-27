import { beforeEach, describe, expect, it } from "vitest"
import { useChatViewStore as view } from "./chatView"
import { useSessionStore as session } from "./session"

describe("local chat display", () => {
  beforeEach(() => {
    view.setState({ limit: 100, scope: null, highWatermark: 0, cleared: {} })
    session.getState().clear()
  })
  it("retains only the selected count and clears without resetting room state", () => {
    const game = { type: "state", room: "table" } as never
    session.setState({ game })
    for (let n = 0; n < 125; n++)
      session.getState().ingest({ type: "system", level: "info", text: String(n) })
    expect(session.getState().entries).toHaveLength(100)
    view.getState().setLimit(50)
    session.getState().trimDisplay(50)
    expect(session.getState().entries).toHaveLength(50)
    session.getState().clearDisplay()
    expect(session.getState().entries).toEqual([])
    expect(session.getState().game).toBe(game)
  })
  it("keeps a clear cutoff across reconnect, scoped by room and viewer", () => {
    view.getState().enter("room-a-keeper", 20)
    view.getState().markCleared()
    view.getState().enter(null)
    view.getState().enter("room-a-keeper", 22)
    const replay = (seq: number) => ({ type: "system", replay: true, history_seq: seq })
    expect(view.getState().observe(replay(20))).toBe(false)
    expect(view.getState().observe(replay(0))).toBe(false)
    expect(view.getState().observe(replay(21))).toBe(true)
    expect(view.getState().observe({ type: "state", replay: true })).toBe(true)
    view.getState().enter("room-a-player", 20)
    expect(view.getState().observe(replay(20))).toBe(true)
  })
  it("shows a fresh room incarnation after reset even if its sequence restarts", () => {
    view.getState().enter("old", 100)
    view.getState().markCleared()
    expect(
      view.getState().observe({ type: "narrative", history_scope: "new", history_seq: 1, replay: true }),
    ).toBe(true)
    expect(view.getState().highWatermark).toBe(1)
  })
})

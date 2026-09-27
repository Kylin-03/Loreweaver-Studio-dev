import { act, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppearanceSurface } from "./AppearanceSettings"
import { useAppearanceStore } from "../../../store/appearance"
const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock("../../../lib/transport", () => ({ isTauri: () => true }))
vi.mock("../../../lib/appearance", () => ({
  loadBackground: mocks.load,
  importBackground: vi.fn(),
  removeBackground: vi.fn(),
}))
describe("appearance surface", () => {
  beforeEach(() => {
    useAppearanceStore.getState().reset()
    mocks.load.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())
  it("loads app-owned background on mount and applies readable font and width preferences", async () => {
    mocks.load.mockResolvedValue("data:image/png;base64,AAAA")
    const view = render(<AppearanceSurface />)
    await waitFor(() => expect(document.documentElement.dataset.playBackground).toBe("image"))
    expect(document.documentElement.style.getPropertyValue("--play-bg-image")).toContain("data:image/png")
    expect(document.documentElement.style.getPropertyValue("--play-font-family")).toContain("Microsoft YaHei")
    act(() => useAppearanceStore.getState().setPreferences({ width: "reading", fontSize: 20 }))
    expect(document.documentElement.dataset.playWidth).toBe("reading")
    expect(document.documentElement.style.getPropertyValue("--play-font-size")).toBe("20px")
    view.unmount()
    expect(document.documentElement.style.getPropertyValue("--play-bg-image")).toBe("")
  })
  it("keeps startup usable when a stored image is invalid", async () => {
    mocks.load.mockRejectedValue("appearance.invalidImage")
    const view = render(<AppearanceSurface />)
    await waitFor(() => expect(useAppearanceStore.getState().loadError).toBe("appearance.invalidImage"))
    expect(document.documentElement.dataset.playBackground).toBe("plain")
    view.unmount()
  })
})

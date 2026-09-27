import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppearanceSurface } from "./AppearanceSurface"
import { appearanceDefaults, useAppearanceStore } from "../../../store/appearance"
const loadBackground = vi.hoisted(() => vi.fn<(scope: string | null) => Promise<string | null>>())
vi.mock("../../../lib/appearance", () => ({ loadBackground }))
vi.mock("../../../lib/transport", () => ({ isTauri: () => true }))
describe("appearance scope loading", () => {
  beforeEach(() => {
    loadBackground.mockReset().mockResolvedValue(null)
    useAppearanceStore.setState({
      scope: null,
      roomScope: null,
      profiles: {},
      schemes: {},
      roomSchemes: {},
      background: null,
      globalPreferences: appearanceDefaults,
      preferences: appearanceDefaults,
    })
  })
  it("does not apply a late image from the previous room", async () => {
    let resolveOld: (value: string) => void = () => {}
    loadBackground.mockImplementation((scope) =>
      scope === "one"
        ? new Promise((resolve) => {
            resolveOld = resolve
          })
        : Promise.resolve("new-image"),
    )
    useAppearanceStore.setState({
      profiles: {
        one: { preferences: appearanceDefaults, backgroundMode: "own" },
        two: { preferences: appearanceDefaults, backgroundMode: "own" },
      },
    })
    const view = render(<AppearanceSurface scope="one" />)
    await waitFor(() => expect(loadBackground).toHaveBeenCalledWith("one"))
    view.rerender(<AppearanceSurface scope="two" />)
    await waitFor(() => expect(useAppearanceStore.getState().background).toBe("new-image"))
    await act(async () => {
      resolveOld("old-image")
    })
    expect(useAppearanceStore.getState().background).toBe("new-image")
  })
  it("reloads inherited images after reset and keeps shared-scheme images between rooms", async () => {
    loadBackground.mockResolvedValue("global-image")
    const view = render(<AppearanceSurface scope="one" />)
    await waitFor(() => expect(useAppearanceStore.getState().background).toBe("global-image"))
    act(() => useAppearanceStore.getState().reset())
    await waitFor(() => expect(useAppearanceStore.getState().background).toBe("global-image"))
    act(() => {
      useAppearanceStore.getState().saveScheme("scheme:shared", "Shared")
      useAppearanceStore.setState({ roomSchemes: { one: "scheme:shared", two: "scheme:shared" } })
    })
    await waitFor(() => expect(useAppearanceStore.getState().background).toBe("global-image"))
    view.rerender(<AppearanceSurface scope="two" />)
    expect(useAppearanceStore.getState().background).toBe("global-image")
    expect(document.documentElement.style.getPropertyValue("--play-line-height")).toBe("1.5")
  })
})

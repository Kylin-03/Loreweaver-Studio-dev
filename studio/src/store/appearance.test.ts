import { beforeEach, describe, expect, it } from "vitest"
import { appearanceDefaults, normalizeAppearance, useAppearanceStore } from "./appearance"

describe("local appearance preferences", () => {
  beforeEach(() => {
    localStorage.clear()
    useAppearanceStore.setState({ scope: null, roomScope: null, profiles: {}, schemes: {}, roomSchemes: {} })
    useAppearanceStore.getState().reset()
  })
  it("isolates room preferences while untouched rooms inherit the global profile", async () => {
    const store = () => useAppearanceStore.getState()
    store().setPreferences({ fontSize: 18 })
    store().enter("server-a/room-one")
    expect(store().preferences.fontSize).toBe(18)
    store().setPreferences({ fontSize: 20, lineHeight: 1.4 })
    store().setBackgroundMode("own")
    store().setBackground("data:image/png;base64,private")
    store().enter("server-a/room-two")
    expect(store().preferences.fontSize).toBe(18)
    expect(store().background).toBeNull()
    store().setPreferences({ fontSize: 15 })
    store().setBackgroundMode("none")
    await useAppearanceStore.persist.rehydrate()
    store().enter("server-a/room-one")
    expect(store().preferences.fontSize).toBe(20)
    expect(store().profiles["server-a/room-one"].backgroundMode).toBe("own")
    store().reset()
    expect(store().preferences.fontSize).toBe(18)
    expect(store().profiles["server-a/room-two"].preferences.fontSize).toBe(15)
    expect(store().profiles["server-a/room-two"].backgroundMode).toBe("none")
    expect(localStorage.getItem("loreweaver-appearance-v1")).not.toContain("base64")
  })
  it("validates persisted colors and bounds rendering values", () => {
    expect(
      normalizeAppearance({
        backgroundColor: "url(https://bad)",
        textColor: "#AbC123",
        fontSize: 800,
        blur: -1,
        brightness: NaN,
        panelOpacity: 0,
      }),
    ).toEqual({ ...appearanceDefaults, textColor: "#AbC123", fontSize: 24, panelOpacity: 0.4 })
    expect(normalizeAppearance(null)).toEqual(appearanceDefaults)
  })
  it("persists preferences but never stores large image data in localStorage", async () => {
    useAppearanceStore
      .getState()
      .setPreferences({ fontSize: 20, width: "reading", backgroundColor: "#123456" })
    useAppearanceStore.getState().setBackground("data:image/png;base64,test")
    const saved = localStorage.getItem("loreweaver-appearance-v1")!
    expect(saved).not.toContain("base64")
    useAppearanceStore.setState({ preferences: appearanceDefaults })
    localStorage.setItem("loreweaver-appearance-v1", saved)
    await useAppearanceStore.persist.rehydrate()
    expect(useAppearanceStore.getState().preferences).toMatchObject({
      fontSize: 20,
      width: "reading",
      backgroundColor: "#123456",
    })
  })
  it("remembers named module schemes per room and preserves independent room edits", async () => {
    const s = () => useAppearanceStore.getState()
    s().enter("room-one")
    s().setPreferences({ accentColor: "#aabbcc" })
    s().saveScheme("scheme:module-one", " Module One ")
    s().enter("room-two")
    s().setPreferences({ fontSize: 22 })
    s().selectScheme("scheme:module-one")
    expect(s().preferences.accentColor).toBe("#aabbcc")
    s().setPreferences({ lineHeight: 1.35 })
    s().enter("room-one")
    expect(s().scope).toBe("scheme:module-one")
    expect(s().preferences.lineHeight).toBe(1.35)
    await useAppearanceStore.persist.rehydrate()
    s().enter("room-two")
    expect(s().scope).toBe("scheme:module-one")
    s().selectScheme(null)
    expect(s().preferences.fontSize).toBe(22)
    expect(s().schemes["scheme:module-one"]).toBe("Module One")
  })
})

import { useEffect } from "react"
import { useAppearanceStore } from "../../../store/appearance"
import { loadBackground } from "../../../lib/appearance"
import { isTauri } from "../../../lib/transport"

/** Scope is a stable room identity from the connection book, never a server banner. */
export function AppearanceSurface({ scope = null }: { scope?: string | null }) {
  const { preferences, background, backgroundRevision, scope: activeScope, profiles } = useAppearanceStore()
  const mode = activeScope ? (profiles[activeScope]?.backgroundMode ?? "inherit") : "own"
  useEffect(() => {
    useAppearanceStore.getState().enter(scope)
  }, [scope])
  useEffect(() => {
    if (!isTauri()) return
    let active = true
    const store = useAppearanceStore.getState()
    store.setBackground(null)
    if (mode === "none") return
    void loadBackground(mode === "inherit" ? null : activeScope)
      .then((value) => {
        if (active) useAppearanceStore.getState().setBackground(value)
      })
      .catch((error: unknown) => {
        if (active) useAppearanceStore.getState().setLoadError(String(error))
      })
    return () => {
      active = false
    }
  }, [activeScope, mode, backgroundRevision])
  useEffect(() => {
    const root = document.documentElement
    const vars: Record<string, string> = {
      "--play-bg-image": background ? `url("${background}")` : "none",
      "--play-bg-brightness": String(preferences.brightness),
      "--play-bg-blur": `${preferences.blur}px`,
      "--play-panel-opacity": String(preferences.panelOpacity),
      "--play-font-size": `${preferences.fontSize}px`,
      "--play-line-height": String(preferences.lineHeight),
      "--play-font-family":
        preferences.font === "sans"
          ? '"Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
          : '"Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif',
      "--play-bg-color": preferences.backgroundColor,
      "--play-text-color": preferences.textColor,
      "--play-accent-color": preferences.accentColor,
    }
    for (const [key, value] of Object.entries(vars)) {
      if (value) root.style.setProperty(key, value)
      else root.style.removeProperty(key)
    }
    root.dataset.playWidth = preferences.width
    root.dataset.playBackground = background ? "image" : "plain"
    root.dataset.playDensity = preferences.density
    root.dataset.playAvatars = preferences.showAvatars ? "show" : "hide"
    return () => {
      for (const key of Object.keys(vars)) root.style.removeProperty(key)
      for (const key of ["playWidth", "playBackground", "playDensity", "playAvatars"])
        delete root.dataset[key]
    }
  }, [preferences, background])
  return null
}

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { guardedLocalStorage } from "../lib/persistStorage"

export interface AppearancePreferences {
  backgroundColor: string
  textColor: string
  accentColor: string
  brightness: number
  blur: number
  panelOpacity: number
  fontSize: number
  lineHeight: number
  density: "compact" | "comfortable"
  showAvatars: boolean
  automaticPalette: boolean
  font: "sans" | "serif"
  width: "wide" | "reading"
}
export const appearanceDefaults: AppearancePreferences = {
  backgroundColor: "",
  textColor: "",
  accentColor: "",
  brightness: 0.55,
  blur: 0,
  panelOpacity: 0.94,
  fontSize: 16,
  lineHeight: 1.5,
  density: "compact",
  showAvatars: true,
  automaticPalette: true,
  font: "sans",
  width: "wide",
}
const color = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "")
const bounded = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
export function normalizeAppearance(value: unknown): AppearancePreferences {
  const v = value && typeof value === "object" ? (value as Partial<AppearancePreferences>) : {}
  return {
    backgroundColor: color(v.backgroundColor),
    textColor: color(v.textColor),
    accentColor: color(v.accentColor),
    brightness: bounded(v.brightness, 0.55, 0.2, 1),
    blur: bounded(v.blur, 0, 0, 16),
    panelOpacity: bounded(v.panelOpacity, 0.94, 0.4, 1),
    fontSize: bounded(v.fontSize, 16, 14, 24),
    lineHeight: bounded(v.lineHeight, 1.5, 1.3, 1.9),
    density: v.density === "comfortable" ? "comfortable" : "compact",
    showAvatars: v.showAvatars !== false,
    automaticPalette: v.automaticPalette !== false,
    font: v.font === "serif" ? "serif" : "sans",
    width: v.width === "reading" ? "reading" : "wide",
  }
}
interface AppearanceProfile {
  preferences: AppearancePreferences
  backgroundMode: "inherit" | "own" | "none"
}
interface AppearanceState {
  roomScope: string | null
  scope: string | null
  schemes: Record<string, string>
  roomSchemes: Record<string, string>
  profiles: Record<string, AppearanceProfile>
  globalPreferences: AppearancePreferences
  preferences: AppearancePreferences
  background: string | null
  backgroundRevision: number
  loadError: string | null
  enter: (scope: string | null) => void
  saveScheme: (id: string, name: string) => void
  selectScheme: (id: string | null) => void
  setPreferences: (value: Partial<AppearancePreferences>) => void
  setBackground: (value: string | null) => void
  setBackgroundMode: (mode: AppearanceProfile["backgroundMode"]) => void
  setLoadError: (value: string | null) => void
  reset: () => void
}
export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set, get) => ({
      roomScope: null,
      scope: null,
      schemes: {},
      roomSchemes: {},
      profiles: {},
      globalPreferences: { ...appearanceDefaults },
      preferences: { ...appearanceDefaults },
      background: null,
      backgroundRevision: 0,
      loadError: null,
      enter: (roomScope) =>
        set((s) => {
          const scope = (roomScope && s.roomSchemes[roomScope]) || roomScope
          return {
            roomScope,
            scope,
            preferences: (scope && s.profiles[scope]?.preferences) || s.globalPreferences,
            background: scope === s.scope ? s.background : null,
            loadError: null,
          }
        }),
      saveScheme: (id, name) =>
        set((s) => {
          if (!s.roomScope || !id.startsWith("scheme:") || !name.trim()) return {}
          return {
            scope: id,
            schemes: { ...s.schemes, [id]: name.trim().slice(0, 80) },
            roomSchemes: { ...s.roomSchemes, [s.roomScope]: id },
            profiles: {
              ...s.profiles,
              [id]: { preferences: s.preferences, backgroundMode: s.background ? "own" : "none" },
            },
          }
        }),
      selectScheme: (id) => {
        const s = get()
        if (!s.roomScope || (id && !s.schemes[id])) return
        const roomSchemes = { ...s.roomSchemes }
        if (id) roomSchemes[s.roomScope] = id
        else delete roomSchemes[s.roomScope]
        set({ roomSchemes })
        get().enter(s.roomScope)
      },
      setPreferences: (value) =>
        set((s) => {
          const preferences = normalizeAppearance({ ...s.preferences, ...value })
          return s.scope
            ? {
                preferences,
                profiles: {
                  ...s.profiles,
                  [s.scope]: {
                    preferences,
                    backgroundMode: s.profiles[s.scope]?.backgroundMode ?? "inherit",
                  },
                },
              }
            : { preferences, globalPreferences: preferences }
        }),
      // Runtime data URLs never enter localStorage; native storage owns image bytes.
      setBackground: (background) => set({ background, loadError: null }),
      setBackgroundMode: (backgroundMode) =>
        set((s) =>
          s.scope
            ? { profiles: { ...s.profiles, [s.scope]: { preferences: s.preferences, backgroundMode } } }
            : {},
        ),
      setLoadError: (loadError) => set({ loadError }),
      reset: () =>
        set((s) => {
          if (!s.scope)
            return {
              preferences: { ...appearanceDefaults },
              globalPreferences: { ...appearanceDefaults },
              background: null,
              backgroundRevision: s.backgroundRevision + 1,
              loadError: null,
            }
          const profiles = { ...s.profiles }
          if (s.schemes[s.scope])
            profiles[s.scope] = { preferences: s.globalPreferences, backgroundMode: "inherit" }
          else delete profiles[s.scope]
          return {
            profiles,
            preferences: s.globalPreferences,
            background: null,
            backgroundRevision: s.backgroundRevision + 1,
            loadError: null,
          }
        }),
    }),
    {
      name: "loreweaver-appearance-v1",
      storage: guardedLocalStorage,
      partialize: (state) => ({
        preferences: state.globalPreferences,
        profiles: state.profiles,
        schemes: state.schemes,
        roomSchemes: state.roomSchemes,
      }),
      merge: (persisted, current) => {
        const saved = persisted as
          | {
              preferences?: unknown
              profiles?: Record<string, Partial<AppearanceProfile>>
              schemes?: Record<string, unknown>
              roomSchemes?: Record<string, unknown>
            }
          | undefined
        const globalPreferences = normalizeAppearance(saved?.preferences)
        const profiles: Record<string, AppearanceProfile> = {}
        if (saved?.profiles && typeof saved.profiles === "object") {
          for (const [key, value] of Object.entries(saved.profiles)) {
            if (!value || typeof value !== "object") continue
            profiles[key] = {
              preferences: normalizeAppearance(value.preferences),
              backgroundMode:
                value.backgroundMode === "own" || value.backgroundMode === "none"
                  ? value.backgroundMode
                  : "inherit",
            }
          }
        }
        const schemes: Record<string, string> = {}
        const roomSchemes: Record<string, string> = {}
        if (saved?.schemes && typeof saved.schemes === "object")
          for (const [id, name] of Object.entries(saved.schemes)) {
            if (id.startsWith("scheme:") && typeof name === "string" && name.trim() && profiles[id])
              schemes[id] = name.trim().slice(0, 80)
          }
        if (saved?.roomSchemes && typeof saved.roomSchemes === "object")
          for (const [room, id] of Object.entries(saved.roomSchemes)) {
            if (typeof id === "string" && schemes[id]) roomSchemes[room] = id
          }
        return {
          ...current,
          schemes,
          roomSchemes,
          globalPreferences,
          profiles,
          preferences: (current.scope && profiles[current.scope]?.preferences) || globalPreferences,
        }
      },
    },
  ),
)

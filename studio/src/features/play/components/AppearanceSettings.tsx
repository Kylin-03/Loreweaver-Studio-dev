import { useState, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import { useAppearanceStore, type AppearancePreferences } from "../../../store/appearance"
import { copyBackground, importBackground, removeBackground } from "../../../lib/appearance"
import { extractImagePalette } from "../../../lib/appearancePalette"
import { isTauri } from "../../../lib/transport"
import { useAppStore } from "../../../store/app"
import { themes } from "../../../lib/themes"
export { AppearanceSurface } from "./AppearanceSurface"

type RangeKey = "brightness" | "blur" | "panelOpacity" | "fontSize" | "lineHeight"
const ranges: { key: RangeKey; min: number; max: number; step: number }[] = [
  { key: "brightness", min: 0.2, max: 1, step: 0.05 },
  { key: "blur", min: 0, max: 16, step: 1 },
  { key: "panelOpacity", min: 0.4, max: 1, step: 0.05 },
  { key: "lineHeight", min: 1.3, max: 1.9, step: 0.05 },
]
export default function AppearanceSettings() {
  const { t } = useTranslation()
  const theme = useAppStore((s) => themes[s.theme])
  const {
    preferences,
    background,
    loadError,
    scope,
    roomScope,
    profiles,
    schemes,
    roomSchemes,
    setPreferences,
    selectScheme,
  } = useAppearanceStore()
  const [schemeName, setSchemeName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  const current = () => useAppearanceStore.getState().scope === scope
  const applyPalette = async (value: string) => {
    const palette = await extractImagePalette(value)
    if (current()) {
      const store = useAppearanceStore.getState()
      // Keep the generated palette readable even over bright details in the image.
      store.setPreferences({
        ...palette,
        automaticPalette: true,
        panelOpacity: Math.max(0.9, store.preferences.panelOpacity),
      })
    }
  }
  const displayError = error ?? loadError
  const preview: CSSProperties = {
    backgroundColor: preferences.backgroundColor || "var(--lw-bg)",
    color: preferences.textColor || "var(--lw-fg)",
    fontSize: `${preferences.fontSize}px`,
    lineHeight: preferences.lineHeight,
    fontFamily:
      preferences.font === "serif"
        ? '"Noto Serif CJK SC", Georgia, serif'
        : '"Microsoft YaHei UI", sans-serif',
  }
  const range = ({ key, min, max, step }: (typeof ranges)[number]) => (
    <label className="field" key={key}>
      {t(`appearance.${key}`)}:{" "}
      {key === "brightness" || key === "panelOpacity"
        ? `${Math.round(preferences[key] * 100)}%`
        : preferences[key]}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={preferences[key]}
        onChange={(e) => setPreferences({ [key]: Number(e.target.value) })}
      />
    </label>
  )
  return (
    <section className="play-appearance-settings" aria-label={t("appearance.title")}>
      <h2>{t("appearance.title")}</h2>
      <p className="studio-hint">
        {t(scope ? "appearance.roomScope" : "appearance.globalScope")}
        {scope && !profiles[scope] ? ` ${t("appearance.inheriting")}` : ""}
      </p>
      {roomScope && (
        <div className="appearance-scheme-controls">
          <label className="field">
            {t("appearance.scheme")}
            <select
              disabled={busy}
              value={roomSchemes[roomScope] ?? ""}
              onChange={(e) => selectScheme(e.target.value || null)}
            >
              <option value="">{t("appearance.roomOnly")}</option>
              {Object.entries(schemes).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <details>
            <summary>{t("appearance.saveScheme")}</summary>
            <p className="studio-hint">{t("appearance.schemeHint")}</p>
            <label className="field">
              {t("appearance.schemeName")}
              <input maxLength={80} value={schemeName} onChange={(e) => setSchemeName(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={busy || !schemeName.trim()}
              onClick={() =>
                void act(async () => {
                  const id = `scheme:${crypto.randomUUID()}`
                  const mode = scope ? (profiles[scope]?.backgroundMode ?? "inherit") : "own"
                  if (background && isTauri()) await copyBackground(mode === "inherit" ? null : scope, id)
                  if (current()) {
                    useAppearanceStore.getState().saveScheme(id, schemeName)
                    setSchemeName("")
                  }
                })
              }
            >
              {t("appearance.saveScheme")}
            </button>
          </details>
          {scope && schemes[scope] && <p className="studio-hint">{t("appearance.sharedScheme")}</p>}
        </div>
      )}
      <div className="button-row">
        <button
          type="button"
          disabled={busy || !isTauri()}
          onClick={() =>
            void act(async () => {
              const value = await importBackground(scope)
              if (!value || !current()) return
              const store = useAppearanceStore.getState()
              store.setBackgroundMode("own")
              store.setBackground(value)
              if (store.preferences.automaticPalette) await applyPalette(value)
            })
          }
        >
          {t("appearance.import")}
        </button>
        <button
          type="button"
          disabled={busy || (!background && !loadError)}
          onClick={() =>
            void act(async () => {
              if (isTauri()) await removeBackground(scope)
              if (current()) {
                const store = useAppearanceStore.getState()
                store.setBackgroundMode("none")
                store.setBackground(null)
              }
            })
          }
        >
          {t("appearance.remove")}
        </button>
        <button
          type="button"
          disabled={busy || !background}
          onClick={() =>
            void act(async () => {
              if (background) await applyPalette(background)
            })
          }
        >
          {t("appearance.adaptPalette")}
        </button>
      </div>
      <div className="appearance-live-preview" style={preview} aria-label={t("appearance.preview")}>
        {background && (
          <div
            className="appearance-preview-backdrop"
            style={{
              backgroundImage: `url("${background}")`,
              filter: `brightness(${preferences.brightness}) blur(${preferences.blur}px)`,
            }}
          />
        )}
        <div
          className="appearance-preview-copy"
          style={{
            backgroundColor: `color-mix(in srgb, ${preferences.backgroundColor || "var(--lw-bg)"} ${preferences.panelOpacity * 100}%, transparent)`,
          }}
        >
          <strong style={{ color: preferences.accentColor || "var(--lw-accent)" }}>
            {t("appearance.previewSpeaker")}
          </strong>
          <p>{t("appearance.previewText")}</p>
          <p>{t("appearance.previewReply")}</p>
        </div>
      </div>
      {displayError && (
        <p role="alert">
          {displayError.startsWith("appearance.")
            ? t(displayError)
            : t("appearance.failed", { error: displayError })}
        </p>
      )}
      <div className="play-appearance-grid">
        {range({ key: "fontSize", min: 14, max: 24, step: 1 })}
        <label className="field">
          {t("appearance.density")}
          <select
            value={preferences.density}
            onChange={(e) => setPreferences({ density: e.target.value as AppearancePreferences["density"] })}
          >
            <option value="compact">{t("appearance.compact")}</option>
            <option value="comfortable">{t("appearance.comfortable")}</option>
          </select>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={preferences.showAvatars}
              onChange={(e) => setPreferences({ showAvatars: e.target.checked })}
            />{" "}
            {t("appearance.showAvatars")}
          </span>
        </label>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={preferences.automaticPalette}
              onChange={(e) => setPreferences({ automaticPalette: e.target.checked })}
            />{" "}
            {t("appearance.automaticPalette")}
          </span>
        </label>
      </div>
      <details className="appearance-advanced">
        <summary>{t("appearance.advanced")}</summary>
        <p className="studio-hint">{t("appearance.hint")}</p>
        <div className="play-appearance-grid">
          {(["backgroundColor", "textColor", "accentColor"] as const).map((key) => (
            <label className="field" key={key}>
              {t(`appearance.${key}`)}
              <span className="play-color-control">
                <input
                  type="color"
                  aria-label={t(`appearance.${key}`)}
                  value={
                    preferences[key] ||
                    { backgroundColor: theme.bg, textColor: theme.fg, accentColor: theme.accent }[key]
                  }
                  onChange={(e) => setPreferences({ [key]: e.target.value, automaticPalette: false })}
                />
                <button
                  type="button"
                  disabled={!preferences[key]}
                  onClick={() => setPreferences({ [key]: "", automaticPalette: false })}
                >
                  {t("appearance.themeDefault")}
                </button>
              </span>
            </label>
          ))}
          {ranges.map(range)}
          <label className="field">
            {t("appearance.font")}
            <select
              value={preferences.font}
              onChange={(e) => setPreferences({ font: e.target.value as AppearancePreferences["font"] })}
            >
              <option value="sans">{t("appearance.sans")}</option>
              <option value="serif">{t("appearance.serif")}</option>
            </select>
          </label>
          <label className="field">
            {t("appearance.width")}
            <select
              value={preferences.width}
              onChange={(e) => setPreferences({ width: e.target.value as AppearancePreferences["width"] })}
            >
              <option value="wide">{t("appearance.wide")}</option>
              <option value="reading">{t("appearance.reading")}</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              if (isTauri()) await removeBackground(scope)
              if (current()) useAppearanceStore.getState().reset()
            })
          }
        >
          {t(scope ? "appearance.restoreGlobal" : "appearance.reset")}
        </button>
      </details>
    </section>
  )
}

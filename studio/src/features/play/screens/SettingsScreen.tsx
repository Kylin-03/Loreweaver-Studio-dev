// Settings keeps everyday preferences compact; startup configuration is opt-in.
import { useTranslation } from "react-i18next"
import { themeOrder, themes } from "../../../lib/themes"
import { useAppStore } from "../../../store/app"
import { usePlayWorkspace } from "../../../store/playWorkspace"
import AppearanceSettings from "../components/AppearanceSettings"
import LocalConfigSettings from "../components/LocalConfigSettings"
import ScreenShell from "./ScreenShell"
import "./settings.css"

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const sendOnEnter = usePlayWorkspace((s) => s.sendOnEnter)
  const setSendOnEnter = usePlayWorkspace((s) => s.setSendOnEnter)
  return (
    <ScreenShell title={t("play.menu.settings")} onBack={onBack}>
      <p className="studio-hint">{t("play.settings.themeHint")}</p>
      <div className="settings-theme-row">
        {themeOrder.map((name) => (
          <button
            key={name}
            type="button"
            className={name === theme ? "settings-theme active" : "settings-theme"}
            aria-pressed={name === theme}
            onClick={() => setTheme(name)}
          >
            <i aria-hidden="true" style={{ background: themes[name].bg, borderColor: themes[name].accent }} />
            {t(`play.settings.themes.${name}`)}
          </button>
        ))}
      </div>
      <div className="settings-preferences">
        <label className="field field-narrow">
          {t("lang.label")}
          <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
            <option value="en">English</option>
            {/* i18n-exempt: a language is offered in its own name. */}
            <option value="zh">中文</option>
          </select>
        </label>
        <label className="field field-narrow">
          {t("play.settings.sendBehavior")}
          <select
            value={sendOnEnter ? "enter" : "modifier"}
            onChange={(e) => setSendOnEnter(e.target.value === "enter")}
          >
            <option value="enter">{t("play.settings.sendEnter")}</option>
            <option value="modifier">{t("play.settings.sendModifier")}</option>
          </select>
        </label>
      </div>
      <AppearanceSettings />
      <LocalConfigSettings />
    </ScreenShell>
  )
}

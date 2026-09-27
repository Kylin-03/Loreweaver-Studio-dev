import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import PlayView from "./features/play/PlayView"
import StudioView from "./features/studio/StudioView"
import SettingsScreen from "./features/play/screens/SettingsScreen"
import UndoToast from "./features/studio/UndoToast"
import { isTauri, onTransportEvent } from "./lib/transport"
import { useAppStore } from "./store/app"
import { useConnectionStore } from "./store/connection"
import { usePlayWorkspace, type WorkspacePage } from "./store/playWorkspace"
import { useRoomBookStore } from "./store/roomBook"
import { useRoomNameStore } from "./store/roomName"
import { useChatHistoryStore } from "./store/chatHistory"
import { AppearanceSurface } from "./features/play/components/AppearanceSettings"

export default function App() {
  const { t } = useTranslation()
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const page = usePlayWorkspace((s) => s.page)
  const welcome = useConnectionStore((s) => s.welcome)
  const active = useRoomBookStore((s) => s.active)
  const name = useRoomNameStore((s) => s.name)
  const historySupported = useChatHistoryStore((s) => s.supported)
  const [studioVisited, setStudioVisited] = useState(mode === "studio")
  const [settingsVisited, setSettingsVisited] = useState(page === "settings")
  const navigate = (next: WorkspacePage) => {
    if (next === "settings") setSettingsVisited(true)
    setMode("play")
    usePlayWorkspace.getState().setPage(next)
    if (next === "history") useChatHistoryStore.getState().open()
    else useChatHistoryStore.getState().close()
  }
  useEffect(() => {
    if (!isTauri()) return
    const unlisten = onTransportEvent((event) => useConnectionStore.getState().handleEvent(event))
    return () => {
      void unlisten.then((dispose) => dispose())
    }
  }, [])
  return (
    <div className="app">
      <AppearanceSurface scope={active ? `${active.serverId}:${active.room}` : null} />
      <header className="app-header">
        <h1 className="app-title">{t("app.title")}</h1>
        <button type="button" className="room-switch ghost-button" onClick={() => navigate("rooms")}>
          {name ?? active?.name ?? t("rooms.title")}
        </button>
        <nav className="mode-nav" aria-label={t("nav.label")}>
          {(
            [
              "game",
              "character",
              "history",
              ...(welcome?.you.role === "keeper" ? ["manage"] : []),
            ] as WorkspacePage[]
          ).map((item) => (
            <button
              type="button"
              key={item}
              className={mode === "play" && page === item ? "mode-tab active" : "mode-tab"}
              disabled={!welcome || (item === "history" && !historySupported)}
              onClick={() => navigate(item)}
            >
              {t(`workspace.${item}`)}
            </button>
          ))}
        </nav>
        <div className="header-spacer" />
        <button
          type="button"
          className={mode === "studio" ? "mode-tab active" : "mode-tab"}
          onClick={() => {
            setStudioVisited(true)
            setMode("studio")
          }}
        >
          {t("nav.studio")}
        </button>
        <button
          type="button"
          className={mode === "play" && page === "settings" ? "mode-tab active" : "mode-tab"}
          onClick={() => navigate("settings")}
        >
          {t("play.menu.settings")}
        </button>
      </header>
      <main className="app-main">
        <div className="workspace-root" hidden={mode !== "play" || page === "settings"}>
          <PlayView />
        </div>
        {studioVisited && (
          <div className="workspace-root" hidden={mode !== "studio"}>
            <StudioView />
          </div>
        )}
        {settingsVisited && (
          <div className="workspace-root settings-root" hidden={page !== "settings" || mode !== "play"}>
            <SettingsScreen onBack={() => navigate(welcome ? "game" : "rooms")} />
          </div>
        )}
      </main>
      <UndoToast />
    </div>
  )
}

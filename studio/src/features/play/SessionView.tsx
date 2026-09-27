import { usePlayWorkspace } from "../../store/playWorkspace"
import { useTranslation } from "react-i18next"
import { useConnectionStore } from "../../store/connection"
import { quitTable } from "../../store/hostLocal"
import { useRoomNameStore } from "../../store/roomName"
import { useChatViewStore, type ChatLimit } from "../../store/chatView"
import { useChatHistoryStore } from "../../store/chatHistory"
import { useSessionStore } from "../../store/session"
import HistoryPanel from "./HistoryPanel"
import InputBox from "./InputBox"
import NarrativeLog from "./NarrativeLog"
import { PanelSidebar, PanelTray } from "./panels/PanelDeck"
import PanelMenu from "./panels/PanelMenu"
import PanelModalHost from "./panels/PanelModalHost"
import PanelNotice from "./panels/PanelNotice"
import StatePanel from "./StatePanel"
import StatusPill from "./StatusPill"
import VersionBadge from "./VersionBadge"
import TurnStatus from "./TurnStatus"

export default function SessionView({ onMenu }: { onMenu?: () => void }) {
  const { t } = useTranslation()
  const welcome = useConnectionStore((s) => s.welcome)
  const roomName = useRoomNameStore((s) => s.name)
  const { sidebarCollapsed, toggleSidebar, limit, setLimit, scope } = useChatViewStore()
  const history = useChatHistoryStore()
  const page = usePlayWorkspace((s) => s.page)
  const busy = useSessionStore((s) => s.turn.busy)
  const hasEntries = useSessionStore((s) => s.entries.length > 0)

  return (
    <div className={`session${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <div className="chronicle-pane" hidden={page === "history"}>
        <header className="session-head">
          {onMenu ? (
            <button type="button" className="ghost-button" onClick={onMenu}>
              {t("play.menuButton")}
            </button>
          ) : null}
          <span className="session-room">
            {welcome ? `${roomName ?? welcome.room} · ${welcome.you.name}` : "…"}
          </span>
          <PanelMenu />
          <StatusPill />
          <VersionBadge />
          <button type="button" className="ghost-button" disabled={busy} onClick={() => void quitTable()}>
            {t("connect.disconnect")}
          </button>
        </header>
        <div className="chat-toolbar">
          <label>
            {t("chat.visibleCount")}{" "}
            <select value={limit} onChange={(event) => setLimit(Number(event.target.value) as ChatLimit)}>
              {[50, 100, 200].map((count) => (
                <option value={count} key={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost-button"
            disabled={!history.supported}
            onClick={() => {
              usePlayWorkspace.getState().setPage("history")
              history.open()
            }}
            title={!history.supported ? t("chat.unsupported") : undefined}
          >
            {t("chat.history")}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={busy || !hasEntries}
            title={busy ? t("chat.waitIdle") : scope ? t("chat.clearHint") : t("chat.clearLegacy")}
            onClick={() => useSessionStore.getState().clearDisplay()}
          >
            {t("chat.clear")}
          </button>
          <button
            type="button"
            className="ghost-button sidebar-toggle"
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {t(sidebarCollapsed ? "chat.expandSidebar" : "chat.collapseSidebar")}
          </button>
        </div>
        <PanelNotice />
        <TurnStatus />
        <NarrativeLog />
        <PanelTray />
        <InputBox />
      </div>
      <aside className="desk-pane" hidden={sidebarCollapsed || page === "history"}>
        <PanelSidebar />
        <StatePanel />
      </aside>
      <PanelModalHost />
      {history.opened && <HistoryPanel embedded={page === "history"} />}
    </div>
  )
}

import { useState } from "react"
import { useConnectionStore } from "../../store/connection"
import { usePlayWorkspace } from "../../store/playWorkspace"
import RoomsScreen from "./screens/RoomsScreen"
import CharacterScreen from "./screens/CharacterScreen"
import ManagementScreen from "./screens/ManagementScreen"
import SessionView from "./SessionView"

export type PlayScreen =
  "menu" | "game" | "character" | "settings" | "keys" | "module" | "rules" | "skills" | "model"

export default function PlayView() {
  const status = useConnectionStore((s) => s.status)
  const keeper = useConnectionStore((s) => s.welcome?.you.role === "keeper")
  const page = usePlayWorkspace((s) => s.page)
  const [manageVisited, setManageVisited] = useState(page === "manage")
  if (page === "manage" && !manageVisited) setManageVisited(true)
  const connected = status === "online" || status === "reconnecting"
  return (
    <div className="play-workspace">
      <div hidden={connected && page !== "rooms"}>
        <RoomsScreen />
      </div>
      {connected && (
        <>
          {/* Keep the session mounted so navigation preserves draft, scroll and ambient audio. */}
          <div className="workspace-page" hidden={page !== "game" && page !== "history"}>
            <SessionView />
          </div>
          <div className="workspace-page" hidden={page !== "character"}>
            <CharacterScreen onBack={() => usePlayWorkspace.getState().setPage("game")} />
          </div>
          {keeper && manageVisited && (
            <div className="workspace-page" hidden={page !== "manage"}>
              <ManagementScreen />
            </div>
          )}
        </>
      )}
    </div>
  )
}

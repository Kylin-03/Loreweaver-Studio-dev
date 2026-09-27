import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { roomCredentials, useRoomBookStore, type SavedRoom } from "../../../store/roomBook"
import { useConnectionStore } from "../../../store/connection"
import { useHostLocalStore } from "../../../store/hostLocal"
import { usePlayWorkspace } from "../../../store/playWorkspace"
import { useSessionStore } from "../../../store/session"
import { hostLocalStatus } from "../../../lib/hostLocal"
import { createRoom } from "../../../lib/roomCreation"
import HostLocalBlock from "../HostLocalBlock"

export default function RoomsScreen() {
  const { t } = useTranslation()
  const book = useRoomBookStore()
  const connection = useConnectionStore()
  const turnBusy = useSessionStore((s) => s.turn.busy)
  const [ticket, setTicket] = useState("")
  const [key, setKey] = useState("")
  const [name, setName] = useState("")
  const [newName, setNewName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void useRoomBookStore.getState().refresh()
  }, [])
  const canCreate =
    connection.status === "online" &&
    connection.welcome?.you.role === "keeper" &&
    connection.welcome.features?.includes("room_creation")
  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }
  const resume = (room: SavedRoom) =>
    void run(async () => {
      const credentials = await roomCredentials(room.id)
      if (room.home) {
        const status = await hostLocalStatus(room.home)
        const host = useHostLocalStore.getState()
        if (status.running) {
          // status.home resolves the requested directory; the saved live ticket owns the actual host.
          if (host.lastTicketHome !== room.home || !host.lastTicket) throw new Error(t("rooms.otherHost"))
          await connection.connect({ ...credentials, ticket: host.lastTicket }, room.home)
        } else {
          host.setHomeOverride(room.home)
          await host.start(undefined, credentials.key)
        }
      } else await connection.connect(credentials)
    })
  const create = () =>
    void run(async () => {
      const pending = useRoomBookStore.getState().pending
      const sourceRoom = useConnectionStore.getState().welcome?.room
      if (!pending || !canCreate) return
      const created = await createRoom(newName.trim(), { ticket: pending.ticket, home: pending.home })
      // Issuance is already saved by the helper. A room switch or disconnection
      // during that save must not reconnect this screen to its old server.
      const current = useConnectionStore.getState()
      if (
        useRoomBookStore.getState().pending !== pending ||
        current.status !== "online" ||
        current.welcome?.room !== sourceRoom
      )
        return
      await current.connect({ ticket: pending.ticket, key: created.key }, pending.home)
      setNewName("")
    })
  const join = (event: FormEvent) => {
    event.preventDefault()
    void run(() =>
      connection.connect({
        ticket: ticket.trim(),
        key: key.trim(),
        ...(name.trim() ? { name: name.trim() } : {}),
      }),
    )
  }
  return (
    <section className="rooms-screen">
      <header className="workspace-heading">
        <h2>{t("rooms.title")}</h2>
        {connection.welcome && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => usePlayWorkspace.getState().setPage("game")}
          >
            {t("workspace.game")}
          </button>
        )}
      </header>
      <p className="studio-hint">{t("rooms.retention")}</p>
      {(error || book.error || connection.lastError) && (
        <p role="alert">{t(error ?? book.error ?? connection.lastError ?? "")}</p>
      )}
      <div className="room-list">
        {book.rooms.map((room) => (
          <article className="room-card" key={room.id}>
            <div>
              <strong>{room.name}</strong>
              <p className="studio-hint">
                {t(room.home ? "rooms.local" : "rooms.remote")} · {t(`connect.role.${room.role}`, room.role)}
              </p>
            </div>
            <button type="button" disabled={busy || turnBusy} onClick={() => resume(room)}>
              {t("rooms.resume")}
            </button>
          </article>
        ))}
      </div>
      {turnBusy && <p role="status">{t("chat.waitIdle")}</p>}
      <div className="rooms-columns">
        <section>
          <HostLocalBlock />
          <label className="field">
            {t("rooms.newName")}
            <input
              value={newName}
              onChange={(event) => setNewName(Array.from(event.target.value).slice(0, 80).join(""))}
            />
          </label>
          <button type="button" disabled={!canCreate || !newName.trim() || busy || turnBusy} onClick={create}>
            {t("rooms.create")}
          </button>
          <p className="studio-hint">{t("rooms.createHint")}</p>
        </section>
        <form onSubmit={join}>
          <h3>{t("connect.title")}</h3>
          <label className="field">
            {t("connect.ticket")}
            <textarea value={ticket} onChange={(event) => setTicket(event.target.value)} />
          </label>
          <label className="field">
            {t("connect.key")}
            <input type="password" value={key} onChange={(event) => setKey(event.target.value)} />
          </label>
          <label className="field">
            {t("connect.name")}
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="submit" disabled={!ticket.trim() || !key.trim() || busy || turnBusy}>
            {t("connect.submit")}
          </button>
        </form>
      </div>
    </section>
  )
}

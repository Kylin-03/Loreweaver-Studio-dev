import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useRoomNameStore } from "../../../store/roomName"

export default function RoomNameEditor({ room }: { room: string }) {
  const { t } = useTranslation()
  const { name, editable, pending, error, save } = useRoomNameStore()
  const [draft, setDraft] = useState<string | null>(null)
  const current = name ?? room
  const value = draft ?? current
  const trimmed = value.trim()
  const valid =
    Array.from(trimmed).length >= 1 &&
    Array.from(trimmed).length <= 80 &&
    !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)

  return (
    <section className="play-minted" aria-label={t("play.keys.roomName")}>
      <p>{t("play.keys.currentRoomName", { name: current })}</p>
      <label className="field">
        {t("play.keys.roomName")}
        <input
          value={value}
          disabled={!editable || pending}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <p>{t("play.keys.roomNameHint")}</p>
      {!editable && <p>{t("play.keys.roomNameUnavailable")}</p>}
      <button
        type="button"
        className="ghost-button"
        disabled={!editable || pending || !valid || trimmed === current}
        onClick={() => void save(trimmed)}
      >
        {pending ? t("play.keys.savingRoomName") : t("play.keys.saveRoomName")}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

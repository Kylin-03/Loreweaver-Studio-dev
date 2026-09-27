import { type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { transportSend } from "../../lib/transport"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import { useChatViewStore } from "../../store/chatView"
import { usePlayWorkspace } from "../../store/playWorkspace"
import DiceTools from "./DiceTools"

export default function InputBox() {
  const { t } = useTranslation()
  const status = useConnectionStore((s) => s.status)
  const seat = useConnectionStore((s) => s.welcome?.you.name ?? "")
  const scope = useChatViewStore((s) => s.scope) ?? "legacy-session"
  const text = usePlayWorkspace((s) => s.drafts[scope] ?? "")
  const sendOnEnter = usePlayWorkspace((s) => s.sendOnEnter)
  const online = status === "online"
  const setText = (value: string) => usePlayWorkspace.getState().setDraft(scope, value)
  const send = (value: string) => {
    const trimmed = value.trim()
    if (!online || !trimmed) return
    const session = useSessionStore.getState()
    const seq = session.echoLocalInput(trimmed, seat)
    void transportSend({ type: "input", text: trimmed }).catch(() => session.failEcho(seq))
  }
  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!online || !text.trim()) return
    send(text)
    setText("")
  }
  return (
    <form className="input-box composer" onSubmit={submit}>
      <textarea
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // IME confirmation is not a send action, including WebView's legacy keyCode 229.
          if (
            event.key === "Enter" &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229 &&
            ((sendOnEnter && !event.shiftKey) || event.ctrlKey || event.metaKey)
          ) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder={t("session.inputPlaceholder")}
        aria-label={t("session.inputPlaceholder")}
        disabled={!online}
        spellCheck={false}
      />
      <div className="composer-actions">
        <DiceTools disabled={!online} send={send} />
        <span className="studio-hint">{t(sendOnEnter ? "composer.enterHint" : "composer.ctrlHint")}</span>
        <button type="submit" disabled={!online || !text.trim()}>
          {t("session.send")}
        </button>
      </div>
    </form>
  )
}

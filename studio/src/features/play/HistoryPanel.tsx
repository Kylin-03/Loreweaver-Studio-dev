import { usePlayWorkspace } from "../../store/playWorkspace"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useChatHistoryStore, type HistoryFilter } from "../../store/chatHistory"
import { Entry } from "./NarrativeLog"

export default function HistoryPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation()
  const history = useChatHistoryStore()
  const [query, setQuery] = useState(history.query)
  const closeButton = useRef<HTMLButtonElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    return () => previous?.focus()
  }, [])
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [history.items])

  return (
    <div className={embedded ? "history-page" : "history-backdrop"}>
      <section
        className="history-dialog"
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label={t("chat.history")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation()
            history.close()
            usePlayWorkspace.getState().setPage("game")
          }
          if (!embedded && event.key === "Tab") {
            const elements = event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), select, input, a[href], [tabindex='0']",
            )
            const first = elements[0],
              last = elements[elements.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        <header className="history-header">
          <h2>{t("chat.history")}</h2>
          <button
            ref={closeButton}
            type="button"
            className="ghost-button"
            onClick={() => {
              history.close()
              usePlayWorkspace.getState().setPage("game")
            }}
          >
            {t("chat.close")}
          </button>
        </header>
        {history.searchSupported && (
          <form
            className="history-search"
            onSubmit={(event) => {
              event.preventDefault()
              history.setQuery(query)
            }}
          >
            <input
              value={query}
              maxLength={200}
              aria-label={t("chat.search")}
              placeholder={t("chat.search")}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" disabled={history.loading}>
              {t("chat.searchButton")}
            </button>
          </form>
        )}
        <div className="history-controls">
          <label>
            {t("chat.filter")}{" "}
            <select
              value={history.filter}
              onChange={(event) => history.setFilter(event.target.value as HistoryFilter)}
            >
              {(["all", "chat", "dice", "system"] as const).map((filter) => (
                <option key={filter} value={filter}>
                  {t(`chat.filters.${filter}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost-button"
            disabled={history.loading}
            onClick={() => {
              useChatHistoryStore.setState({ previous: [] })
              void history.fetch(null)
            }}
          >
            {t("chat.latest")}
          </button>
          <span>{t("chat.pageSize")}</span>
        </div>
        <p className="history-hint">{t("chat.historyHint")}</p>
        <div className="history-scroll" ref={scroller} aria-busy={history.loading}>
          {history.loading ? (
            <p role="status">{t("chat.loading")}</p>
          ) : history.error ? (
            <p role="alert">
              {t("chat.loadError")}{" "}
              <button type="button" onClick={() => void history.fetch(history.cursor)}>
                {t("chat.retry")}
              </button>
            </p>
          ) : history.items.length ? (
            history.items.map((entry) => <Entry key={entry.seq} entry={entry} />)
          ) : (
            <p>{t(history.nextCursor ? "chat.continueSearch" : "chat.noHistory")}</p>
          )}
        </div>
        <footer className="history-controls">
          <button
            type="button"
            className="ghost-button"
            disabled={history.loading || !history.nextCursor}
            onClick={history.older}
          >
            {t("chat.older")}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={history.loading || !history.previous.length}
            onClick={history.newer}
          >
            {t("chat.newer")}
          </button>
        </footer>
      </section>
    </div>
  )
}

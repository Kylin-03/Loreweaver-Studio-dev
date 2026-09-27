import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useHostLocalStore } from "../../../store/hostLocal"
import { hostLocalStatus } from "../../../lib/hostLocal"
import { isTauri } from "../../../lib/transport"
import {
  configGroups,
  configValues,
  readLocalConfig,
  saveLocalConfig,
  updateConfig,
  validateFields,
  type LocalConfig,
} from "../../../lib/localConfig"

export default function LocalConfigSettings() {
  const homeOverride = useHostLocalStore((s) => s.homeOverride)
  // Switching host homes discards credentials from the previous component instance.
  return <LocalConfigEditor key={homeOverride} homeOverride={homeOverride} />
}

function LocalConfigEditor({ homeOverride }: { homeOverride: string }) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState<LocalConfig | null>(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [reloadPending, setReloadPending] = useState(false)
  let values: Record<string, string> = {}
  let parseError = false
  try {
    values = configValues(text)
  } catch {
    parseError = true
  }
  const dirty = loaded !== null && text !== loaded.text
  const invalidField = parseError ? null : validateFields(values)
  const label = (key: string) => t(`play.localConfig.${key}`)
  const report = (e: unknown) => {
    const code = String(e)
    // Never render arbitrary bridge/parser exception text, which may contain keys.
    setError(/^config_[a-z]+$/.test(code) ? code : "config_read")
  }
  async function load() {
    setBusy(true)
    setError("")
    setSaved(false)
    setReloadPending(false)
    try {
      const status = await hostLocalStatus(homeOverride)
      const config = await readLocalConfig(status.home)
      setLoaded(config)
      setText(config.text)
    } catch (e) {
      report(e)
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    if (!loaded || invalidField) return
    setBusy(true)
    setError("")
    setSaved(false)
    try {
      const config = await saveLocalConfig(loaded.home, text, loaded.revision)
      setLoaded(config)
      setText(config.text)
      setSaved(true)
    } catch (e) {
      report(e)
    } finally {
      setBusy(false)
    }
  }
  function edit(key: string, value: string) {
    try {
      setText(updateConfig(text, key, value))
      setSaved(false)
      setError("")
    } catch (e) {
      report(e)
    }
  }
  return (
    <section className="local-config-settings">
      <h3>{label("title")}</h3>
      <p className="studio-hint">{label("intro")}</p>
      {!isTauri() ? (
        <p>{label("nativeOnly")}</p>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => (dirty ? setReloadPending(true) : void load())}
          >
            {label(loaded ? "reload" : "load")}
          </button>
          {reloadPending && (
            <div role="alert">
              <p>{label("discard")}</p>
              <button type="button" onClick={() => void load()}>
                {label("discardConfirm")}
              </button>
              <button type="button" onClick={() => setReloadPending(false)}>
                {label("keepEditing")}
              </button>
            </div>
          )}
          {error && <p role="alert">{label(`errors.${error}`)}</p>}
          {loaded && (
            <>
              <p className="studio-hint">{loaded.home}</p>
              <p className="studio-hint">{label("precedence")}</p>
              <p className="studio-hint">{label("storage")}</p>
              {loaded.encoding !== "utf8" && <p role="status">{label(`encoding.${loaded.encoding}`)}</p>}
              {parseError && <p role="alert">{label("formUnavailable")}</p>}
              {!parseError &&
                configGroups.map((group) => (
                  <details key={group.id} className="local-config-group">
                    <summary>{label(`groups.${group.id}`)}</summary>
                    <p className="studio-hint">{label(`hints.${group.id}`)}</p>
                    <div className="local-config-grid">
                      {group.fields.map((f) => (
                        <label className="field" key={f.key}>
                          {label(`fields.${f.label}`)}
                          {f.kind === "boolean" ? (
                            <select
                              value={values[f.key] ?? ""}
                              disabled={busy}
                              onChange={(e) => edit(f.key, e.target.value)}
                            >
                              <option value="">{label("default")}</option>
                              <option value="true">{label("enabled")}</option>
                              <option value="false">{label("disabled")}</option>
                              {values[f.key] && !["true", "false"].includes(values[f.key]) && (
                                <option value={values[f.key]}>{values[f.key]}</option>
                              )}
                            </select>
                          ) : (
                            <input
                              type={f.kind === "secret" ? "password" : "text"}
                              inputMode={f.kind === "number" ? "decimal" : undefined}
                              autoComplete="off"
                              spellCheck={false}
                              disabled={busy}
                              value={values[f.key] ?? ""}
                              placeholder={f.placeholder ?? label("default")}
                              onChange={(e) => edit(f.key, e.target.value)}
                            />
                          )}
                          <small className="studio-hint">{f.key}</small>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
              <details className="local-config-group" onToggle={(e) => setAdvanced(e.currentTarget.open)}>
                <summary>{label("advanced")}</summary>
                <p className="studio-hint">{label("advancedHint")}</p>
                {advanced && (
                  <textarea
                    className="local-config-source"
                    aria-label={label("advanced")}
                    rows={16}
                    spellCheck={false}
                    autoComplete="off"
                    value={text}
                    disabled={busy}
                    onChange={(e) => {
                      setText(e.target.value)
                      setSaved(false)
                      setError("")
                    }}
                  />
                )}
              </details>
              {invalidField && (
                <p role="alert">
                  {label("invalid")}: {invalidField}
                </p>
              )}
              <button type="button" disabled={busy || !dirty || !!invalidField} onClick={() => void save()}>
                {label(busy ? "working" : "save")}
              </button>
              {dirty && <span role="status">{label("unsaved")}</span>}
              {saved && (
                <p role="status">
                  {label("saved")}
                  {loaded.backupPath && (
                    <>
                      <br />
                      {label("backup")}: {loaded.backupPath}
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { pickCardFile, pickPngFile } from "../../../lib/native"
import { persistenceDegraded } from "../../../lib/persistStorage"
import { describeImportFailure } from "../importErrors"
import { saveMaterialCopy } from "./files"
import { materialBasicPath, materialValue, readMaterial } from "./model"
import MaterialFields from "./MaterialFields"
import { useMaterialStore } from "./store"
export default function MaterialEditor() {
  const { t } = useTranslation()
  const { document: doc, pngBytes, open, edit, restore, attach } = useMaterialStore()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invalidPaths, setInvalidPaths] = useState<Set<string>>(new Set())
  const [revision, setRevision] = useState(0)
  const act = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await operation()
    } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith("studio.materials.")) setError(t(cause.message))
      else {
        const problem = describeImportFailure(cause, doc?.name ?? "")
        setError(t(`studio.${problem.key}`, problem.params))
      }
    } finally {
      setBusy(false)
    }
  }
  const importFile = () =>
    act(async () => {
      if (
        doc &&
        JSON.stringify(doc.raw) !== JSON.stringify(doc.original) &&
        !window.confirm(t("studio.materials.replaceConfirm"))
      )
        return
      const file = await pickCardFile()
      if (!file) return
      const document = await readMaterial(file)
      open(document, file.bytes)
      setInvalidPaths(new Set())
      setRevision((n) => n + 1)
      setNotice(t("studio.materials.imported", { name: file.name }))
    })
  const exportCopy = (png: boolean) =>
    act(async () => {
      if (!doc) return
      let bytes = pngBytes
      if (png && !bytes) {
        const file = await pickPngFile()
        if (!file) return
        const candidate = await readMaterial(file)
        // A resumed PNG draft must reattach the same card, not an unrelated portrait.
        if (!candidate.png || JSON.stringify(candidate.original) !== JSON.stringify(doc.original))
          throw new Error("studio.materials.wrongPng")
        bytes = file.bytes
        attach(bytes)
      }
      const result = await saveMaterialCopy(doc, png && bytes ? bytes : undefined)
      setNotice(t(`studio.save.${result}`))
    })
  const basicPath = doc ? materialBasicPath(doc.raw) : []
  return (
    <section className="material-editor" aria-label={t("studio.materials.title")}>
      <div className="studio-bar">
        <h2>{t("studio.materials.title")}</h2>
        <div className="header-spacer" />
        <button type="button" disabled={busy} onClick={() => void importFile()}>
          {t("studio.materials.import")}
        </button>
        {doc && (
          <>
            <button
              type="button"
              disabled={busy || invalidPaths.size > 0}
              onClick={() => void exportCopy(false)}
            >
              {t("studio.materials.saveJson")}
            </button>
            {doc.png && (
              <button
                type="button"
                disabled={busy || invalidPaths.size > 0}
                onClick={() => void exportCopy(true)}
              >
                {t("studio.materials.savePng")}
              </button>
            )}
          </>
        )}
      </div>
      <p className="studio-hint">{t("studio.materials.hint")}</p>
      {notice && (
        <p role="status" className="studio-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="studio-notice">
          {error}
        </p>
      )}
      {doc && (
        <>
          <p className="studio-hint">
            {doc.name} ·{" "}
            {t(persistenceDegraded() ? "studio.materials.unsaved" : "studio.materials.draftSaved")}
          </p>
          <fieldset className="material-edit-fields" disabled={busy}>
            <div className="material-basics">
              {["name", "description"].map((key) => {
                const path = [...basicPath, key]
                const value = materialValue(doc.raw, path)
                return typeof value === "string" ? (
                  <label className="field" key={key}>
                    {t(`studio.card.${key}`)}
                    {key === "name" ? (
                      <input value={value} onChange={(e) => edit(path, e.target.value)} />
                    ) : (
                      <textarea rows={3} value={value} onChange={(e) => edit(path, e.target.value)} />
                    )}
                  </label>
                ) : null
              })}
            </div>
            <details>
              <summary>{t("studio.materials.fields")}</summary>
              <p className="studio-hint">{t("studio.materials.fieldsHint")}</p>
              <MaterialFields
                key={revision}
                value={doc.raw}
                path={[]}
                onEdit={edit}
                onValidity={(path, valid) =>
                  setInvalidPaths((previous) => {
                    const next = new Set(previous)
                    if (valid) next.delete(JSON.stringify(path))
                    else next.add(JSON.stringify(path))
                    return next
                  })
                }
              />
            </details>
          </fieldset>
          {invalidPaths.size > 0 && <p role="alert">{t("studio.materials.invalidNumber")}</p>}
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t("studio.materials.restoreConfirm"))) {
                restore()
                setInvalidPaths(new Set())
                setRevision((n) => n + 1)
              }
            }}
          >
            {t("studio.materials.restore")}
          </button>
        </>
      )}
    </section>
  )
}

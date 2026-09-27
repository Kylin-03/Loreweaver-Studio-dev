import { useState } from "react"
import { useTranslation } from "react-i18next"
import { lockedMaterialField, type MaterialPath, type MaterialScalar } from "./model"
interface Props {
  value: unknown
  path: MaterialPath
  onEdit: (path: MaterialPath, value: MaterialScalar) => void
  onValidity: (path: MaterialPath, valid: boolean) => void
}
/** Branches render only when expanded, so large worldbooks stay responsive. */
export default function MaterialFields({ value, path, onEdit, onValidity }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(path.length === 0)
  const [limit, setLimit] = useState(40)
  const label = String(path.at(-1) ?? t("studio.materials.allFields"))
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value) ? value.map((v, i) => [i, v] as const) : Object.entries(value)
    return (
      <details
        className="material-branch"
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary>
          {label} <span className="studio-hint">({entries.length})</span>
        </summary>
        {expanded &&
          (path.length >= 32 ? (
            <p className="studio-hint">{t("studio.materials.deepBranch")}</p>
          ) : (
            <>
              {entries.slice(0, limit).map(([key, child]) => (
                <MaterialFields
                  key={key}
                  value={child}
                  path={[...path, key]}
                  onEdit={onEdit}
                  onValidity={onValidity}
                />
              ))}
              {entries.length > limit && (
                <button type="button" onClick={() => setLimit(limit + 40)}>
                  {t("studio.materials.showMore")}
                </button>
              )}
            </>
          ))}
      </details>
    )
  }
  const title = path.join(" / ")
  if (value === null || lockedMaterialField(path))
    return (
      <div className="material-readonly">
        <span>{label}</span>
        <code title={title}>{String(value)}</code>
        <small>{t("studio.materials.readonly")}</small>
      </div>
    )
  if (typeof value === "boolean")
    return (
      <label className="field material-field">
        <span>
          <input type="checkbox" checked={value} onChange={(e) => onEdit(path, e.target.checked)} /> {label}
        </span>
      </label>
    )
  if (typeof value === "number")
    return (
      <NumericField
        key={`${title}:${value}`}
        label={label}
        value={value}
        onChange={(next) => onEdit(path, next)}
        onValidity={(valid) => onValidity(path, valid)}
      />
    )
  if (typeof value !== "string") return null
  return (
    <label className="field material-field" title={title}>
      {label}
      {value.includes("\n") || value.length > 120 ? (
        <textarea rows={4} value={value} onChange={(e) => onEdit(path, e.target.value)} />
      ) : (
        <input value={value} onChange={(e) => onEdit(path, e.target.value)} />
      )}
    </label>
  )
}
function NumericField({
  label,
  value,
  onChange,
  onValidity,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  onValidity: (valid: boolean) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(String(value))
  const invalid = !text.trim() || !Number.isFinite(Number(text))
  return (
    <label className="field material-field">
      {label}
      <input
        inputMode="decimal"
        value={text}
        aria-invalid={invalid}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          onValidity(!!next.trim() && Number.isFinite(Number(next)))
        }}
        onBlur={() => {
          if (!invalid) onChange(Number(text))
        }}
      />
      {invalid && <small role="alert">{t("studio.materials.invalidNumber")}</small>}
    </label>
  )
}

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { usePlayWorkspace } from "../../store/playWorkspace"

/** Keep expressions deliberately small; rule-specific checks remain server commands. */
function validDice(value: string): boolean {
  const match = /^(\d{1,2})?d(\d{1,3})([+-]\d{1,4})?$/i.exec(value.trim())
  return !!match && Number(match[1] ?? 1) >= 1 && Number(match[1] ?? 1) <= 99 && Number(match[2]) >= 2
}
export default function DiceTools({ disabled, send }: { disabled: boolean; send: (text: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [expression, setExpression] = useState("1d100")
  const [skill, setSkill] = useState("")
  const recent = usePlayWorkspace((s) => s.recentDice)
  const roll = (value: string) => {
    usePlayWorkspace.getState().rememberDice(value)
    send(`.r ${value}`)
  }
  return (
    <details className="dice-tools" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t("composer.dice")}</summary>
      {open && (
        <>
          <div className="dice-presets">
            {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
              <button type="button" disabled={disabled} key={sides} onClick={() => roll(`1d${sides}`)}>
                d{sides}
              </button>
            ))}
          </div>
          <div className="dice-expression">
            <input
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  if (!disabled && validDice(expression)) roll(expression.trim())
                }
              }}
              aria-label={t("composer.expression")}
              value={expression}
              maxLength={20}
              onChange={(event) => setExpression(event.target.value)}
            />
            <button
              type="button"
              disabled={disabled || !validDice(expression)}
              onClick={() => roll(expression.trim())}
            >
              {t("composer.roll")}
            </button>
          </div>
          {recent.length > 0 && (
            <div className="dice-presets">
              {recent.map((value) => (
                <button type="button" key={value} disabled={disabled} onClick={() => roll(value)}>
                  {value}
                </button>
              ))}
            </div>
          )}
          <div className="dice-expression">
            <input
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  if (!event.nativeEvent.isComposing && !disabled && skill.trim()) send(`.ra ${skill.trim()}`)
                }
              }}
              aria-label={t("composer.skill")}
              placeholder={t("composer.skill")}
              value={skill}
              maxLength={100}
              onChange={(event) => setSkill(event.target.value)}
            />
            <button
              type="button"
              disabled={disabled || !skill.trim()}
              onClick={() => send(`.ra ${skill.trim()}`)}
            >
              {t("composer.check")}
            </button>
          </div>
          <p className="studio-hint">{t("composer.checkHint")}</p>
        </>
      )}
    </details>
  )
}

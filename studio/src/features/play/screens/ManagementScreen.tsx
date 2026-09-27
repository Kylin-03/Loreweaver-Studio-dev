import { useState } from "react"
import { useTranslation } from "react-i18next"
import KeysScreen from "./KeysScreen"
import ModuleScreen from "./ModuleScreen"
import RulesScreen from "./RulesScreen"
import SkillsScreen from "./SkillsScreen"
import ModelScreen from "./ModelScreen"
import { usePlayWorkspace } from "../../../store/playWorkspace"

const screens = {
  module: ModuleScreen,
  keys: KeysScreen,
  rules: RulesScreen,
  skills: SkillsScreen,
  model: ModelScreen,
}
type Section = keyof typeof screens
export default function ManagementScreen() {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>("module")
  const [visited, setVisited] = useState<Section[]>(["module"])
  return (
    <div className="management-screen">
      <nav className="workspace-subnav">
        {(Object.keys(screens) as Section[]).map((key) => (
          <button
            key={key}
            type="button"
            className={key === section ? "mode-tab active" : "mode-tab"}
            onClick={() => {
              setSection(key)
              setVisited((old) => (old.includes(key) ? old : [...old, key]))
            }}
          >
            {t(`play.menu.${key}`)}
          </button>
        ))}
      </nav>
      {visited.map((key) => {
        const Screen = screens[key]
        return (
          <div hidden={section !== key} key={key}>
            <Screen onBack={() => usePlayWorkspace.getState().setPage("game")} />
          </div>
        )
      })}
    </div>
  )
}

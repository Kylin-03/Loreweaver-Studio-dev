import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./i18n"
import "./styles.css"
import "./styles/workspace.css"
import "./styles/appearance.css"
import "./styles/materials.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

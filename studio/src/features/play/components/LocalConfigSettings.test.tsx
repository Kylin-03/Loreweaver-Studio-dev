import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import LocalConfigSettings from "./LocalConfigSettings"

const api = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  status: vi.fn(),
}))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("../../../store/hostLocal", () => ({
  useHostLocalStore: (select: (s: { homeOverride: string }) => unknown) =>
    select({ homeOverride: "synthetic-host" }),
}))
vi.mock("../../../lib/transport", () => ({ isTauri: () => true }))
vi.mock("../../../lib/hostLocal", () => ({ hostLocalStatus: api.status }))
vi.mock("../../../lib/localConfig", async (original) => ({
  ...(await original<object>()),
  readLocalConfig: api.read,
  saveLocalConfig: api.save,
}))

const config = {
  home: "D:/synthetic-host",
  text: "TRPG_LLM__API_KEY='synthetic-secret'\nTRPG_LLM__CHAT_MODEL=old\n",
  revision: "first",
  encoding: "utf8",
  backupPath: null,
}
const key = (s: string) => `play.localConfig.${s}`
beforeEach(() => {
  vi.clearAllMocks()
  api.status.mockResolvedValue({ home: config.home })
  api.read.mockResolvedValue(config)
  api.save.mockImplementation(async (_home, text) => ({ ...config, text, revision: "next" }))
})

describe("local configuration form", () => {
  it("only loads on request, masks credentials, and saves against the read revision", async () => {
    render(<LocalConfigSettings />)
    expect(api.read).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText(key("load")))
    await waitFor(() => expect(api.read).toHaveBeenCalledWith(config.home))
    const secret = await screen.findByLabelText(key("fields.apiKey") + "TRPG_LLM__API_KEY")
    expect(secret).toHaveAttribute("type", "password")
    expect(screen.queryByRole("textbox", { name: key("advanced") })).not.toBeInTheDocument()
    const model = screen.getByDisplayValue("old")
    fireEvent.change(model, { target: { value: "new" } })
    fireEvent.click(screen.getByText(key("save")))
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        config.home,
        expect.stringContaining("TRPG_LLM__CHAT_MODEL='new'"),
        "first",
      ),
    )
  })
  it("keeps edits after a conflict and asks before reload discards them", async () => {
    api.save.mockRejectedValue("config_conflict")
    render(<LocalConfigSettings />)
    fireEvent.click(screen.getByText(key("load")))
    fireEvent.change(await screen.findByDisplayValue("old"), { target: { value: "new" } })
    fireEvent.click(screen.getByText(key("save")))
    expect(await screen.findByRole("alert")).toHaveTextContent(key("errors.config_conflict"))
    expect(screen.getByDisplayValue("new")).toBeInTheDocument()
    fireEvent.click(screen.getByText(key("reload")))
    expect(screen.getByText(key("discard"))).toBeInTheDocument()
    expect(api.read).toHaveBeenCalledTimes(1)
  })
})

import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WelcomeFrame } from "@loreweaver/protocol"
import "../../i18n"
import { useConnectionStore } from "../../store/connection"
import { useSessionStore } from "../../store/session"
import { usePlayWorkspace } from "../../store/playWorkspace"
import PlayView from "./PlayView"

const WELCOME: WelcomeFrame = {
  type: "welcome",
  protocol: "1.7",
  room: "r1",
  you: { id: "u1", name: "Nyx", role: "keeper" },
  locale: "en",
  server: "loreweaver/1",
}

function reset() {
  useConnectionStore.setState({ status: "offline", attempt: 0, lastError: null, welcome: null })
  useSessionStore.getState().clear()
  usePlayWorkspace.setState({ page: "game", drafts: {} })
}

describe("PlayView", () => {
  beforeEach(reset)

  it("disables connect until ticket and key are filled", async () => {
    const user = userEvent.setup()
    render(<PlayView />)
    const submit = screen.getByRole("button", { name: "Connect" })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(/server ticket/i), "endpoint-abc")
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText(/access key/i), "k-1")
    expect(submit).toBeEnabled()
  })

  it("submits trimmed connect parameters", async () => {
    const connect = vi.fn().mockResolvedValue(undefined)
    useConnectionStore.setState({ connect })
    const user = userEvent.setup()
    render(<PlayView />)
    await user.type(screen.getByLabelText(/server ticket/i), "  endpoint-abc  ")
    await user.type(screen.getByLabelText(/access key/i), " k-1 ")
    await user.click(screen.getByRole("button", { name: "Connect" }))
    expect(connect).toHaveBeenCalledWith({ ticket: "endpoint-abc", key: "k-1", name: undefined })
  })

  it("opens directly into play and retains drafts across page changes", async () => {
    const user = userEvent.setup()
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    render(<PlayView />)
    expect(screen.getByText("r1 · Nyx")).toBeInTheDocument()
    const field = screen.getByLabelText("Speak, act, or type a command…")
    await user.type(field, "unfinished action")
    act(() => usePlayWorkspace.getState().setPage("character"))
    expect(field).not.toBeVisible()
    act(() => usePlayWorkspace.getState().setPage("game"))
    expect(field).toBeVisible()
    expect(field).toHaveValue("unfinished action")
  })

  it("keeps the menu visible while reconnecting, with the attempt count", () => {
    useConnectionStore.setState({ status: "reconnecting", attempt: 2, welcome: WELCOME })
    render(<PlayView />)
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
    expect(screen.getByText(/attempt 2/i)).toBeInTheDocument()
  })

  it("opens management directly for a keeper", () => {
    useConnectionStore.setState({ status: "online", welcome: WELCOME })
    usePlayWorkspace.setState({ page: "manage" })
    render(<PlayView />)
    expect(screen.getByRole("button", { name: "Rooms & invites" })).toBeVisible()
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument()
  })

  it("hides the keeper section from players", () => {
    useConnectionStore.setState({
      status: "online",
      welcome: { ...WELCOME, you: { ...WELCOME.you, role: "player" } },
    })
    render(<PlayView />)
    expect(screen.queryByText("── Keeper ──")).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: /Rooms & invites/ })).not.toBeInTheDocument()
  })

  it("offers the host-locally button on the connect screen (desktop-only outside the shell)", () => {
    render(<PlayView />)
    const button = screen.getByRole("button", { name: "Host locally & play" })
    // jsdom is not the Tauri shell, so the button is present but disabled.
    expect(button).toBeDisabled()
    expect(screen.getByText(/needs the desktop app/)).toBeInTheDocument()
  })

  it("surfaces transport errors on the connect form", () => {
    useConnectionStore.setState({ lastError: "bad_key: unknown key" })
    render(<PlayView />)
    expect(screen.getByRole("alert")).toHaveTextContent("bad_key")
  })
})

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import MaterialEditor from "./MaterialEditor"
import { useMaterialStore } from "./store"
const { pickCardFile, saveMaterialCopy } = vi.hoisted(() => ({
  pickCardFile: vi.fn(),
  saveMaterialCopy: vi.fn(),
}))
vi.mock("../../../lib/native", () => ({ pickCardFile, pickPngFile: vi.fn() }))
vi.mock("./files", () => ({ saveMaterialCopy }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
beforeEach(() => {
  useMaterialStore.setState({ document: null, pngBytes: null })
  pickCardFile.mockResolvedValue({
    name: "card.json",
    path: null,
    bytes: new TextEncoder().encode(
      JSON.stringify({
        name: "Old",
        extensions: { panel: { label: "Status", value: 10 } },
        worldbook: [{ content: "keep" }],
      }),
    ),
  })
  saveMaterialCopy.mockResolvedValue("saved")
})
it("imports, edits a name, and exports the complete modified document", async () => {
  const user = userEvent.setup()
  render(<MaterialEditor />)
  await user.click(screen.getByRole("button", { name: "studio.materials.import" }))
  const name = await screen.findByLabelText("studio.card.name")
  await user.clear(name)
  await user.type(name, "New")
  await user.click(screen.getByRole("button", { name: "studio.materials.saveJson" }))
  await waitFor(() => expect(saveMaterialCopy).toHaveBeenCalled())
  expect(saveMaterialCopy.mock.calls[0][0].raw).toEqual({
    name: "New",
    extensions: { panel: { label: "Status", value: 10 } },
    worldbook: [{ content: "keep" }],
  })
})
it("blocks exporting invalid numbers and applies valid numeric changes without changing labels", async () => {
  const user = userEvent.setup()
  render(<MaterialEditor />)
  await user.click(screen.getByRole("button", { name: "studio.materials.import" }))
  await user.click(await screen.findByText("studio.materials.fields"))
  await user.click(screen.getByText("extensions", { selector: "summary" }))
  await user.click(await screen.findByText("panel", { selector: "summary" }))
  const input = await screen.findByLabelText("value")
  await user.clear(input)
  expect(screen.getByRole("button", { name: "studio.materials.saveJson" })).toBeDisabled()
  await user.type(input, "31")
  await user.tab()
  expect(
    (useMaterialStore.getState().document!.raw.extensions as { panel: { value: number } }).panel.value,
  ).toBe(31)
  expect(screen.getByRole("button", { name: "studio.materials.saveJson" })).toBeEnabled()
})

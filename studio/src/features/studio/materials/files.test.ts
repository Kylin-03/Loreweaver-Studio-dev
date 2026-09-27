import { beforeEach, describe, expect, it, vi } from "vitest"
import { normalizedFilePath, saveMaterialCopy } from "./files"
const { save, invoke } = vi.hoisted(() => ({ save: vi.fn(), invoke: vi.fn() }))
vi.mock("@tauri-apps/plugin-dialog", () => ({ save }))
vi.mock("@tauri-apps/api/core", () => ({ invoke }))
vi.mock("../../../lib/transport", () => ({ isTauri: () => true }))
const doc = {
  name: "original.json",
  path: "D:/materials/original.json",
  png: false,
  raw: { name: "角色" },
  original: { name: "original" },
}
beforeEach(() => {
  save.mockReset()
  invoke.mockReset()
})
describe("material save copies", () => {
  it("refuses source path even with Windows case or separators", async () => {
    save.mockResolvedValue("d:\\materials\\original.json")
    await expect(saveMaterialCopy(doc)).rejects.toThrow("sourceProtected")
    expect(invoke).not.toHaveBeenCalled()
    expect(normalizedFilePath("D:/materials/child/../original.json")).toBe(normalizedFilePath(doc.path))
  })
  it("writes edited content to an explicitly chosen copy", async () => {
    save.mockResolvedValue("D:/materials/copy.json")
    expect(await saveMaterialCopy(doc)).toBe("saved")
    expect(invoke).toHaveBeenCalledWith("write_text_file", {
      path: "D:/materials/copy.json",
      contents: JSON.stringify(doc.raw, null, 2),
    })
  })
})

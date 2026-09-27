import { describe, expect, it, vi } from "vitest"
import { materialCopyName, readMaterial, updateMaterial } from "./model"
import { embedCardIntoPng, embedMaterialIntoPng, pngChunk } from "../pngCard"
import { parseCardBytes } from "../split/charcard"
import { useMaterialStore } from "./store"
vi.mock("../../../lib/native", async (original) => ({
  ...(await original<typeof import("../../../lib/native")>()),
}))
const raw = {
  spec: "chara_card_v3",
  vendor: { preserve: true },
  data: {
    name: "调查员",
    description: "中文",
    character_book: { entries: [{ content: "secret script <% code %>" }] },
    extensions: { panel: { id: "stable", label: "状态", value: 25 } },
  },
}
const file = {
  name: "world.json",
  path: "D:/materials/world.json",
  bytes: new TextEncoder().encode(JSON.stringify(raw)),
}
function png() {
  const chunks = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", new Uint8Array(13)),
    pngChunk("IDAT", new Uint8Array([1, 2, 3])),
    pngChunk("IEND", new Uint8Array()),
  ]
  const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}
describe("lossless material micro-edits", () => {
  it("changes only the selected leaf and retains scripts, unknown fields and source data", async () => {
    const doc = await readMaterial(file)
    const changed = updateMaterial(doc.raw, ["data", "extensions", "panel", "label"], "角色状态")
    expect(changed).toEqual({
      ...raw,
      data: { ...raw.data, extensions: { panel: { ...raw.data.extensions.panel, label: "角色状态" } } },
    })
    expect(doc.original).toEqual(raw)
    expect(updateMaterial(changed, ["data", "extensions", "panel", "id"], "broken")).toBe(changed)
    expect(updateMaterial(changed, ["data", "extensions", "panel", "value"], "25")).toBe(changed)
    expect(materialCopyName(doc, false)).toBe("world.edited.json")
  })
  it("retains v3 root metadata and the full raw document through PNG edits", async () => {
    const source = embedCardIntoPng(png(), raw)
    const doc = await readMaterial({ name: "world.png", path: null, bytes: source })
    expect(doc.raw).toEqual(raw)
    const changed = updateMaterial(doc.raw, ["data", "name"], "泉生子")
    const copied = embedMaterialIntoPng(source, changed)
    expect((await parseCardBytes(copied)).raw).toEqual(changed)
    expect((await parseCardBytes(source, "world.png", true)).raw).toEqual(raw)
  })
  it("rejects invalid UTF-8 instead of exporting replacement characters", async () => {
    await expect(
      readMaterial({ ...file, bytes: new Uint8Array([123, 34, 110, 34, 58, 34, 255, 34, 125]) }),
    ).rejects.toThrow("invalidJson")
  })
  it("persists edits without binary bytes and can restore original fields", async () => {
    const doc = await readMaterial(file)
    useMaterialStore.getState().open({ ...doc, png: true }, new Uint8Array([1, 2, 3]))
    useMaterialStore.getState().edit(["data", "name"], "New")
    expect(localStorage.getItem("loreweaver-material-editor-v1")).not.toContain("pngBytes")
    await useMaterialStore.persist.rehydrate()
    expect((useMaterialStore.getState().document!.raw.data as Record<string, unknown>).name).toBe("New")
    useMaterialStore.getState().restore()
    expect(useMaterialStore.getState().document!.raw).toEqual(raw)
  })
})

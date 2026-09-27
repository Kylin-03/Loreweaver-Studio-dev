import { invoke } from "@tauri-apps/api/core"
import { save } from "@tauri-apps/plugin-dialog"
import { bytesToBase64 } from "../../../lib/native"
import { saveBinaryFile, saveTextFile, type SaveOutcome } from "../../../lib/files"
import { isTauri } from "../../../lib/transport"
import { embedMaterialIntoPng } from "../pngCard"
import { materialCopyName, type MaterialDocument } from "./model"
export function normalizedFilePath(path: string): string {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  return parts.join("/").toLowerCase()
}
export async function saveMaterialCopy(doc: MaterialDocument, pngBytes?: Uint8Array): Promise<SaveOutcome> {
  const name = materialCopyName(doc, !!pngBytes)
  const json = JSON.stringify(doc.raw, null, 2)
  const bytes = pngBytes ? embedMaterialIntoPng(pngBytes, doc.raw) : null
  if (!isTauri()) return bytes ? saveBinaryFile(name, bytes, "png") : saveTextFile(name, json)
  const path = await save({
    defaultPath: name,
    filters: [{ name: bytes ? "PNG" : "JSON", extensions: [bytes ? "png" : "json"] }],
  })
  if (!path) return "cancelled"
  // This workflow is intentionally Save Copy; never silently overwrite the source material.
  if (doc.path && normalizedFilePath(path) === normalizedFilePath(doc.path))
    throw new Error("studio.materials.sourceProtected")
  if (bytes) await invoke("write_binary_file", { path, base64: bytesToBase64(bytes) })
  else await invoke("write_text_file", { path, contents: json })
  return "saved"
}

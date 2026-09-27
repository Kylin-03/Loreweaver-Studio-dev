import { isRecord, MAX_CARD_FILE_BYTES, parseCardBytes } from "../split/charcard"
import type { PickedFile } from "../../../lib/native"
import { safeFileName } from "../split/packSource"
export type MaterialPath = (string | number)[]
export type MaterialScalar = string | number | boolean | null
export interface MaterialDocument {
  name: string
  path: string | null
  raw: Record<string, unknown>
  original: Record<string, unknown>
  png: boolean
}
export function isMaterialPng(bytes: Uint8Array): boolean {
  return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
}
export async function readMaterial(file: PickedFile): Promise<MaterialDocument> {
  if (file.bytes.length > MAX_CARD_FILE_BYTES) throw new Error("studio.materials.tooLarge")
  const png = isMaterialPng(file.bytes)
  let raw: unknown
  if (png) raw = (await parseCardBytes(file.bytes, file.name, true)).raw
  else {
    // Reject invalid UTF-8 instead of replacing Chinese text with U+FFFD on export.
    try {
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes))
    } catch {
      throw new Error("studio.materials.invalidJson")
    }
  }
  if (!isRecord(raw)) throw new Error("studio.materials.notObject")
  return { name: file.name, path: file.path, raw, original: raw, png }
}
const LOCKED_KEYS = new Set([
  "id",
  "uid",
  "key",
  "path",
  "spec",
  "spec_version",
  "format",
  "format_version",
  "hash",
  "mime",
  "type",
])
export function lockedMaterialField(path: MaterialPath): boolean {
  return LOCKED_KEYS.has(String(path.at(-1)))
}
export function materialValue(raw: unknown, path: MaterialPath): unknown {
  let value = raw
  for (const key of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined
    value = (value as Record<string | number, unknown>)[key]
  }
  return value
}
/** Clone only the edited branch; never reconstruct an imported card from a limited schema. */
export function updateMaterial(
  raw: Record<string, unknown>,
  path: MaterialPath,
  value: MaterialScalar,
): Record<string, unknown> {
  if (!path.length || lockedMaterialField(path)) return raw
  const previous = materialValue(raw, path)
  if (
    previous === undefined ||
    (typeof previous === "object" && previous !== null) ||
    typeof previous !== typeof value ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    return raw
  const visit = (node: unknown, depth: number): unknown => {
    if (depth === path.length) return value
    const key = path[depth]
    if (Array.isArray(node)) {
      if (typeof key !== "number" || !Number.isInteger(key) || key < 0 || key >= node.length) return node
      return node.map((item, index) => (index === key ? visit(item, depth + 1) : item))
    }
    if (!isRecord(node) || !Object.hasOwn(node, key)) return node
    return { ...node, [key]: visit(node[key], depth + 1) }
  }
  return visit(raw, 0) as Record<string, unknown>
}
export function materialCopyName(doc: MaterialDocument, png: boolean): string {
  const stem = doc.name.replace(/\.(json|png)$/i, "")
  return `${safeFileName(stem, "material")}.edited.${png ? "png" : "json"}`
}
export function materialBasicPath(raw: Record<string, unknown>): MaterialPath {
  if ((raw.spec === "chara_card_v2" || raw.spec === "chara_card_v3") && isRecord(raw.data)) return ["data"]
  if (raw.format === "loreweaver.card" && isRecord(raw.card)) return ["card"]
  return []
}

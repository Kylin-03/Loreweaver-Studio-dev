import { invoke } from "@tauri-apps/api/core"

export interface LocalConfig {
  home: string
  text: string
  revision: string
  encoding: "utf8" | "utf8Bom" | "gbk"
  backupPath: string | null
}

export const readLocalConfig = (home: string) => invoke<LocalConfig>("local_config_read", { home })
export const saveLocalConfig = (home: string, text: string, expectedRevision: string) =>
  invoke<LocalConfig>("local_config_save", { home, text, expectedRevision })

interface Entry {
  key: string
  value: string
  start: number
  end: number
  suffix: string
}

/** Keep offsets and comments so form edits never regenerate an operator's file. */
export function parseConfig(text: string): Entry[] {
  const entries: Entry[] = []
  const keys = new Set<string>()
  let pos = 0
  while (pos < text.length) {
    const start = pos
    const lineEnd = text.indexOf("\n", pos)
    const end = lineEnd < 0 ? text.length : lineEnd
    const line = text.slice(pos, end).replace(/\r$/, "")
    if (/^\s*(?:#.*)?$/.test(line)) {
      pos = end + 1
      continue
    }
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/.exec(line)
    if (!match || keys.has(match[1])) throw new Error("config_syntax")
    const key = match[1]
    keys.add(key)
    let valueStart = start + match[0].length
    // A trailing empty assignment must not eat the next physical line.
    valueStart = Math.min(valueStart, end)
    const quote = text[valueStart]
    let valueEnd = end
    let suffix: string
    let value: string
    if (quote === '"' || quote === "'") {
      let close = valueStart + 1
      while (close < text.length) {
        if (text[close] === "\\" && (text[close + 1] === quote || text[close + 1] === "\\")) {
          close += 2
          continue
        }
        if (text[close] === quote) break
        close++
      }
      if (close >= text.length) throw new Error("config_syntax")
      const nextEnd = text.indexOf("\n", close)
      valueEnd = nextEnd < 0 ? text.length : nextEnd
      suffix = text.slice(close + 1, valueEnd).replace(/\r$/, "")
      if (!/^\s*(?:#.*)?$/.test(suffix)) throw new Error("config_syntax")
      const raw = text.slice(valueStart + 1, close)
      const escapes: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        a: "\x07",
        b: "\b",
        f: "\f",
        v: "\v",
      }
      value = raw.replace(
        quote === '"' ? /\\([\\'"nrtabfv])/g : /\\([\\'])/g,
        (_all, char: string) => escapes[char] ?? char,
      )
    } else {
      const raw = text.slice(valueStart, end).replace(/\r$/, "")
      const comment = raw.search(/\s+#/)
      value = (comment < 0 ? raw : raw.slice(0, comment)).trimEnd()
      suffix = comment < 0 ? "" : raw.slice(comment)
    }
    entries.push({ key, value, start, end: valueEnd, suffix })
    pos = valueEnd + 1
  }
  return entries
}

export function configValues(text: string): Record<string, string> {
  return Object.fromEntries(parseConfig(text).map(({ key, value }) => [key, value]))
}

export function updateConfig(text: string, key: string, value: string): string {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || /[\0\r\n]/.test(value)) throw new Error("config_syntax")
  // Single quotes prevent backslash expansion, including Windows folder paths.
  const encoded = `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`
  const entry = parseConfig(text).find((item) => item.key === key)
  const newline = text.includes("\r\n") ? "\r\n" : "\n"
  // Empty fields inherit actual server defaults; an empty bool/number is invalid.
  if (!value) {
    if (!entry) return text
    const after = text[entry.end] === "\n" ? entry.end + 1 : entry.end
    const comment = entry.suffix.trim()
    return text.slice(0, entry.start) + (comment ? comment + newline : "") + text.slice(after)
  }
  if (!entry) return `${text}${text && !text.endsWith("\n") ? newline : ""}${key}=${encoded}${newline}`
  const cr = text[entry.end - 1] === "\r" ? "\r" : ""
  return text.slice(0, entry.start) + `${key}=${encoded}${entry.suffix}${cr}` + text.slice(entry.end)
}

export interface ConfigField {
  key: string
  label: string
  kind?: "secret" | "boolean" | "number"
  placeholder?: string
}
export interface ConfigGroup {
  id: string
  fields: ConfigField[]
}
const field = (
  key: string,
  label: string,
  kind?: ConfigField["kind"],
  placeholder?: string,
): ConfigField => ({ key: `TRPG_${key}`, label, kind, placeholder })
const modelFields = (prefix: string) => [
  field(`${prefix}__PROVIDER`, "provider"),
  field(`${prefix}__BASE_URL`, "baseUrl"),
  field(`${prefix}__API_KEY`, "apiKey", "secret"),
  field(`${prefix}__CHAT_MODEL`, "chatModel"),
  field(`${prefix}__REASONING_EFFORT`, "reasoningEffort"),
]

/** Mirrors infra/config.py; prep, memory and companion calls inherit these lanes. */
export const configGroups: ConfigGroup[] = [
  {
    id: "llm",
    fields: [
      ...modelFields("LLM"),
      field("LLM__ANALYSIS_MODEL", "analysisModel"),
      field("LLM__NPC_MODEL", "npcModel"),
      field("LLM__CONTEXT_WINDOW", "contextWindow", "number", "0"),
      field("LLM__STREAM_USAGE", "streamUsage", "boolean"),
      field("LLM__TEMPERATURE", "temperature", "number"),
      field("LLM__EMBEDDING_MODEL", "embeddingModel"),
      field("LLM__EMBEDDING_DIM", "embeddingDim", "number", "1536"),
    ],
  },
  { id: "scribe", fields: [field("SCRIBE__ENABLED", "enabled", "boolean"), ...modelFields("SCRIBE")] },
  {
    id: "director",
    fields: [
      field("DIRECTOR__ENABLED", "enabled", "boolean"),
      ...modelFields("DIRECTOR"),
      field("DIRECTOR__IMAGES", "images", "boolean"),
      field("DIRECTOR__MAX_IMAGES", "maxImages", "number", "24"),
      field("DIRECTOR__PREGEN_PER_BEAT", "pregenPerBeat", "number", "2"),
    ],
  },
  {
    id: "imagegen",
    fields: [
      field("IMAGEGEN__PROVIDER", "provider"),
      field("IMAGEGEN__BASE_URL", "baseUrl"),
      field("IMAGEGEN__API_KEY", "apiKey", "secret"),
      field("IMAGEGEN__MODEL", "chatModel"),
      field("IMAGEGEN__SIZE", "imageSize", undefined, "1024x1024"),
      field("IMAGEGEN__PER_ROOM_PER_HOUR", "imagesPerHour", "number", "10"),
    ],
  },
  {
    id: "behavior",
    fields: [
      field("LOCALE", "locale", undefined, "en"),
      field("DEFAULT_RULEPACK", "rulepack", undefined, "coc7"),
      field("ENABLE_VECTOR_DB", "vector", "boolean"),
      field("ENABLE_CRITICAL_EFFECTS", "critical", "boolean"),
      field("ENABLE_FULL_EJS", "ejs", "boolean"),
      field("CHRONICLE__ENABLED", "memory", "boolean"),
      field("CHRONICLE__AUTO_RECORD", "autoRecord", "boolean"),
      field("CHRONICLE__FOLD_TRIGGER", "foldTrigger", "number", "0.6"),
      field("CHRONICLE__FOLD_FLOOR", "foldFloor", "number", "0.4"),
      field("CHRONICLE__FOLD_EMERGENCY", "foldEmergency", "number", "0.85"),
      field("CHRONICLE__LAG_TURNS", "lagTurns", "number", "4"),
      field("CHRONICLE__SUMMARY_MAX_CHARS", "summaryChars", "number", "4000"),
    ],
  },
  {
    id: "connection",
    fields: [
      field("TUI__JOIN_TIMEOUT", "joinTimeout", "number", "10"),
      field("TUI__MAX_CONNECTIONS", "maxConnections", "number", "200"),
      field("TUI__TLS_CERT_PATH", "tlsCert"),
      field("TUI__TLS_KEY_PATH", "tlsKey"),
      field("TUI__MEDIA_MAX_FILE_BYTES", "mediaMaxBytes", "number"),
      field("TUI__AUDIO_MAX_FILE_BYTES", "audioMaxBytes", "number"),
    ],
  },
]

export function validateFields(values: Record<string, string>): string | null {
  for (const f of configGroups.flatMap((group) => group.fields)) {
    const value = values[f.key]
    if (!value) continue
    if (f.kind === "number" && (!Number.isFinite(Number(value)) || Number(value) < 0)) return f.key
    if (f.kind === "boolean" && !/^(true|false|1|0|yes|no|on|off)$/i.test(value)) return f.key
    if (f.label === "baseUrl") {
      try {
        if (!["https:", "http:"].includes(new URL(value).protocol)) return f.key
      } catch {
        return f.key
      }
    }
  }
  return null
}

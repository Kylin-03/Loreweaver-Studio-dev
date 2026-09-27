import { describe, expect, it } from "vitest"
import { configValues, parseConfig, updateConfig, validateFields } from "./localConfig"

describe("local configuration editing", () => {
  it("preserves unrelated keys, comments, CRLF and suffix comments", () => {
    const source = "# operator note\r\nUNKNOWN=keep\r\nTRPG_LLM__CHAT_MODEL=old # selection\r\n"
    const result = updateConfig(source, "TRPG_LLM__CHAT_MODEL", "new")
    expect(result).toBe("# operator note\r\nUNKNOWN=keep\r\nTRPG_LLM__CHAT_MODEL='new' # selection\r\n")
  })
  it("clearing defaults removes invalid empty boolean and numeric assignments", () => {
    const source = "TRPG_SCRIBE__ENABLED=false # keep note\nUNKNOWN=1\n"
    expect(updateConfig(source, "TRPG_SCRIBE__ENABLED", "")).toBe("# keep note\nUNKNOWN=1\n")
    expect(updateConfig("UNKNOWN=1\n", "TRPG_LLM__CONTEXT_WINDOW", "")).toBe("UNKNOWN=1\n")
  })
  it("does not decode an escaped backslash twice", () => {
    expect(configValues('X="C:\\\\new"').X).toBe("C:\\new")
  })
  it("round trips Windows paths and apostrophes", () => {
    const value = "D:\\玩家's\\data"
    expect(configValues(updateConfig("", "VALUE", value)).VALUE).toBe(value)
  })
  it("keeps hash characters in secrets and handles multiline unknown values", () => {
    const source = "SECRET='abc#123'\nUNKNOWN=\"line1\nline2\"\nX=old\n"
    expect(configValues(source)).toEqual({ SECRET: "abc#123", UNKNOWN: "line1\nline2", X: "old" })
    expect(updateConfig(source, "X", "new")).toContain('UNKNOWN="line1\nline2"\n')
  })
  it("rejects ambiguous duplicate keys and unterminated quotes", () => {
    expect(() => parseConfig("X=1\nX=2")).toThrow("config_syntax")
    expect(() => parseConfig("SECRET='private")).toThrow("config_syntax")
  })
  it("does not let a form value inject another assignment", () => {
    expect(() => updateConfig("", "A", "x\nOTHER=1")).toThrow("config_syntax")
  })
  it("validates numeric, boolean and endpoint input without echoing values", () => {
    expect(validateFields({ TRPG_LLM__BASE_URL: "private-invalid" })).toBe("TRPG_LLM__BASE_URL")
    expect(validateFields({ TRPG_LLM__CONTEXT_WINDOW: "-1" })).toBe("TRPG_LLM__CONTEXT_WINDOW")
    expect(validateFields({ TRPG_SCRIBE__ENABLED: "maybe" })).toBe("TRPG_SCRIBE__ENABLED")
    expect(
      validateFields({ TRPG_LLM__BASE_URL: "https://example.test/v1", TRPG_LLM__CONTEXT_WINDOW: "0" }),
    ).toBe(null)
  })
})

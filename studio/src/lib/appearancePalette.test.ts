import { describe, expect, it } from "vitest"
import { contrastRatio, paletteFromPixels } from "./appearancePalette"
describe("image palettes", () => {
  it("keeps foreground and accent readable across extreme image colors", () => {
    for (const color of [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [0, 0, 255],
      [0, 255, 0],
    ]) {
      const palette = paletteFromPixels([...color, 255])
      expect(contrastRatio(palette.backgroundColor, palette.textColor)).toBeGreaterThan(7)
      expect(contrastRatio(palette.backgroundColor, palette.accentColor)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it("ignores transparent pixels and resolves ties deterministically", () => {
    expect(paletteFromPixels([255, 0, 0, 0])).toEqual(paletteFromPixels([]))
    const red = [255, 0, 0, 255]
    const blue = [0, 0, 255, 255]
    expect(paletteFromPixels([...red, ...blue])).toEqual(paletteFromPixels([...blue, ...red]))
    expect(paletteFromPixels([...red, ...red, ...blue])).toEqual(paletteFromPixels(red))
  })
})

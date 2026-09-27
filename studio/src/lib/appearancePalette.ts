/** A small, deterministic palette: muted image hue, dark panels and readable ink. */
export interface ImagePalette {
  backgroundColor: string
  textColor: string
  accentColor: string
}
type RGB = [number, number, number]
const hex = (rgb: RGB) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`
const mix = (a: RGB, b: RGB, amount: number): RGB => a.map((v, i) => v * (1 - amount) + b[i] * amount) as RGB
const luminance = (rgb: RGB) =>
  rgb
    .map((v) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
export function contrastRatio(a: string, b: string): number {
  const rgb = (value: string): RGB => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as RGB
  const x = luminance(rgb(a))
  const y = luminance(rgb(b))
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
export function paletteFromPixels(pixels: ArrayLike<number>): ImagePalette {
  // Quantized buckets prevent a few bright details from dominating the entire UI.
  const buckets = new Map<number, { count: number; rgb: RGB }>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const rgb: RGB = [pixels[i], pixels[i + 1], pixels[i + 2]]
    const key = (rgb[0] >> 5) * 64 + (rgb[1] >> 5) * 8 + (rgb[2] >> 5)
    const bucket = buckets.get(key) ?? { count: 0, rgb: [0, 0, 0] }
    bucket.count += 1
    bucket.rgb = bucket.rgb.map((v, j) => v + rgb[j]) as RGB
    buckets.set(key, bucket)
  }
  const dominant = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0])[0]?.[1]
  const source: RGB = dominant ? (dominant.rgb.map((v) => v / dominant.count) as RGB) : [110, 130, 125]
  const muted = mix(source, [112, 112, 112], 0.65)
  const panel = mix(muted, [20, 22, 23], 0.9)
  let accent = mix(muted, [235, 238, 237], 0.42)
  while ((luminance(accent) + 0.05) / (luminance(panel) + 0.05) < 4.5)
    accent = mix(accent, [255, 255, 255], 0.1)
  return { backgroundColor: hex(panel), textColor: "#eceeed", accentColor: hex(accent) }
}
export function extractImagePalette(dataUrl: string): Promise<ImagePalette> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = 48
        canvas.height = 48
        const context = canvas.getContext("2d")
        if (!context) throw new Error("appearance.paletteFailed")
        context.drawImage(image, 0, 0, 48, 48)
        resolve(paletteFromPixels(context.getImageData(0, 0, 48, 48).data))
      } catch {
        reject(new Error("appearance.paletteFailed"))
      }
    }
    image.onerror = () => reject(new Error("appearance.invalidImage"))
    image.src = dataUrl
  })
}

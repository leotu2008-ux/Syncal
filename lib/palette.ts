export const PALETTE = [
  { name: "Cobalt", value: "#2f6fed" },
  { name: "Rose", value: "#e0457b" },
  { name: "Teal", value: "#12917f" },
  { name: "Amber", value: "#d4861c" },
  { name: "Violet", value: "#7a4dd8" },
  { name: "Tomato", value: "#e0533d" },
  { name: "Moss", value: "#5b8c2a" },
  { name: "Slate", value: "#58627a" },
] as const;

/** First palette color nobody else has picked. */
export function pickDefaultColor(taken: string[]): string {
  return (
    PALETTE.find((c) => !taken.includes(c.value))?.value ?? PALETTE[0].value
  );
}

export function isPaletteColor(value: string): boolean {
  return PALETTE.some((c) => c.value === value);
}

/** Any "#rrggbb" color. */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export type Rgb = { r: number; g: number; b: number };
/** Hue 0–360, saturation and value 0–1. */
export type Hsv = { h: number; s: number; v: number };

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}

/** Rough perceptual distance between two colors (0 = same, about 765 = black vs white). */
export function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  // Weighted toward green, which the eye is most sensitive to.
  return Math.sqrt(2 * (x.r - y.r) ** 2 + 4 * (x.g - y.g) ** 2 + 3 * (x.b - y.b) ** 2);
}

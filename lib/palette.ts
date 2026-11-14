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

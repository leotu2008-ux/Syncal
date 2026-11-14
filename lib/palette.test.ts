import { describe, expect, it } from "vitest";
import { colorDistance, hexToRgb, hsvToRgb, isHexColor, rgbToHex, rgbToHsv } from "./palette";

describe("color math", () => {
  it("validates hex colors", () => {
    expect(isHexColor("#2f6fed")).toBe(true);
    expect(isHexColor("#2F6FED")).toBe(true);
    expect(isHexColor("2f6fed")).toBe(false);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("red")).toBe(false);
  });

  it("round-trips hex -> rgb -> hsv -> rgb -> hex", () => {
    for (const hex of ["#2f6fed", "#e0457b", "#000000", "#ffffff", "#12917f", "#808080"]) {
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex);
    }
  });

  it("knows pure hues", () => {
    expect(rgbToHex(hsvToRgb({ h: 0, s: 1, v: 1 }))).toBe("#ff0000");
    expect(rgbToHex(hsvToRgb({ h: 120, s: 1, v: 1 }))).toBe("#00ff00");
    expect(rgbToHex(hsvToRgb({ h: 240, s: 1, v: 1 }))).toBe("#0000ff");
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBe(240);
  });

  it("measures how close two colors are", () => {
    expect(colorDistance("#2f6fed", "#2f6fed")).toBe(0);
    expect(colorDistance("#2f6fed", "#3070ee")).toBeLessThan(10);
    expect(colorDistance("#000000", "#ffffff")).toBeGreaterThan(700);
  });
});

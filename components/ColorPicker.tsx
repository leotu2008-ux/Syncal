"use client";

import { useRef, useState } from "react";
import {
  colorDistance,
  hexToRgb,
  hsvToRgb,
  isHexColor,
  PALETTE,
  rgbToHex,
  rgbToHsv,
  type Hsv,
  type Rgb,
} from "@/lib/palette";

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/**
 * Pick any color: drag on the shade square (left–right saturation, top–bottom
 * brightness) and the hue bar, type a hex code or R/G/B values, or tap a preset.
 * The chosen color is submitted as a hidden `name` field.
 */
export default function ColorPicker({
  name,
  defaultValue,
  partner,
}: {
  name: string;
  defaultValue: string;
  /** The other person's name and color, to warn when the two look alike. */
  partner?: { name: string; color: string };
}) {
  const [hsv, setHsv] = useState<Hsv>(() =>
    rgbToHsv(hexToRgb(isHexColor(defaultValue) ? defaultValue : PALETTE[0].value)),
  );
  // What's in the hex box while typing, before it's a complete color.
  const [hexDraft, setHexDraft] = useState<string | null>(null);

  const rgb = hsvToRgb(hsv);
  const hex = rgbToHex(rgb);
  const pureHue = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const tooClose = partner && colorDistance(hex, partner.color) < 60;

  const setHex = (value: string) => {
    // Keep the hue when picking a gray, so the square doesn't jump to red.
    const next = rgbToHsv(hexToRgb(value));
    setHsv(next.s === 0 || next.v === 0 ? { ...next, h: hsv.h } : next);
  };
  const setRgb = (part: keyof Rgb, value: number) => {
    setHex(rgbToHex({ ...hsvToRgb(hsv), [part]: clamp(value, 0, 255) }));
  };

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name={name} value={hex} />

      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="size-12 shrink-0 rounded-full ring-2 ring-line"
          style={{ background: hex }}
        />
        <div className="text-sm">
          <div className="font-semibold">Your color</div>
          <div className="text-muted">Drag in the square and the rainbow bar.</div>
        </div>
      </div>

      <ShadeSquare hsv={hsv} pureHue={pureHue} onChange={setHsv} />
      <HueBar hue={hsv.h} onChange={(h) => setHsv({ ...hsv, h })} />

      <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
          Hex
          <input
            value={hexDraft ?? hex}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const v = raw.startsWith("#") ? raw : `#${raw}`;
              setHexDraft(e.target.value);
              if (isHexColor(v)) setHex(v.toLowerCase());
            }}
            onBlur={() => setHexDraft(null)}
            spellCheck={false}
            autoCapitalize="off"
            maxLength={7}
            className="h-10 min-w-0 rounded-lg border border-line bg-surface px-2 font-mono text-sm font-normal"
          />
        </label>
        {(["r", "g", "b"] as const).map((part) => (
          <label key={part} className="flex min-w-0 flex-col gap-1 text-xs font-semibold uppercase">
            {part}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={255}
              value={Math.round(rgb[part])}
              onChange={(e) => setRgb(part, Number(e.target.value) || 0)}
              className="h-10 min-w-0 rounded-lg border border-line bg-surface px-2 text-sm font-normal tabular-nums"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Preset colors">
        {PALETTE.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            aria-label={c.name}
            onClick={() => setHex(c.value)}
            className={`size-8 rounded-full ring-offset-2 ring-offset-bg ${hex === c.value ? "ring-2 ring-ink" : ""}`}
            style={{ background: c.value }}
          />
        ))}
      </div>

      {tooClose && (
        <p role="status" className="text-sm">
          That&apos;s very close to {partner.name}&apos;s color, so your events will be hard to tell
          apart.
        </p>
      )}
    </div>
  );
}

/** Calls `onMove` with the pointer's position inside the element (0–1 each way) while dragging. */
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onMove(clamp((e.clientX - box.left) / box.width), clamp((e.clientY - box.top) / box.height));
  };
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      move(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
    },
  };
}

function ShadeSquare({
  hsv,
  pureHue,
  onChange,
}: {
  hsv: Hsv;
  pureHue: string;
  onChange: (hsv: Hsv) => void;
}) {
  const drag = useDrag((x, y) => onChange({ ...hsv, s: x, v: 1 - y }));
  const nudge = (ds: number, dv: number) =>
    onChange({ ...hsv, s: clamp(hsv.s + ds), v: clamp(hsv.v + dv) });
  return (
    <div
      {...drag}
      role="slider"
      tabIndex={0}
      aria-label="Shade: left and right for how vivid, up and down for how bright"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s * 100)}
      aria-valuetext={`${Math.round(hsv.s * 100)}% vivid, ${Math.round(hsv.v * 100)}% bright`}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        const keys: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, step],
          ArrowDown: [0, -step],
        };
        if (!keys[e.key]) return;
        e.preventDefault();
        nudge(...keys[e.key]);
      }}
      className="relative h-44 cursor-crosshair touch-none rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pureHue})`,
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4),0_1px_4px_rgba(0,0,0,.4)]"
        style={{
          left: `${hsv.s * 100}%`,
          top: `${(1 - hsv.v) * 100}%`,
          background: rgbToHex(hsvToRgb(hsv)),
        }}
      />
    </div>
  );
}

function HueBar({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const drag = useDrag((x) => onChange(Math.min(359.9, x * 360)));
  return (
    <div
      {...drag}
      role="slider"
      tabIndex={0}
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hue)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 15 : 3;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange((hue - step + 360) % 360);
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange((hue + step) % 360);
        else return;
        e.preventDefault();
      }}
      className="relative h-6 cursor-pointer touch-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      style={{
        background:
          "linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)",
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4),0_1px_4px_rgba(0,0,0,.4)]"
        style={{ left: `${(hue / 360) * 100}%`, background: rgbToHex(hsvToRgb({ h: hue, s: 1, v: 1 })) }}
      />
    </div>
  );
}

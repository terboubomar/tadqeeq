import type { CSSProperties, ReactNode } from "react";

/** Shared drawing kit for the films: every frame is a pure function of time `t` (seconds). */

export type FilmFormat = "wide" | "tall";
export const FILM_SIZE: Record<FilmFormat, { width: number; height: number }> = {
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 },
};

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const easeInOut = (x: number) => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
/** 0→1 over [start, start+duration]. */
export const span = (t: number, start: number, duration: number) => easeOut((t - start) / duration);
/** Visibility of a scene with fade in/out. */
export const scene = (t: number, start: number, end: number, fade = 0.45) => clamp(Math.min((t - start) / fade, (end - t) / fade));

export const nf = (value: number) => Math.round(value).toLocaleString("en-US");

export const C = {
  ink: "oklch(0.22 0.027 218)",
  ink2: "oklch(0.29 0.029 218)",
  cream: "oklch(0.965 0.013 87)",
  creamMuted: "oklch(0.78 0.018 210)",
  gold: "oklch(0.66 0.13 70)",
  goldText: "oklch(0.49 0.10 66)",
  red: "oklch(0.52 0.16 31)",
  green: "oklch(0.55 0.12 155)",
  card: "oklch(0.995 0.004 87)",
  border: "oklch(0.88 0.015 85)",
};

export const DISPLAY_FONT = '"Noto Kufi Arabic", sans-serif';

export function Rise({ t, at, children, style, distance = 40 }: { t: number; at: number; children: ReactNode; style?: CSSProperties; distance?: number }) {
  const p = span(t, at, 0.7);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * distance}px)`, ...style }}>{children}</div>;
}

export function Counter({ t, at, value, duration = 1.4, suffix }: { t: number; at: number; value: number; duration?: number; suffix?: string }) {
  const p = easeInOut((t - at) / duration);
  return (
    <span dir="ltr" style={{ fontVariantNumeric: "tabular-nums", unicodeBidi: "isolate" }}>
      {nf(value * p)}
      {suffix ? <span style={{ fontSize: "0.45em", fontWeight: 600, marginInlineStart: "0.25em" }}>{suffix}</span> : null}
    </span>
  );
}

export function Eyebrow({ children, color = C.gold }: { children: ReactNode; color?: string }) {
  return <p style={{ color, fontSize: 30, fontWeight: 700, letterSpacing: 0 }}>{children}</p>;
}

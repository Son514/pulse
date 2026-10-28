// Shared "signal" palette. Strangers get a stable colour derived from their
// session id; the palette is constrained so the map stays cohesive at night.

const SIGNAL_COLORS = [
  "#5eead4", // aqua
  "#7dd3fc", // sky
  "#a78bfa", // violet
  "#bef264", // lime
  "#fda4af", // rose
  "#f0abfc", // orchid
];

export const SELF_COLOR = "#fbbf24"; // solar amber — only ever the user themself

export function dotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return SIGNAL_COLORS[Math.abs(hash) % SIGNAL_COLORS.length];
}

// `#rrggbb` -> `rgb(r g b / alpha)` for inline accents in React styles.
export function alpha(hex: string, value: number): string {
  const int = parseInt(hex.slice(1), 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgb(${r} ${g} ${b} / ${value})`;
}

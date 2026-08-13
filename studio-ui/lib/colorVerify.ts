import type { Theme } from "@sitehie/core/domain";

export type ColorFlag = {
  key: string;
  label: string;
  color: string;
  nearest: string;
  distance: number;
};

/** Parse a hex color string (#RGB, #RRGGBB, or #RRGGBBAA) to [r, g, b]. */
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "");
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return null;
  }
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return [r, g, b];
}

/** Parse any CSS color value to hex. Supports hex, rgb(), rgba(). Returns null if unparseable. */
export function toHex(color: string): string | null {
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    // Normalise to 6-digit hex — alpha channel is intentionally stripped
    // (theme verification only needs color identity, not transparency).
    const clean = trimmed.replace(/^#/, "");
    if (clean.length === 3) {
      return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    }
    if (clean.length === 4) {
      return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    }
    return `#${clean.slice(0, 6)}`;
  }
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return null;
}

/** Euclidean distance in RGB space between two hex colors. 0 = identical, 441.67 = max.
 *  Note: RGB Euclidean doesn't match human perception. For more accurate "nearest
 *  color" matching, OKLAB or OKLCH distance would be better, but RGB is sufficient
 *  for palette enforcement where colors are typically close. */
export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Infinity;
  const dr = ra[0] - rb[0];
  const dg = ra[1] - rb[1];
  const db = ra[2] - rb[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Find the nearest color in the palette to the given color. */
export function nearestPaletteColor(color: string, palette: string[]): string | null {
  if (!palette.length) return null;
  let best = palette[0];
  let bestDist = Infinity;
  for (const p of palette) {
    const d = colorDistance(color, p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/** Check if a color value is in the allowed palette (exact hex match after normalisation). */
function isColorAllowed(color: string, palette: string[]): boolean {
  const hex = toHex(color);
  if (!hex) return true; // can't parse, skip
  const normalised = palette.map((p) => toHex(p)).filter(Boolean) as string[];
  return normalised.includes(hex);
}

const COLOR_LABELS: Record<string, string> = {
  background: "Background",
  primary: "Primary",
  secondary: "Secondary",
  textPrimary: "Text primary",
  textSecondary: "Text secondary",
  codeBackground: "Code background",
  highlightMarker: "Highlight marker",
  codeText: "Code text",
  border: "Border",
  progressTrack: "Progress track",
  progressFill: "Progress fill",
  badgeBackground: "Badge background",
  badgeText: "Badge text",
  cyanWord: "Cyan word",
  annotationBg: "Annotation bg",
  annotationText: "Annotation text",
  iconFrame: "Icon frame",
  surface: "Surface",
  shadow: "Shadow",
};

/**
 * Verify all theme colors against the allowed palette.
 * Returns an array of flagged colors with their nearest palette match.
 */
export function verifyColors(theme: Theme): ColorFlag[] {
  const palette = theme.allowedColors;
  if (!palette || palette.length === 0) return [];

  const flags: ColorFlag[] = [];

  for (const [key, value] of Object.entries(theme.colors)) {
    if (!isColorAllowed(value, palette)) {
      const nearest = nearestPaletteColor(value, palette);
      flags.push({
        key,
        label: COLOR_LABELS[key] || key,
        color: value,
        nearest: nearest || value,
        distance: nearest ? colorDistance(value, nearest) : 0,
      });
    }
  }

  return flags;
}

/**
 * Auto-fix: snap all flagged colors to their nearest palette color.
 * Returns a new colors object with fixes applied.
 */
export function autoFixColors(
  theme: Theme,
  flags: ColorFlag[]
): Record<string, string> {
  const next = { ...theme.colors };
  for (const flag of flags) {
    next[flag.key] = flag.nearest;
  }
  return next;
}

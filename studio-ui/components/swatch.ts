import type { CSSProperties } from "react";

/**
 * Data-driven color swatches carry runtime hex values from real theme content,
 * so they cannot be static classes. This helper binds exactly one CSS custom
 * property (`--swatch`) to the element; every actual visual rule (shape, size,
 * border, radius, fill) lives in globals.css as a class that consumes
 * `background: var(--swatch)`. Layout/decorative values never belong inline.
 */
export function swatch(value?: string): CSSProperties | undefined {
  return value ? ({ ["--swatch"]: value } as CSSProperties) : undefined;
}
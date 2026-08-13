import type { TypographyStyle } from "./theme.js";

/**
 * Optional, partial, additive style overrides that can be attached to a single
 * slide. Every field is optional; omitted fields fall back to the theme default.
 */
export type StyleOverride = {
  /** Per-slide color overrides, e.g. `{ "primary": "#ff0000" }`. */
  colors?: Record<string, string>;
  /** Per-slide typography overrides keyed by typography token. */
  typography?: Record<string, Partial<TypographyStyle>>;
  /** Per-slide layout overrides keyed by slide section. */
  layout?: Record<string, Record<string, unknown>>;
  /** Per-slide effect overrides. */
  effects?: Record<string, unknown>;
};

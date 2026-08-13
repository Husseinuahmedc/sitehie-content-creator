import type { Slide } from "../domain/slide.js";
import type { Theme, TypographyStyle } from "../domain/theme.js";
import type { StyleOverride } from "../domain/style-override.js";
import type { ResolvedStyle } from "./resolved-style.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(target[key])) {
      deepMerge(target[key] as Record<string, unknown>, value);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (target as any)[key] = value;
    }
  }
  return target;
}

function applyStyleOverrides(theme: Theme, overrides: StyleOverride | undefined): void {
  if (!overrides) return;

  if (overrides.colors) {
    theme.colors = { ...theme.colors, ...overrides.colors };
  }

  if (overrides.typography) {
    for (const [key, patch] of Object.entries(overrides.typography)) {
      if (!theme.typography[key]) theme.typography[key] = {};
      deepMerge(theme.typography[key] as Record<string, unknown>, { ...patch });
    }
  }

  if (overrides.layout) {
    for (const [key, patch] of Object.entries(overrides.layout)) {
      if (!theme.layout[key as keyof Theme["layout"]]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (theme.layout as any)[key] = {};
      }
      deepMerge(
        theme.layout[key as keyof Theme["layout"]] as Record<string, unknown>,
        { ...patch }
      );
    }
  }

  if (overrides.effects) {
    theme.effects = { ...theme.effects, ...overrides.effects };
  }
}

function applyFontSizes(theme: Theme, fontSizes: Record<string, number> | undefined): void {
  if (!fontSizes) return;
  for (const [key, size] of Object.entries(fontSizes)) {
    if (typeof size !== "number" || !Number.isFinite(size)) continue;
    if (!theme.typography[key]) theme.typography[key] = {};
    // The rendering pipeline reads `fontSizeMax ?? fontSize` for the displayed
    // size. Setting fontSizeMax makes the flat legacy override win regardless
    // of whether the theme uses fontSize or fontSizeMax as its canonical size.
    (theme.typography[key] as TypographyStyle).fontSizeMax = size;
  }
}

// Default values copied from packages/render-engine/css-variables.ts.
// These are the exact fallbacks the renderer used when a property was missing,
// so filling them here lets the renderer read resolved values directly.
const DEFAULT_TYPOGRAPHY_SIZE = 24;

const DEFAULT_LAYOUT = {
  quoteSlide: {
    textAlign: "right",
    direction: "rtl",
    highlightUnderlineThickness: 6,
    highlightUnderlineOffset: 4,
    paragraphSpacing: "24px",
  },
  codeSlide: {
    codeBlockBorderRadius: 16,
    codeBlockPadding: "24px",
    progressBarHeight: 4,
    progressBarWidth: "100%",
    slideNumberBorderRadius: 8,
    slideNumberPadding: "6px 12px",
    explanationAlign: "right",
    explanationDirection: "rtl",
    annotationGap: 12,
  },
  coverSlide: {
    iconSize: "40%",
    iconFrameWidth: 3,
    iconFrameRadius: 24,
    iconFramePadding: "24px",
    titleAlign: "center",
    titleDirection: "rtl",
    logoHeight: "auto",
  },
  outroSlide: {
    questionAlign: "center",
    questionDirection: "rtl",
    brandGap: "14px",
    ctaRadius: 999,
    ctaPadding: "14px 32px",
  },
  comparisonSlide: {
    gap: "24px",
    panelRadius: 24,
    panelPadding: "32px",
    titleAlign: "center",
    titleDirection: "rtl",
  },
  statSlide: {
    align: "center",
    direction: "rtl",
  },
} as const;

const TYPOGRAPHY_TOKENS = [
  "quoteSlide",
  "codeSlideTitle",
  "codeSlideSubtitle",
  "codeSlideCode",
  "codeSlideExplanation",
  "codeSlideNumber",
  "codeSlideFooter",
  "codeSlideAnnotation",
  "coverSlideTitle",
  "coverSlideSeries",
  "coverSlideHint",
  "outroSlideQuestion",
  "outroSlideHandle",
  "outroSlideCta",
  "comparisonSlideTitle",
  "comparisonSlideBody",
  "comparisonSlideLabel",
  "statSlideValue",
  "statSlideLabel",
  "statSlideSubtext",
] as const;

function fillTypographyDefaults(theme: Theme): void {
  for (const token of TYPOGRAPHY_TOKENS) {
    const style = theme.typography[token];
    if (!style) {
      // Do not create new tokens: the renderer skips tokens that have no
      // fontFamily, so adding empty defaults would not change output. Keeping
      // them absent preserves the original resolved shape for sparse themes.
      continue;
    }

    const fontSize = style.fontSize;
    const fontSizeMax = style.fontSizeMax;

    if (fontSizeMax == null && fontSize == null) {
      (style as TypographyStyle).fontSizeMax = DEFAULT_TYPOGRAPHY_SIZE;
      (style as TypographyStyle).fontSize = DEFAULT_TYPOGRAPHY_SIZE;
    } else if (fontSizeMax == null) {
      (style as TypographyStyle).fontSizeMax = fontSize;
    } else if (fontSize == null) {
      (style as TypographyStyle).fontSize = fontSizeMax;
    }
  }
}

function fillLayoutDefaults(theme: Theme): void {
  for (const [section, defaults] of Object.entries(DEFAULT_LAYOUT)) {
    const key = section as keyof Theme["layout"];
    if (!theme.layout[key]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (theme.layout as any)[key] = {};
    }
    const target = theme.layout[key] as Record<string, unknown>;
    for (const [prop, defaultValue] of Object.entries(defaults)) {
      if (target[prop] == null) {
        target[prop] = defaultValue;
      }
    }
  }
}

/**
 * Compute the definitive style for a single slide.
 *
 * Resolution order (last write wins):
 * 1. Theme defaults
 * 2. `slide.styleOverrides` (deep-merged by section: colors, typography, layout, effects)
 * 3. `slide.fontSizes` (legacy flat override, folded into typography.fontSizeMax)
 * 4. Architecture-approved defaults for any remaining optional layout or
 *    typography properties
 *
 * The function is pure, synchronous, and requires no I/O or framework imports.
 */
export function resolveSlideStyle(theme: Theme, slide: Slide): ResolvedStyle {
  const resolved = structuredClone(theme) as Theme;

  applyStyleOverrides(resolved, slide.styleOverrides);
  applyFontSizes(resolved, slide.fontSizes);
  fillTypographyDefaults(resolved);
  fillLayoutDefaults(resolved);

  return resolved;
}

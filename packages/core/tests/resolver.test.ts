import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveSlideStyle } from "../resolver/index.js";
import { loadTheme, loadEpisode, listThemeNames } from "./fixtures.js";
import type { Slide, Theme, Episode, TypographyStyle } from "../domain/index.js";
import type { StyleOverride } from "../domain/style-override.js";

async function theme(name: string): Promise<Theme> {
  return (await loadTheme(name)) as Theme;
}

const SLIDE_TYPES: Slide["type"][] = ["cover", "quote", "code", "outro", "comparison", "stat"];

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

function applyStyleOverridesLegacy(theme: Theme, overrides: StyleOverride | undefined): void {
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
      deepMerge(theme.layout[key as keyof Theme["layout"]] as Record<string, unknown>, { ...patch });
    }
  }

  if (overrides.effects) {
    theme.effects = { ...theme.effects, ...overrides.effects };
  }
}

function applyFontSizesLegacy(theme: Theme, fontSizes: Record<string, number> | undefined): void {
  if (!fontSizes) return;
  for (const [key, size] of Object.entries(fontSizes)) {
    if (typeof size !== "number" || !Number.isFinite(size)) continue;
    if (!theme.typography[key]) theme.typography[key] = {};
    (theme.typography[key] as TypographyStyle).fontSizeMax = size;
  }
}

/**
 * Mimic the old resolver (deep-merge overrides + fontSizes, but no defaults).
 */
function legacyResolveSlideStyle(theme: Theme, slide: Slide): Theme {
  const resolved = structuredClone(theme);
  applyStyleOverridesLegacy(resolved, slide.styleOverrides);
  applyFontSizesLegacy(resolved, slide.fontSizes);
  return resolved;
}

/**
 * Apply the exact fallback expressions that packages/render-engine/css-variables.ts
 * used before core-agent filled defaults. If the resolver is correct, calling this
 * on the old-resolver output should produce the same CSS-relevant shape as the
 * new resolver output.
 */
function applyCssFallbacks(style: Theme): void {
  const q = (style.layout.quoteSlide ??= {});
  q.textAlign ??= "right";
  q.direction ??= "rtl";
  q.highlightUnderlineThickness ??= 6;
  q.highlightUnderlineOffset ??= 4;
  q.paragraphSpacing ??= "24px";

  const c = (style.layout.codeSlide ??= {});
  c.codeBlockBorderRadius ??= 16;
  c.codeBlockPadding ??= "24px";
  c.progressBarHeight ??= 4;
  c.progressBarWidth ??= "100%";
  c.slideNumberBorderRadius ??= 8;
  c.slideNumberPadding ??= "6px 12px";
  c.explanationAlign ??= "right";
  c.explanationDirection ??= "rtl";
  c.annotationGap ??= 12;

  const cov = (style.layout.coverSlide ??= {});
  cov.iconSize ??= "40%";
  cov.iconFrameWidth ??= 3;
  cov.iconFrameRadius ??= 24;
  cov.iconFramePadding ??= "24px";
  cov.titleAlign ??= "center";
  cov.titleDirection ??= "rtl";
  cov.logoHeight ??= "auto";

  const o = (style.layout.outroSlide ??= {});
  o.questionAlign ??= "center";
  o.questionDirection ??= "rtl";
  o.brandGap ??= "14px";
  o.ctaRadius ??= 999;
  o.ctaPadding ??= "14px 32px";

  const cmp = (style.layout.comparisonSlide ??= {});
  cmp.gap ??= "24px";
  cmp.panelRadius ??= 24;
  cmp.panelPadding ??= "32px";
  cmp.titleAlign ??= "center";
  cmp.titleDirection ??= "rtl";

  const st = (style.layout.statSlide ??= {});
  st.align ??= "center";
  st.direction ??= "rtl";

  for (const token of TYPOGRAPHY_TOKENS) {
    const t = style.typography[token];
    if (!t) continue;
    if (t.fontSizeMax == null && t.fontSize == null) {
      t.fontSizeMax = 24;
      t.fontSize = 24;
    } else if (t.fontSizeMax == null) {
      t.fontSizeMax = t.fontSize;
    } else if (t.fontSize == null) {
      t.fontSize = t.fontSizeMax;
    }
  }
}

describe("resolveSlideStyle", async () => {
  const defaultTheme = await theme("default");

  it("with no overrides returns theme defaults", () => {
    const slide: Slide = { type: "code" };
    const resolved = resolveSlideStyle(defaultTheme, slide);
    assert.strictEqual(resolved.colors.background, defaultTheme.colors.background);
    assert.strictEqual(
      resolved.typography.codeSlideCode.fontSize,
      defaultTheme.typography.codeSlideCode.fontSize
    );
    assert.strictEqual(
      resolved.layout.codeSlide!.codeBlockBorderRadius,
      defaultTheme.layout.codeSlide!.codeBlockBorderRadius
    );
  });

  it("with styleOverrides deep-merges typography", () => {
    const slide: Slide = {
      type: "code",
      styleOverrides: {
        typography: {
          codeSlideCode: { fontSize: 14 },
        },
      },
    };
    const resolved = resolveSlideStyle(defaultTheme, slide);
    assert.strictEqual(resolved.typography.codeSlideCode.fontSize, 14);
    // Other typography fields remain unchanged.
    assert.strictEqual(
      resolved.typography.codeSlideCode.fontFamily,
      defaultTheme.typography.codeSlideCode.fontFamily
    );
  });

  it("with styleOverrides deep-merges layout", () => {
    const slide: Slide = {
      type: "code",
      styleOverrides: {
        layout: {
          codeSlide: {
            codeBlockBorderRadius: 99,
          },
        },
      },
    };
    const resolved = resolveSlideStyle(defaultTheme, slide);
    assert.strictEqual(resolved.layout.codeSlide!.codeBlockBorderRadius, 99);
    assert.strictEqual(
      resolved.layout.codeSlide!.codeBlockPadding,
      defaultTheme.layout.codeSlide!.codeBlockPadding
    );
  });

  it("with styleOverrides deep-merges colors", () => {
    const slide: Slide = {
      type: "quote",
      styleOverrides: {
        colors: { primary: "#ff0000" },
      },
    };
    const resolved = resolveSlideStyle(defaultTheme, slide);
    assert.strictEqual(resolved.colors.primary, "#ff0000");
    assert.strictEqual(resolved.colors.background, defaultTheme.colors.background);
  });

  it("legacy fontSizes override wins over theme and styleOverrides", () => {
    const slide: Slide = {
      type: "code",
      styleOverrides: {
        typography: {
          codeSlideCode: { fontSizeMax: 12 },
        },
      },
      fontSizes: {
        codeSlideCode: 36,
      },
    };
    const resolved = resolveSlideStyle(defaultTheme, slide);
    assert.strictEqual(resolved.typography.codeSlideCode.fontSizeMax, 36);
  });

  it("handles a slide with all optional fields missing", () => {
    const slide: Slide = { type: "stat" };
    const resolved = resolveSlideStyle(defaultTheme, slide);
    assert.strictEqual(resolved.typography.statSlideValue.fontSizeMax, 180);
  });

  it("does not mutate the input theme", () => {
    const original = structuredClone(defaultTheme);
    const slide: Slide = {
      type: "code",
      styleOverrides: {
        colors: { primary: "#bad" },
      },
    };
    resolveSlideStyle(defaultTheme, slide);
    assert.deepStrictEqual(defaultTheme, original);
  });

  it("handles partial styleOverrides without crashing", () => {
    const slide: Slide = {
      type: "cover",
      styleOverrides: {},
    };
    const resolved = resolveSlideStyle(defaultTheme, slide);
    assert.strictEqual(resolved.typography.coverSlideTitle.fontSizeMax, 56);
  });

  it("applies effects overrides", () => {
    const slide: Slide = {
      type: "quote",
      styleOverrides: {
        effects: { surfaceRadius: 4 },
      },
    };
    const resolved = resolveSlideStyle(defaultTheme, slide);
    assert.strictEqual(resolved.effects?.surfaceRadius, 4);
  });

  it("resolves every slide in the real jsron episode without crashing", async () => {
    const episode = (await loadEpisode("jsron")) as Episode;
    for (const slide of episode.slides) {
      const resolved = resolveSlideStyle(defaultTheme, slide);
      assert.ok(resolved.colors.background);
      assert.ok(resolved.typography);
    }
  });

  it("matches legacy resolver + CSS fallbacks for every jsron slide across all themes", async () => {
    const episode = (await loadEpisode("jsron")) as Episode;
    for (const themeName of listThemeNames()) {
      const loadedTheme = await theme(themeName);
      for (const slide of episode.slides) {
        assert.ok(SLIDE_TYPES.includes(slide.type));
        const resolved = resolveSlideStyle(loadedTheme, slide);
        const legacy = legacyResolveSlideStyle(structuredClone(loadedTheme), slide);
        applyCssFallbacks(legacy);
        assert.deepStrictEqual(
          legacy,
          resolved,
          `parity failed for theme=${themeName} slide.type=${slide.type}`
        );
      }
    }
  });
});

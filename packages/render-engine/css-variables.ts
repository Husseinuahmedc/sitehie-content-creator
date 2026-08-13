import type { ResolvedStyle } from "@sitehie/core/resolver";
import type { RenderConfig } from "./asset-loader.js";

/**
 * Build the `:root` CSS variable block for a fully resolved slide style.
 *
 * IMPORTANT: this function consumes the output of `resolveSlideStyle(theme, slide)`
 * from `@sitehie/core/resolver`. Callers must resolve per-slide style before
 * invoking the renderer; this module does not fall back to raw theme values.
 *
 * Remaining guards are only for values that `resolveSlideStyle` intentionally
 * leaves optional (effects, optional logo dimensions, CTA shadow, fonts, etc.).
 */
export function buildCssVariables(resolvedStyle: ResolvedStyle, config: RenderConfig): string {
  const lines: string[] = [];
  lines.push(`:root {`);
  lines.push(`  --slide-width: ${config.width}px;`);
  lines.push(`  --slide-height: ${config.height}px;`);

  // Instagram safe zones (UI overlays): content must stay clear of these bands.
  const sz = config.safeZones;
  lines.push(`  --safe-top: ${sz.top}px;`);
  lines.push(`  --safe-bottom: ${sz.bottom}px;`);
  lines.push(`  --safe-x: ${sz.x}px;`);

  for (const [key, value] of Object.entries(resolvedStyle.colors || {})) {
    lines.push(`  --color-${camelToKebab(key)}: ${value};`);
  }

  for (const [key, font] of Object.entries(resolvedStyle.fonts || {})) {
    if (font?.family) {
      lines.push(`  --font-${camelToKebab(key)}: ${JSON.stringify(font.family)}, sans-serif;`);
    }
  }

  const typeMap: Record<string, string> = {
    quoteSlide: "quote",
    codeSlideTitle: "code-title",
    codeSlideSubtitle: "code-subtitle",
    codeSlideCode: "code-code",
    codeSlideExplanation: "code-explanation",
    codeSlideNumber: "code-number",
    codeSlideFooter: "code-footer",
    codeSlideAnnotation: "code-annotation",
    coverSlideTitle: "cover-title",
    coverSlideSeries: "cover-series",
    coverSlideHint: "cover-hint",
    outroSlideQuestion: "outro-question",
    outroSlideHandle: "outro-handle",
    outroSlideCta: "outro-cta",
    comparisonSlideTitle: "comparison-title",
    comparisonSlideBody: "comparison-body",
    comparisonSlideLabel: "comparison-label",
    statSlideValue: "stat-value",
    statSlideLabel: "stat-label",
    statSlideSubtext: "stat-subtext",
  };

  for (const [typeKey, prefix] of Object.entries(typeMap)) {
    const t = resolvedStyle.typography[typeKey];
    if (!t) continue;
    const familyKey = t.fontFamily;
    if (!familyKey) continue;
    const family = resolvedStyle.fonts?.[familyKey]?.family || familyKey || "sans-serif";
    lines.push(`  --type-${prefix}-font-family: ${JSON.stringify(family)}, sans-serif;`);
    const size = t.fontSizeMax;
    lines.push(`  --type-${prefix}-font-size: ${size}px;`);
    if (t.fontWeight != null) lines.push(`  --type-${prefix}-font-weight: ${t.fontWeight};`);
    if (t.lineHeight != null) lines.push(`  --type-${prefix}-line-height: ${t.lineHeight};`);
    if (t.letterSpacing != null) {
      const ls = typeof t.letterSpacing === "number" ? `${t.letterSpacing}px` : t.letterSpacing;
      lines.push(`  --type-${prefix}-letter-spacing: ${ls};`);
    }
    if (t.textTransform) lines.push(`  --type-${prefix}-text-transform: ${t.textTransform};`);
  }

  const q = resolvedStyle.layout.quoteSlide!;
  lines.push(`  --layout-quote-text-align: ${q.textAlign};`);
  lines.push(`  --layout-quote-direction: ${q.direction};`);
  lines.push(`  --hl-thickness: ${q.highlightUnderlineThickness}px;`);
  lines.push(`  --hl-offset: ${q.highlightUnderlineOffset}px;`);
  const ps = q.paragraphSpacing;
  lines.push(
    `  --layout-quote-paragraph-spacing: ${typeof ps === "number" ? `${ps}px` : ps};`
  );

  const c = resolvedStyle.layout.codeSlide!;
  lines.push(`  --layout-code-block-radius: ${c.codeBlockBorderRadius}px;`);
  lines.push(`  --layout-code-block-padding: ${c.codeBlockPadding};`);
  lines.push(`  --layout-code-progress-height: ${c.progressBarHeight}px;`);
  lines.push(`  --layout-code-progress-width: ${c.progressBarWidth};`);
  lines.push(`  --layout-code-number-radius: ${c.slideNumberBorderRadius}px;`);
  lines.push(`  --layout-code-number-padding: ${c.slideNumberPadding};`);
  lines.push(`  --layout-code-explanation-align: ${c.explanationAlign};`);
  lines.push(`  --layout-code-explanation-direction: ${c.explanationDirection};`);
  lines.push(`  --layout-code-annotation-gap: ${c.annotationGap}px;`);

  const cov = resolvedStyle.layout.coverSlide!;
  lines.push(`  --layout-cover-icon-size: ${cov.iconSize};`);
  if (cov.logoWidth) {
    lines.push(`  --layout-cover-logo-width: ${cov.logoWidth};`);
    lines.push(`  --layout-cover-logo-height: ${cov.logoHeight};`);
  }
  if (cov.logoMaxHeight) {
    lines.push(`  --layout-cover-logo-max-height: ${cov.logoMaxHeight};`);
  }
  lines.push(`  --layout-cover-icon-frame-width: ${cov.iconFrameWidth}px;`);
  lines.push(`  --layout-cover-icon-frame-radius: ${cov.iconFrameRadius}px;`);
  lines.push(`  --layout-cover-icon-frame-padding: ${cov.iconFramePadding};`);
  lines.push(`  --layout-cover-title-align: ${cov.titleAlign};`);
  lines.push(`  --layout-cover-title-direction: ${cov.titleDirection};`);

  const o = resolvedStyle.layout.outroSlide!;
  lines.push(`  --layout-outro-question-align: ${o.questionAlign};`);
  lines.push(`  --layout-outro-question-direction: ${o.questionDirection};`);
  const bg = o.brandGap;
  lines.push(
    `  --layout-outro-brand-gap: ${typeof bg === "number" ? `${bg}px` : bg};`
  );
  lines.push(`  --layout-outro-cta-radius: ${o.ctaRadius}px;`);
  lines.push(`  --layout-outro-cta-padding: ${o.ctaPadding};`);
  if (o.ctaShadow) lines.push(`  --effect-outro-cta-shadow: ${o.ctaShadow};`);

  const cmp = resolvedStyle.layout.comparisonSlide!;
  const gap = cmp.gap;
  lines.push(
    `  --layout-comparison-gap: ${typeof gap === "number" ? `${gap}px` : gap};`
  );
  lines.push(`  --layout-comparison-panel-radius: ${cmp.panelRadius}px;`);
  lines.push(`  --layout-comparison-panel-padding: ${cmp.panelPadding};`);
  lines.push(`  --layout-comparison-title-align: ${cmp.titleAlign};`);
  lines.push(`  --layout-comparison-title-direction: ${cmp.titleDirection};`);

  const st = resolvedStyle.layout.statSlide!;
  lines.push(`  --layout-stat-align: ${st.align};`);
  lines.push(`  --layout-stat-direction: ${st.direction};`);

  const fx = resolvedStyle.effects || {};
  if (fx.codeBlockShadow) lines.push(`  --effect-code-block-shadow: ${fx.codeBlockShadow};`);
  if (fx.iconShadow) lines.push(`  --effect-icon-shadow: ${fx.iconShadow};`);
  if (fx.surfaceRadius != null) lines.push(`  --effect-surface-radius: ${fx.surfaceRadius}px;`);
  if (fx.clayDepth) lines.push(`  --effect-clay-depth: ${fx.clayDepth};`);
  if (resolvedStyle.colors?.highlightMarker) {
    lines.push(`  --color-highlight-marker: ${resolvedStyle.colors.highlightMarker};`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

function camelToKebab(str: string): string {
  return String(str)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

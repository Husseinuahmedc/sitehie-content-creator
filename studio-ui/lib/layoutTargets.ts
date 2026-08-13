import type { Slide, Theme } from "@sitehie/core/domain";

export type LayoutBox = {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  width?: string;
  height?: string;
  center?: boolean;
  centerX?: boolean;
  centerY?: boolean;
};

export type LayoutTarget = {
  id: string;
  label: string;
  /** CSS selector inside the slide document */
  selector: string;
  /** Path under theme.layout, e.g. ["codeSlide","titlePosition"] */
  path: string[];
  types: Slide["type"][];
  /** Allow width resize via handles */
  resizeWidth?: boolean;
  /** Allow height resize via handles */
  resizeHeight?: boolean;
  /** Cover icon size is a single % string on coverSlide.iconSize */
  resizeIconSize?: boolean;
};

/** All positionable regions across slide types */
export const LAYOUT_TARGETS: LayoutTarget[] = [
  // Quote
  {
    id: "quote.text",
    label: "Quote text",
    selector: "#quote-box",
    path: ["quoteSlide", "textPosition"],
    types: ["quote"],
    resizeWidth: true,
    resizeHeight: true,
  },
  // Code
  {
    id: "code.number",
    label: "Slide number",
    selector: "#slide-number",
    path: ["codeSlide", "slideNumberPosition"],
    types: ["code"],
  },
  {
    id: "code.title",
    label: "Title",
    selector: "#slide-title",
    path: ["codeSlide", "titlePosition"],
    types: ["code"],
    resizeWidth: true,
  },
  {
    id: "code.subtitle",
    label: "Subtitle",
    selector: "#slide-subtitle",
    path: ["codeSlide", "subtitlePosition"],
    types: ["code"],
    resizeWidth: true,
  },
  {
    id: "code.block",
    label: "Code block",
    selector: "#code-wrap",
    path: ["codeSlide", "codeBlockPosition"],
    types: ["code"],
    resizeWidth: true,
  },
  {
    id: "code.explanation",
    label: "Explanation",
    selector: "#explanation",
    path: ["codeSlide", "explanationPosition"],
    types: ["code"],
    resizeWidth: true,
    resizeHeight: true,
  },
  {
    id: "code.progress",
    label: "Progress bar",
    selector: "#progress",
    path: ["codeSlide", "progressBarPosition"],
    types: ["code"],
    resizeWidth: true,
  },
  {
    id: "code.footer",
    label: "Footer",
    selector: "#footer",
    path: ["codeSlide", "footerPosition"],
    types: ["code"],
    resizeWidth: true,
  },
  // Cover
  {
    id: "cover.series",
    label: "Series",
    selector: "#series",
    path: ["coverSlide", "seriesPosition"],
    types: ["cover"],
    resizeWidth: true,
  },
  {
    id: "cover.icon",
    label: "Icon",
    selector: "#icon-wrap",
    path: ["coverSlide", "iconPosition"],
    types: ["cover"],
    resizeIconSize: true,
  },
  {
    id: "cover.title",
    label: "Title",
    selector: "#cover-title",
    path: ["coverSlide", "titlePosition"],
    types: ["cover"],
    resizeWidth: true,
  },
  {
    id: "cover.hint",
    label: "Hint",
    selector: "#hint",
    path: ["coverSlide", "hintPosition"],
    types: ["cover"],
  },
  {
    id: "cover.badges",
    label: "Tech badges",
    selector: "#cover-tech-badges",
    path: ["coverSlide", "badgesPosition"],
    types: ["cover"],
    resizeWidth: true,
  },
  {
    id: "cover.watermark",
    label: "Watermark",
    selector: "#cover-watermark",
    path: ["coverSlide", "watermarkPosition"],
    types: ["cover"],
  },
  // Outro
  {
    id: "outro.avatar",
    label: "Avatar",
    selector: "#outro-image-wrap",
    path: ["outroSlide", "imagePosition"],
    types: ["outro"],
    resizeWidth: true,
  },
  {
    id: "outro.question",
    label: "Question",
    selector: "#outro-question",
    path: ["outroSlide", "questionPosition"],
    types: ["outro"],
    resizeWidth: true,
  },
  {
    id: "outro.badges",
    label: "Tech badges",
    selector: "#outro-tech-badges",
    path: ["outroSlide", "badgesPosition"],
    types: ["outro"],
    resizeWidth: true,
  },
  {
    id: "outro.brand",
    label: "Brand / CTA",
    selector: "#outro-brand",
    path: ["outroSlide", "brandPosition"],
    types: ["outro"],
  },
  // Comparison
  {
    id: "comparison.number",
    label: "Slide number",
    selector: "#slide-number",
    path: ["comparisonSlide", "slideNumberPosition"],
    types: ["comparison"],
  },
  {
    id: "comparison.title",
    label: "Title",
    selector: "#comparison-title",
    path: ["comparisonSlide", "titlePosition"],
    types: ["comparison"],
    resizeWidth: true,
  },
  {
    id: "comparison.panels",
    label: "Panels",
    selector: "#panels-wrap",
    path: ["comparisonSlide", "panelsPosition"],
    types: ["comparison"],
    resizeWidth: true,
    resizeHeight: true,
  },
  {
    id: "comparison.verdict",
    label: "Verdict",
    selector: "#comparison-verdict",
    path: ["comparisonSlide", "verdictPosition"],
    types: ["comparison"],
    resizeWidth: true,
  },
  {
    id: "comparison.badges",
    label: "Tech badges",
    selector: "#comparison-tech-badges",
    path: ["comparisonSlide", "badgesPosition"],
    types: ["comparison"],
    resizeWidth: true,
  },
  // Stat
  {
    id: "stat.number",
    label: "Slide number",
    selector: "#slide-number",
    path: ["statSlide", "slideNumberPosition"],
    types: ["stat"],
  },
  {
    id: "stat.value",
    label: "Metric value",
    selector: "#stat-value",
    path: ["statSlide", "valuePosition"],
    types: ["stat"],
    resizeWidth: true,
  },
  {
    id: "stat.label",
    label: "Label",
    selector: "#stat-label",
    path: ["statSlide", "labelPosition"],
    types: ["stat"],
    resizeWidth: true,
  },
  {
    id: "stat.subtext",
    label: "Subtext",
    selector: "#stat-subtext",
    path: ["statSlide", "subtextPosition"],
    types: ["stat"],
    resizeWidth: true,
  },
  {
    id: "stat.badges",
    label: "Tech badges",
    selector: "#stat-tech-badges",
    path: ["statSlide", "badgesPosition"],
    types: ["stat"],
    resizeWidth: true,
  },
  // Dynamic image targets (0-2 images per slide)
  {
    id: "slide.image.0",
    label: "Image 1",
    selector: "#slide-image-0",
    path: [],
    types: ["quote", "code", "cover", "outro", "comparison", "stat"],
    resizeWidth: true,
    resizeHeight: true,
  },
  {
    id: "slide.image.1",
    label: "Image 2",
    selector: "#slide-image-1",
    path: [],
    types: ["quote", "code", "cover", "outro", "comparison", "stat"],
    resizeWidth: true,
    resizeHeight: true,
  },
  {
    id: "slide.image.2",
    label: "Image 3",
    selector: "#slide-image-2",
    path: [],
    types: ["quote", "code", "cover", "outro", "comparison", "stat"],
    resizeWidth: true,
    resizeHeight: true,
  },
];

export function targetsForType(type: Slide["type"] | undefined): LayoutTarget[] {
  if (!type) return [];
  return LAYOUT_TARGETS.filter((t) => t.types.includes(type));
}

export function getLayoutBox(theme: Theme, path: string[]): LayoutBox {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = theme.layout;
  for (const p of path) {
    if (cur == null) return {};
    cur = cur[p];
  }
  if (cur && typeof cur === "object") return { ...cur };
  return {};
}

export function setLayoutBox(theme: Theme, path: string[], box: LayoutBox | string): Theme {
  const layout = structuredClone(theme.layout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = layout;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur[path[i]] == null || typeof cur[path[i]] !== "object") cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = box;
  return { ...theme, layout };
}

export function pct(n: number, digits = 2): string {
  const v = Math.round(n * 10 ** digits) / 10 ** digits;
  return `${v}%`;
}

export function parsePct(v: string | undefined | null): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const m = String(v).match(/^(-?[\d.]+)%$/);
  return m ? parseFloat(m[1]) : null;
}

/** Apply a layout box to a DOM element (mirrors slide-runtime applyPositions). */
export function applyBoxToElement(el: HTMLElement, box: LayoutBox) {
  el.style.position = "absolute";

  // Reset then apply so stale right/left from prior mode don't fight
  el.style.top = box.top != null ? box.top : "";
  el.style.bottom = box.bottom != null ? box.bottom : "";
  el.style.left = box.left != null ? box.left : "";
  el.style.right = box.right != null ? box.right : "";
  el.style.width = box.width != null ? box.width : "";
  el.style.height = box.height != null ? box.height : "";

  if (box.center || box.centerX) {
    el.style.left = "50%";
    el.style.right = "auto";
    el.style.transform = "translateX(-50%)";
    el.setAttribute("data-center", "true");
  } else {
    el.removeAttribute("data-center");
    el.style.transform = "";
    // If only right was set historically, keep it; otherwise prefer left
    if (box.left != null) el.style.right = "auto";
    if (box.right != null && box.left == null) el.style.left = "auto";
  }

  if (box.top != null) el.style.bottom = box.bottom != null ? box.bottom : "auto";
  if (box.bottom != null && box.top == null) el.style.top = "auto";
}

/** Measure element rect in slide-local coordinates (0..1080 / 0..1350).
 *  Hardcoded to Instagram carousel dimensions (1080x1350 px). If slide size
 *  ever becomes configurable, this function needs updating. */
export function measureInSlide(
  el: HTMLElement,
  slideEl: HTMLElement
): { x: number; y: number; w: number; h: number } {
  const er = el.getBoundingClientRect();
  const sr = slideEl.getBoundingClientRect();
  const sx = sr.width / 1080 || 1;
  const sy = sr.height / 1350 || 1;
  return {
    x: (er.left - sr.left) / sx,
    y: (er.top - sr.top) / sy,
    w: er.width / sx,
    h: er.height / sy,
  };
}

const SNAP_THRESHOLD_PX = 8; // in slide coords

export type SnapGuide = { type: "v" | "h"; pos: number }; // pos in slide px

export function snapPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  others: { x: number; y: number; w: number; h: number }[],
  threshold = SNAP_THRESHOLD_PX
): { x: number; y: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  let nx = x;
  let ny = y;

  const targetsX = [0, 1080 / 2, 1080, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const targetsY = [0, 1350 / 2, 1350, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];

  const selfX = [x, x + w / 2, x + w];
  const selfY = [y, y + h / 2, y + h];

  let bestDx = threshold + 1;
  let bestDy = threshold + 1;
  let snapX: number | null = null;
  let snapY: number | null = null;
  let guideX: number | null = null;
  let guideY: number | null = null;

  for (const sx of selfX) {
    for (const tx of targetsX) {
      const d = Math.abs(sx - tx);
      if (d < bestDx) {
        bestDx = d;
        snapX = x + (tx - sx);
        guideX = tx;
      }
    }
  }
  for (const sy of selfY) {
    for (const ty of targetsY) {
      const d = Math.abs(sy - ty);
      if (d < bestDy) {
        bestDy = d;
        snapY = y + (ty - sy);
        guideY = ty;
      }
    }
  }

  if (snapX != null && bestDx <= threshold) {
    nx = snapX;
    if (guideX != null) guides.push({ type: "v", pos: guideX });
  }
  if (snapY != null && bestDy <= threshold) {
    ny = snapY;
    if (guideY != null) guides.push({ type: "h", pos: guideY });
  }

  // Clamp inside slide
  nx = Math.max(0, Math.min(nx, 1080 - w));
  ny = Math.max(0, Math.min(ny, 1350 - h));

  return { x: nx, y: ny, guides };
}

/** Convert slide-local rect into a theme layout box (top/left/width/height %). */
export function rectToBox(
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { keepWidth?: boolean; keepHeight?: boolean; center?: boolean } = {}
): LayoutBox {
  const box: LayoutBox = {
    top: pct((y / 1350) * 100),
    left: pct((x / 1080) * 100),
  };
  if (opts.keepWidth !== false) box.width = pct((w / 1080) * 100);
  if (opts.keepHeight) box.height = pct((h / 1350) * 100);
  if (opts.center) {
    box.center = true;
    box.left = undefined;
    // top stays
  }
  return box;
}

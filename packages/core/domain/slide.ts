import type { StyleOverride } from "./style-override.js";

export type ParagraphBlock = {
  text: string;
  highlights?: string[];
  cyanWords?: string[];
};

export type SlideImage = {
  asset: string;
  top?: string;
  left?: string;
  width?: string;
  height?: string;
  scale?: number;
  zIndex?: number;
};

export type ComparisonSide = {
  label?: string;
  points?: string[];
};

export type SlideType = "cover" | "quote" | "code" | "outro" | "comparison" | "stat" | "canvas";

type SlideBase = {
  /** Existing flat per-slide font-size overrides (kept for backward compat). */
  fontSizes?: Record<string, number>;
  /** New optional structured style overrides for this slide only. */
  styleOverrides?: StyleOverride;
  techIcons?: string[];
  images?: SlideImage[];
};

export type CoverSlide = SlideBase & {
  type: "cover";
  title?: string;
  series?: string;
  iconAsset?: string;
  iconEmoji?: string;
  iconScale?: number;
  iconOffsetX?: number;
  iconOffsetY?: number;
};

export type QuoteSlide = SlideBase & {
  type: "quote";
  text?: string;
  highlights?: string[];
  cyanWords?: string[];
  paragraphs?: ParagraphBlock[];
};

export type CodeSlide = SlideBase & {
  type: "code";
  titleEn?: string;
  subtitleEn?: string;
  title?: string;
  subtitle?: string;
  code?: string;
  /** Prism language tag, e.g. "typescript", "docker", "python". Default javascript. */
  language?: string;
  /** Legacy alias sometimes written by older episodes. */
  codeLanguage?: string;
  explanation?: string;
  annotations?: { text?: string; target?: string }[];
};

export type OutroSlide = SlideBase & {
  type: "outro";
  question?: string;
  /** Call-to-action pill text (Save/Share/Follow). */
  cta?: string;
  /** Handle override; falls back to theme.brand.handle. */
  handle?: string;
  /** Avatar image asset (path or data URI). */
  imageAsset?: string;
  imagePrompt?: string;
};

export type ComparisonSlide = SlideBase & {
  type: "comparison";
  title?: string;
  sideA?: ComparisonSide;
  sideB?: ComparisonSide;
  verdict?: string;
};

export type StatSlide = SlideBase & {
  type: "stat";
  /** Massive metric, e.g. "10x", "99.9%", "1M+". */
  value?: string;
  label?: string;
  subtext?: string;
};

/** Free Canvas slide — blank frame with user-controlled shapes & vector paths. */

export type CanvasPathPoint = {
  x: number;
  y: number;
  handleIn: { x: number; y: number } | null;
  handleOut: { x: number; y: number } | null;
  corner: boolean;
};

/**
 * Layer metadata shared by every canvas item. All fields are optional so
 * episodes saved before the layers system remain valid without migration.
 */
export type LayerMeta = {
  /** Display name; defaults to one derived from type + index, e.g. "Rectangle 1". */
  name?: string;
  /** Default true. Hidden items are skipped by both editor and export rendering. */
  visible?: boolean;
  /** Default false. Locked items cannot be selected or transformed on canvas. */
  locked?: boolean;
  /** Group membership: id of the parent CanvasGroup, or null/undefined. */
  parentId?: string | null;
};

/**
 * Group record: pure metadata (no geometry). Lives in `CanvasSlide.groups`;
 * members reference it via `parentId`. Z-order is derived from member
 * positions — members are kept contiguous in `CanvasSlide.objects`, so the
 * linear export render loop produces correct stacking unchanged.
 */
export type CanvasGroup = {
  id: string;
  type: "group";
} & LayerMeta;

export type CanvasObject = (
  | {
      id: string;
      type: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
      borderRadius: number;
    }
  | {
      id: string;
      type: "circle";
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
    }
  | {
      id: string;
      type: "polygon";
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
      sides: number;
    }
  | {
      id: string;
      type: "path";
      points: CanvasPathPoint[];
      closed: boolean;
      fill: string;
      stroke: string;
      strokeWidth: number;
    }
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      w: number;
      h: number;
      rotation: number;
      text: string;
      fontSize: number;
      fontFamily: string;
      /** "normal" | "bold" — also accepts numeric weights. */
      fontWeight: string;
      align: "left" | "center" | "right";
      fill: string;
      lineHeight: number;
    }
) &
  LayerMeta;

export type CanvasFrame = {
  width: number;
  height: number;
  background: string;
  backgroundType: "solid" | "linear";
  backgroundTo?: string;
  backgroundAngle?: number;
  borderRadius?: number;
};

export type CanvasSlide = SlideBase & {
  type: "canvas";
  frame: CanvasFrame;
  objects: CanvasObject[];
  /** Group records for grouped objects. Optional — absent on pre-layers episodes. */
  groups?: CanvasGroup[];
};

export type Slide =
  | CoverSlide
  | QuoteSlide
  | CodeSlide
  | OutroSlide
  | ComparisonSlide
  | StatSlide
  | CanvasSlide;

// ── Core Presentation Schema v1 ────────────────────────────────────────────

/** Element-level entrance/exit motion — registered in AnimationRegistry. */
export type AnimationType =
  | "fade-up"
  | "scale-in"
  | "slide-in"
  | "spring-in"
  | "flip-3d"
  | "ken-burns"
  | "count-up";

/** Slide-to-slide motion — registered in TransitionRegistry. */
export type TransitionType =
  | "plain-crossfade"
  | "glow-crossfade"
  | "depth-slide";

/** Resolution-independent transform space declared per animation type. */
export type TransformSpace = "2d" | "3d";

// ── Direction ───────────────────────────────────────────────────────────────

export type Direction = "left" | "right" | "up" | "down" | "start" | "end";

// ── Canvas ──────────────────────────────────────────────────────────────────

export type PresentationCanvas = {
  width: number;
  height: number;
  safeArea?: { top: number; right: number; bottom: number; left: number };
};

export type CanvasFit = "contain" | "cover";

export type ExportTarget = {
  canvas: PresentationCanvas;
  fit: CanvasFit;
  anchor?: "center" | "top" | "bottom";
};

// ── Animation Spec ──────────────────────────────────────────────────────────

export type AnimationSpec = {
  /** Registry key — must exist in AnimationRegistry. */
  type: AnimationType;
  /** Absolute ms within the parent scope (slide or transition window). */
  start: number;
  /** Duration in ms. */
  duration: number;
  /** CSS-like easing string, e.g. "cubic-bezier(0.16, 1, 0.3, 1)". */
  easing: string;
  /** Direction for directional animations. */
  direction?: Direction;
  /** Per-type parameters (KenBurnsConfig, etc.). */
  params?: Record<string, unknown>;
};

// ── Transition Spec ─────────────────────────────────────────────────────────

export type TransitionSpec = {
  /** Registry key — must exist in TransitionRegistry. */
  type: TransitionType;
  /** Duration in ms. */
  duration: number;
  /** Overlap in ms — how much this transition overlaps the tail of A and head of B. */
  overlap: number;
  /** Easing string. */
  easing: string;
};

// ── Timeline Track ──────────────────────────────────────────────────────────

export type TimelineTrack = {
  elementId: string;
  enter: AnimationSpec;
  exit?: AnimationSpec;
};

// ── Presentation Slide ──────────────────────────────────────────────────────

export type PresentationSlide = {
  id: string;
  /** Total on-screen time for this slide, ms. */
  duration: number;
  canvas: PresentationCanvas;
  tracks: TimelineTrack[];
  transitionOut?: TransitionSpec;
};

// ── Presets ─────────────────────────────────────────────────────────────────

export type PresentationPreset =
  | "cinematic"
  | "minimal"
  | "energetic"
  | "editorial";

// ── Presentation Data (top-level container) ─────────────────────────────────

export type PresentationData = {
  version: 1;
  preset: PresentationPreset;
  slides: PresentationSlide[];
};

// ── Evaluated State (output of evaluateTimeline) ────────────────────────────

export type ElementPhase =
  | "before-enter"
  | "entering"
  | "holding"
  | "exiting"
  | "after-exit";

export type ResolvedElementState = {
  opacity: number;
  /** CSS transform string (translate/scale/rotate). */
  transform: string;
  /** CSS filter string (blur/brightness for glow). */
  filter: string;
  phase: ElementPhase;
};

export type ResolvedFrame = {
  slideId: string;
  time: number;
  elements: Record<string, ResolvedElementState>;
};

// ── Stagger (authoring-time composition, §2.1) ──────────────────────────────

export type StaggerSpec = {
  elementIds: string[];
  staggerDelay: number;
  childAnimation: Omit<AnimationSpec, "start">;
  groupStart: number;
};

// ── Ken Burns Config ────────────────────────────────────────────────────────

export type KenBurnsConfig = {
  from: { scale: number; x: number; y: number };
  to: { scale: number; x: number; y: number };
};

// ── Flip Element ────────────────────────────────────────────────────────────

export type FlipElementFaces = {
  front: Record<string, unknown>;
  back: Record<string, unknown>;
};

// ── Presentation Errors ─────────────────────────────────────────────────────

export type PresentationErrorCode =
  | "INVALID_TIMELINE"
  | "ASSET_LOAD_FAILED"
  | "UNSUPPORTED_ANIMATION"
  | "FONT_LOAD_TIMEOUT";

export type PresentationError = {
  code: PresentationErrorCode;
  message: string;
  /** Which element/slide was affected, if applicable. */
  elementId?: string;
  slideId?: string;
};

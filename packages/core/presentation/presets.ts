/**
 * Preset resolution (§10).
 *
 * A preset is an authoring-time convenience that resolves to full AnimationSpec
 * per element role — including duration, delay, easing. Spring is an accent,
 * not a blanket default.
 *
 * Resolution hierarchy:
 *   elementOverride ?? slideOverride ?? presetRecipe[elementRole] ?? globalDefault
 */

import type {
  AnimationSpec,
  PresentationPreset,
  TransitionType,
} from "./types.js";

// ── Element roles ───────────────────────────────────────────────────────────

export type ElementRole =
  | "title"
  | "body"
  | "subtitle"
  | "icon"
  | "badge"
  | "image";

// ── Preset recipe shape ─────────────────────────────────────────────────────

export type PresetRecipe = {
  /** Per-role AnimationSpec templates (without `start` — caller sets start). */
  roles: Partial<Record<ElementRole, Omit<AnimationSpec, "start">>>;
  /** Default transition between slides. */
  transition: TransitionType;
  /** Transition duration in ms. */
  transitionDuration: number;
  /** Transition overlap in ms. */
  transitionOverlap: number;
  /** Transition easing. */
  transitionEasing: string;
  /** Global default animation used when no role matches. */
  defaultAnimation: Omit<AnimationSpec, "start">;
};

// ── Presets ─────────────────────────────────────────────────────────────────

const presets: Record<PresentationPreset, PresetRecipe> = {
  cinematic: {
    roles: {
      title: { type: "fade-up", duration: 700, easing: "ease-out-expo" },
      body: { type: "fade-up", duration: 600, easing: "ease-out-expo" },
      subtitle: { type: "fade-up", duration: 600, easing: "ease-out-expo" },
      icon: { type: "scale-in", duration: 500, easing: "ease-out-expo" },
      badge: { type: "fade-up", duration: 400, easing: "ease-out" },
      image: { type: "fade-up", duration: 600, easing: "ease-out-expo" },
    },
    transition: "glow-crossfade",
    transitionDuration: 800,
    transitionOverlap: 400,
    transitionEasing: "ease-in-out",
    defaultAnimation: { type: "fade-up", duration: 500, easing: "ease-out" },
  },

  minimal: {
    roles: {
      title: { type: "fade-up", duration: 500, easing: "ease-out" },
      body: { type: "fade-up", duration: 400, easing: "ease-out" },
      subtitle: { type: "fade-up", duration: 400, easing: "ease-out" },
      icon: { type: "fade-up", duration: 300, easing: "ease-out" },
      badge: { type: "fade-up", duration: 350, easing: "ease-out" },
      image: { type: "fade-up", duration: 500, easing: "ease-out" },
    },
    transition: "plain-crossfade",
    transitionDuration: 500,
    transitionOverlap: 200,
    transitionEasing: "ease-in-out",
    defaultAnimation: { type: "fade-up", duration: 400, easing: "ease-out" },
  },

  energetic: {
    roles: {
      title: { type: "spring-in", duration: 600, easing: "ease-out" },
      body: { type: "fade-up", duration: 400, easing: "ease-out" },
      subtitle: { type: "fade-up", duration: 400, easing: "ease-out" },
      icon: { type: "spring-in", duration: 500, easing: "ease-out" },
      badge: { type: "fade-up", duration: 350, easing: "ease-out" },
      image: { type: "fade-up", duration: 500, easing: "ease-out" },
    },
    transition: "depth-slide",
    transitionDuration: 600,
    transitionOverlap: 300,
    transitionEasing: "ease-in-out",
    defaultAnimation: { type: "fade-up", duration: 400, easing: "ease-out" },
  },

  editorial: {
    roles: {
      title: { type: "slide-in", duration: 700, easing: "ease-out-expo", direction: "start" },
      body: { type: "slide-in", duration: 600, easing: "ease-out-expo", direction: "start" },
      subtitle: { type: "slide-in", duration: 600, easing: "ease-out-expo", direction: "start" },
      icon: { type: "scale-in", duration: 500, easing: "ease-out-expo" },
      badge: { type: "fade-up", duration: 400, easing: "ease-out" },
      image: { type: "fade-up", duration: 600, easing: "ease-out-expo" },
    },
    transition: "glow-crossfade",
    transitionDuration: 1000,
    transitionOverlap: 500,
    transitionEasing: "ease-in-out",
    defaultAnimation: { type: "fade-up", duration: 500, easing: "ease-out" },
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the full recipe for a preset.
 */
export function getPresetRecipe(preset: PresentationPreset): PresetRecipe {
  return presets[preset];
}

/**
 * Resolve the AnimationSpec for an element role under a given preset.
 *
 * Resolution hierarchy (§10):
 *   elementOverride ?? slideOverride ?? presetRecipe[elementRole] ?? globalDefault
 *
 * @param preset — The active preset name
 * @param role — The semantic role of this element (title, body, icon, badge, etc.)
 * @param start — Absolute ms start time for this element
 * @param elementOverride — Per-element override (from element config)
 * @param slideOverride — Per-slide override (from slide config)
 */
export function resolvePresetAnimation(
  preset: PresentationPreset,
  role: ElementRole,
  start: number,
  elementOverride?: Partial<AnimationSpec>,
  slideOverride?: Partial<AnimationSpec>,
): AnimationSpec {
  const recipe = getPresetRecipe(preset);
  const fallback = recipe.roles[role] ?? recipe.defaultAnimation;

  // Resolution hierarchy: elementOverride ?? slideOverride ?? role ?? default
  // When an override is present, it replaces the fallback entirely (?? semantics),
  // but it may be Partial — so merge its fields over the fallback.
  const chosen = (elementOverride ?? slideOverride) as Partial<AnimationSpec> | undefined;

  const type = chosen?.type ?? fallback.type;
  const duration = chosen?.duration ?? fallback.duration;
  const easing = chosen?.easing ?? fallback.easing;
  const direction = chosen?.direction ?? fallback.direction;
  const params = chosen?.params ?? fallback.params;

  return { type, start, duration, easing, direction, params };
}

/**
 * Get the transition type for a preset.
 */
export function getPresetTransition(preset: PresentationPreset): TransitionType {
  return getPresetRecipe(preset).transition;
}

/**
 * Get the default transition duration for a preset.
 */
export function getPresetTransitionDuration(preset: PresentationPreset): number {
  return getPresetRecipe(preset).transitionDuration;
}

/**
 * Get the default transition overlap for a preset.
 */
export function getPresetTransitionOverlap(preset: PresentationPreset): number {
  return getPresetRecipe(preset).transitionOverlap;
}

/**
 * Get the default transition easing for a preset.
 */
export function getPresetTransitionEasing(preset: PresentationPreset): string {
  return getPresetRecipe(preset).transitionEasing;
}

/**
 * Build a stagger spec for badges using the preset's badge animation as the
 * child template. Stagger delay varies by preset.
 */
export function getPresetStaggerDelay(preset: PresentationPreset): number {
  switch (preset) {
    case "energetic":
      return 50;
    case "minimal":
      return 100;
    case "cinematic":
      return 80;
    case "editorial":
      return 80;
    default:
      return 80;
  }
}

/**
 * Build a stagger spec for badge elements under a given preset.
 * Returns the expanded TimelineTrack entries.
 */
export { getPresetRecipe as getPreset };

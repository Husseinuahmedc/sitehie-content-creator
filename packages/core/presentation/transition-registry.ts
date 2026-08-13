/**
 * TransitionRegistry — slide-to-slide motion.
 *
 * Each entry defines a resolve function that computes visual state for
 * the outgoing slide (slide A) and incoming slide (slide B) at a given
 * transition progress [0, 1].
 *
 * To add a new transition type:
 *  1. Add the type name to TransitionType in types.ts
 *  2. Add an entry to this registry
 *  3. The evaluator discovers it automatically
 */

import type { TransitionType } from "./types.js";

export type TransitionVisualState = {
  /** Outgoing slide A visual override. */
  slideA: { opacity: number; transform: string; filter: string };
  /** Incoming slide B visual override. */
  slideB: { opacity: number; transform: string; filter: string };
  /** Optional shared effect (e.g. glow overlay). */
  effects?: { glowIntensity: number };
};

type TransitionResolver = (progress: number) => TransitionVisualState;

type TransitionEntry = {
  resolve: TransitionResolver;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<TransitionType, TransitionEntry>();

function register(type: TransitionType, entry: TransitionEntry): void {
  registry.set(type, entry);
}

// ── plain-crossfade ─────────────────────────────────────────────────────────

register("plain-crossfade", {
  resolve(progress) {
    return {
      slideA: {
        opacity: 1 - progress,
        transform: "scale(1)",
        filter: "none",
      },
      slideB: {
        opacity: progress,
        transform: "scale(1)",
        filter: "none",
      },
    };
  },
});

// ── glow-crossfade ──────────────────────────────────────────────────────────

register("glow-crossfade", {
  resolve(progress) {
    // Slide A fades out with a slight scale-down + brightness fade
    // Slide B fades in with a slight scale-up from 0.98 + brightness bloom
    const glowIntensity = Math.sin(progress * Math.PI); // parabolic glow curve peaking at 0.5

    return {
      slideA: {
        opacity: 1 - progress,
        transform: `scale(${lerp(1, 0.97, progress)})`,
        filter: `brightness(${lerp(1, 0.3, progress)})`,
      },
      slideB: {
        opacity: progress,
        transform: `scale(${lerp(0.98, 1, progress)})`,
        filter: `brightness(${lerp(1.15, 1, progress)}) blur(${lerp(0.3, 0, progress)}px)`,
      },
      effects: { glowIntensity },
    };
  },
});

// ── depth-slide ─────────────────────────────────────────────────────────────

register("depth-slide", {
  resolve(progress) {
    // Slide A slides left (or right depending on direction context) and scales down slightly
    // Slide B slides in from the opposite side
    const aOffset = -(progress * 80); // px left
    const aScale = lerp(1, 0.9, progress);
    const bOffset = (1 - progress) * 120; // px from right

    return {
      slideA: {
        opacity: 1 - progress * 0.5,
        transform: `translateX(${aOffset}px) scale(${aScale})`,
        filter: `brightness(${lerp(1, 0.6, progress)})`,
      },
      slideB: {
        opacity: progress,
        transform: `translateX(${bOffset}px) scale(1)`,
        filter: "none",
      },
    };
  },
});

// ── Public API ──────────────────────────────────────────────────────────────

export const FALLBACK_TRANSITION_TYPE: TransitionType = "plain-crossfade";

/**
 * Resolve a transition type + progress → visual state for both slides.
 * Unknown types automatically fall back to plain-crossfade (§13).
 */
export function resolveTransition(
  type: TransitionType,
  progress: number,
): TransitionVisualState {
  const entry = registry.get(type);
  if (!entry) {
    const fb = registry.get(FALLBACK_TRANSITION_TYPE)!;
    return fb.resolve(progress);
  }
  return entry.resolve(progress);
}

export function isKnownTransitionType(type: string): type is TransitionType {
  return registry.has(type as TransitionType);
}

export function listTransitionTypes(): TransitionType[] {
  return [...registry.keys()];
}

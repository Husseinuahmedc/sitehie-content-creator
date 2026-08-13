/**
 * AnimationRegistry — element-level entrance/exit motion.
 *
 * Each entry defines:
 *  - transformSpace: "2d" | "3d" (declared, not inferred)
 *  - resolve: a function that takes progress [0, 1], direction, and params,
 *    and returns { opacity, transform, filter }.
 *
 * To add a new animation type:
 *  1. Add the type name to AnimationType in types.ts
 *  2. Add an entry to this registry
 *  3. The evaluator discovers it automatically
 */

import type {
  AnimationType,
  Direction,
  TransformSpace,
  KenBurnsConfig,
} from "./types.js";
import { evaluateSpring } from "./curves/spring.js";

export type AnimationVisualState = {
  opacity: number;
  /** CSS transform string (translate/scale/rotate). */
  transform: string;
  /** CSS filter string (blur/brightness). */
  filter: string;
};

type AnimationResolver = (
  progress: number,
  direction?: Direction,
  params?: Record<string, unknown>,
) => AnimationVisualState;

type AnimationEntry = {
  transformSpace: TransformSpace;
  resolve: AnimationResolver;
};

// ── Resolver Helpers ────────────────────────────────────────────────────────

function resolveDirectionValue(
  direction: Direction | undefined,
  ltrDistance: number,
): { axis: "x" | "y"; value: number } {
  switch (direction) {
    case "left":
      return { axis: "x", value: ltrDistance };
    case "right":
      return { axis: "x", value: -ltrDistance };
    case "up":
      return { axis: "y", value: ltrDistance };
    case "down":
      return { axis: "y", value: -ltrDistance };
    case "start":
      // In LTR, start = left; the caller resolves RTL by swapping this
      return { axis: "x", value: ltrDistance };
    case "end":
      return { axis: "x", value: -ltrDistance };
    default:
      return { axis: "y", value: ltrDistance }; // default to up
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function kenBurnsProgress(
  progress: number,
  params?: Record<string, unknown>,
): { scale: number; x: number; y: number } | null {
  if (!params) return null;
  const cfg = params as KenBurnsConfig;
  if (!cfg.from || !cfg.to) return null;
  const t = progress;
  return {
    scale: lerp(cfg.from.scale, cfg.to.scale, t),
    x: lerp(cfg.from.x, cfg.to.x, t),
    y: lerp(cfg.from.y, cfg.to.y, t),
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

const registry = new Map<AnimationType, AnimationEntry>();

function register(type: AnimationType, entry: AnimationEntry): void {
  registry.set(type, entry);
}

// ── fade-up ─────────────────────────────────────────────────────────────────

register("fade-up", {
  transformSpace: "2d",
  resolve(progress, direction) {
    const distance = 30; // px in logical canvas
    const resolved = resolveDirectionValue(direction ?? "up", distance);
    const translate =
      resolved.axis === "x"
        ? `translateX(${(1 - progress) * resolved.value}px)`
        : `translateY(${(1 - progress) * resolved.value}px)`;
    return {
      opacity: progress,
      transform: translate,
      filter: "none",
    };
  },
});

// ── scale-in ────────────────────────────────────────────────────────────────

register("scale-in", {
  transformSpace: "2d",
  resolve(progress) {
    const scale = 0.92 + 0.08 * progress; // scale from 0.92 to 1
    return {
      opacity: progress,
      transform: `scale(${scale})`,
      filter: "none",
    };
  },
});

// ── slide-in ────────────────────────────────────────────────────────────────

register("slide-in", {
  transformSpace: "2d",
  resolve(progress, direction) {
    const distance = 60;
    const resolved = resolveDirectionValue(direction ?? "left", distance);
    const translate =
      resolved.axis === "x"
        ? `translateX(${(1 - progress) * resolved.value}px)`
        : `translateY(${(1 - progress) * resolved.value}px)`;
    return {
      opacity: progress,
      transform: translate,
      filter: "none",
    };
  },
});

// ── spring-in ───────────────────────────────────────────────────────────────

register("spring-in", {
  transformSpace: "2d",
  resolve(progress) {
    const springProgress = evaluateSpring(progress);
    // scale from 0.6 to 1 with spring overshoot on the tail, fade from 0 to 1
    const scale = 0.6 + 0.4 * springProgress;
    return {
      opacity: Math.min(1, progress * 1.3), // slightly quicker opacity rise
      transform: `scale(${Math.max(0, scale)})`,
      filter: "none",
    };
  },
});

// ── flip-3d ─────────────────────────────────────────────────────────────────

register("flip-3d", {
  transformSpace: "3d",
  resolve(progress) {
    const rotateY = progress * 180;
    return {
      opacity: 1,
      transform: `rotateY(${rotateY}deg)`,
      filter: "none",
    };
  },
});

// ── ken-burns ───────────────────────────────────────────────────────────────

register("ken-burns", {
  transformSpace: "2d",
  resolve(progress, _direction, params) {
    const kb = kenBurnsProgress(progress, params);
    if (!kb) {
      // No params — behaves like a plain fade-in
      return { opacity: progress, transform: "none", filter: "none" };
    }
    return {
      opacity: 1,
      transform: `translate(${kb.x}px, ${kb.y}px) scale(${kb.scale})`,
      filter: "none",
    };
  },
});

// ── count-up ────────────────────────────────────────────────────────────────

register("count-up", {
  transformSpace: "2d",
  resolve(progress) {
    return {
      opacity: progress,
      transform: "none",
      filter: "none",
    };
  },
});

// ── Public API ──────────────────────────────────────────────────────────────

export const FALLBACK_ANIMATION_TYPE: AnimationType = "fade-up";

/**
 * Resolve an animation type + progress → visual state.
 * Unknown types automatically fall back to fade-up.
 */
export function resolveAnimation(
  type: AnimationType,
  progress: number,
  direction?: Direction,
  params?: Record<string, unknown>,
): AnimationVisualState {
  const entry = registry.get(type);
  if (!entry) {
    // Fallback to fade-up for unknown types (§13)
    const fb = registry.get(FALLBACK_ANIMATION_TYPE)!;
    return fb.resolve(progress, direction, params);
  }
  return entry.resolve(progress, direction, params);
}

export function getTransformSpace(type: AnimationType): TransformSpace {
  return registry.get(type)?.transformSpace ?? "2d";
}

export function isKnownAnimationType(type: string): type is AnimationType {
  return registry.has(type as AnimationType);
}

export function listAnimationTypes(): AnimationType[] {
  return [...registry.keys()];
}

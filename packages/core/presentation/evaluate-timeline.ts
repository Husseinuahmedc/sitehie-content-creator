/**
 * Timeline Evaluator — the pure function at the heart of the presentation engine.
 *
 * evaluateTimeline(slide, t) is time-addressable, deterministic, and has zero
 * side effects. Given the same (slide, t) input, it produces byte-identical
 * output every time. This is the single function that both the browser player
 * and the Playwright exporter call — no parallel implementations.
 *
 * Core invariants (§0):
 *  1. Timeline is single source of truth for all visual state at any time t.
 *  2. evaluateTimeline(t) → visual state is a pure function.
 *  3. No animation is defined only as "what happens after an event."
 *  4. Export never depends on wall-clock timing.
 *  7. Enter, Hold, Exit are first-class parts of every element lifecycle.
 *  10. Unknown/misconfigured animation types fall back to fade-up (§13).
 */

import type {
  PresentationSlide,
  AnimationSpec,
  TimelineTrack,
  ElementPhase,
  ResolvedElementState,
  ResolvedFrame,
} from "./types.js";
import {
  resolveAnimation,
  FALLBACK_ANIMATION_TYPE,
  isKnownAnimationType,
  getTransformSpace,
} from "./animation-registry.js";
import { resolveTransition } from "./transition-registry.js";
import { parseEasing } from "./easing.js";

// ── Phase Determination ─────────────────────────────────────────────────────

/**
 * Determine the phase of an element at time `t` purely from enter/exit
 * start+duration. This is the single timing source rule (§1).
 */
export function determineElementPhase(
  t: number,
  enter: AnimationSpec,
  exit: AnimationSpec | undefined,
  slideDuration: number,
): ElementPhase {
  const enterStart = enter.start;
  const enterEnd = enter.start + enter.duration;

  if (t < enterStart) return "before-enter";

  if (exit) {
    const exitStart = exit.start;
    const exitEnd = exit.start + exit.duration;

    if (t >= enterStart && t < enterEnd) return "entering";
    if (t >= enterEnd && t < exitStart) return "holding";
    if (t >= exitStart && t < exitEnd) return "exiting";
    return "after-exit";
  }

  if (t >= enterStart && t < enterEnd) return "entering";
  if (t >= enterEnd && t < slideDuration) return "holding";
  return "after-exit";
}

/**
 * Compute the progress [0, 1] for an animation at time `t`.
 * Uses easing from the AnimationSpec.
 */
export function computeAnimationProgress(
  t: number,
  spec: AnimationSpec,
  phase: ElementPhase,
): number {
  if (phase === "before-enter" || phase === "after-exit") return 0;
  if (phase === "holding") return 1;

  const raw =
    phase === "entering"
      ? (t - spec.start) / spec.duration
      : (1 - (t - spec.start) / spec.duration);

  const clamped = Math.max(0, Math.min(1, raw));
  const easingFn = parseEasing(spec.easing);
  return easingFn(clamped);
}

/**
 * Resolve the visual state for a single element at time `t`.
 */
export function resolveElementState(
  t: number,
  track: TimelineTrack,
  slideDuration: number,
): ResolvedElementState {
  const phase = determineElementPhase(t, track.enter, track.exit, slideDuration);

  if (phase === "before-enter" || phase === "after-exit") {
    return { opacity: 0, transform: "none", filter: "none", phase };
  }

  if (phase === "holding") {
    return { opacity: 1, transform: "none", filter: "none", phase };
  }

  const animSpec = phase === "entering" ? track.enter : (track.exit ?? track.enter);

  let type = animSpec.type;
  if (!isKnownAnimationType(type)) {
    type = FALLBACK_ANIMATION_TYPE;
  }

  const progress = computeAnimationProgress(t, animSpec, phase);
  const visual = resolveAnimation(type, progress, animSpec.direction, animSpec.params);

  return { ...visual, phase };
}

// ── evaluateTimeline ────────────────────────────────────────────────────────

/**
 * Evaluate the full timeline for a slide at time `t`.
 * Returns a ResolvedFrame — elementId → visual state at time t.
 */
export function evaluateTimeline(
  slide: PresentationSlide,
  t: number,
): ResolvedFrame {
  const elements: Record<string, ResolvedElementState> = {};

  for (const track of slide.tracks) {
    elements[track.elementId] = resolveElementState(t, track, slide.duration);
  }

  return {
    slideId: slide.id,
    time: t,
    elements,
  };
}

// ── Multi-slide: computeSlideStartTime ──────────────────────────────────────

/**
 * Compute each slide's absolute start time in ms on the presentation master clock.
 */
export function computeSlideStartTimes(
  slides: PresentationSlide[],
): number[] {
  const startTimes: number[] = [];
  let cursor = 0;

  for (const slide of slides) {
    startTimes.push(cursor);
    const advance = slide.transitionOut
      ? slide.duration - slide.transitionOut.overlap
      : slide.duration;
    cursor += advance;
  }

  return startTimes;
}

/**
 * Compute total presentation duration in ms.
 */
export function computeTotalDuration(slides: PresentationSlide[]): number {
  if (slides.length === 0) return 0;
  const startTimes = computeSlideStartTimes(slides);
  const last = slides[slides.length - 1];
  return startTimes[startTimes.length - 1] + last.duration;
}

// ── Multi-slide: evaluateAtMasterTime ────────────────────────────────────────

export type MasterFrameResult = {
  frames: ResolvedFrame[];
  transitionVisual?: {
    type: string;
    progress: number;
    slideA: { opacity: number; transform: string; filter: string };
    slideB: { opacity: number; transform: string; filter: string };
    effects?: { glowIntensity: number };
  };
};

/**
 * Evaluate the entire presentation at a given master-clock time `masterT`.
 */
export function evaluateAtMasterTime(
  slides: PresentationSlide[],
  masterT: number,
): MasterFrameResult | null {
  if (slides.length === 0) return null;

  const startTimes = computeSlideStartTimes(slides);

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideStart = startTimes[i];
    const slideLocalT = masterT - slideStart;

    if (slideLocalT < 0) continue;

    if (slide.transitionOut && i + 1 < slides.length) {
      const transitionStart = slideStart + slide.duration - slide.transitionOut.overlap;
      const transitionEnd = transitionStart + slide.transitionOut.duration;

      if (masterT >= transitionStart && masterT <= transitionEnd) {
        const nextSlide = slides[i + 1];
        const nextStart = startTimes[i + 1];
        const nextLocalT = masterT - nextStart;
        const transitionProgress = (masterT - transitionStart) / slide.transitionOut.duration;

        const tv = resolveTransition(slide.transitionOut.type, transitionProgress);

        return {
          frames: [
            evaluateTimeline(slide, slideLocalT),
            evaluateTimeline(nextSlide, nextLocalT),
          ],
          transitionVisual: {
            type: slide.transitionOut.type,
            progress: transitionProgress,
            ...tv,
          },
        };
      }
    }

    if (slideLocalT <= slide.duration) {
      return { frames: [evaluateTimeline(slide, slideLocalT)] };
    }
  }

  const lastSlide = slides[slides.length - 1];
  const lastStart = startTimes[startTimes.length - 1];
  return { frames: [evaluateTimeline(lastSlide, lastStart + lastSlide.duration)] };
}

// ── Utilities ───────────────────────────────────────────────────────────────

/**
 * Check whether a slide contains any 3D elements (§2).
 */
export function slideHas3DElements(slide: PresentationSlide): boolean {
  for (const track of slide.tracks) {
    if (getTransformSpace(track.enter.type) === "3d") return true;
  }
  return false;
}

/**
 * Derive the hold window for an element (§1).
 */
export function computeHoldWindow(
  enter: AnimationSpec,
  exit: AnimationSpec | undefined,
  slideDuration: number,
): [number, number] | null {
  const enterEnd = enter.start + enter.duration;
  const exitStart = exit?.start ?? slideDuration;

  if (exitStart < enterEnd) return null;

  return [enterEnd, exitStart];
}

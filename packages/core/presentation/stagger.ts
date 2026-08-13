/**
 * Stagger expansion utility — authoring-time composition step (§2.1).
 *
 * stagger-reveal is NOT stored as an AnimationType on a TimelineTrack.
 * It expands into ordinary TimelineTrack entries before the timeline is
 * ever evaluated. This keeps evaluateTimeline simple — it only deals with
 * per-element tracks.
 */

import type { AnimationSpec, StaggerSpec, TimelineTrack } from "./types.js";

/**
 * Expand a StaggerSpec into individual TimelineTrack entries.
 *
 * Each child element gets its own track with start time computed as:
 *   groupStart + index * staggerDelay
 *
 * The childAnimation template is spread, minus its `start`, which is
 * replaced by the computed staggered start.
 *
 * @example
 *   expandStagger({
 *     elementIds: ["badge1", "badge2", "badge3"],
 *     staggerDelay: 80,
 *     childAnimation: { type: "fade-up", duration: 500, easing: "ease-out" },
 *     groupStart: 600,
 *   })
 *   // → 3 TimelineTrack entries with starts: 600, 680, 760
 */
export function expandStagger(spec: StaggerSpec): TimelineTrack[] {
  return spec.elementIds.map((elementId, i) => ({
    elementId,
    enter: {
      ...spec.childAnimation,
      start: spec.groupStart + i * spec.staggerDelay,
    } as AnimationSpec,
  }));
}

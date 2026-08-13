/**
 * Convert an Episode + Theme into PresentationData for the presentation engine.
 *
 * Maps episode slides, their elements, and the preset's animation recipes
 * into PresentationSlide timelines that the evaluator can consume.
 *
 * For A2 (fade-up only): each slide gets a single "slide-container" track
 * with a fade-up entrance. Individual element animations come in A3.
 */

import type { Episode } from "@sitehie/core/domain";
import type {
  PresentationData,
  PresentationSlide,
  PresentationPreset,
  AnimationSpec,
  TimelineTrack,
} from "@sitehie/core/presentation";
import {
  getPresetTransition,
  getPresetTransitionDuration,
  getPresetTransitionOverlap,
  getPresetTransitionEasing,
} from "@sitehie/core/presentation";

export const DEFAULT_PRESET: PresentationPreset = "cinematic";

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;

/**
 * Build a PresentationSlide from episode data for a single slide.
 *
 * For A2, this creates a simple fade-up track for the slide container.
 */
export function buildPresentationSlide(
  slideIndex: number,
  totalSlides: number,
  preset: PresentationPreset = DEFAULT_PRESET,
): PresentationSlide {
  const id = `slide-${slideIndex}`;
  const canvas = { width: SLIDE_WIDTH, height: SLIDE_HEIGHT };

  // Single track: fade-up entrance for the slide container
  const enter: AnimationSpec = {
    type: "fade-up",
    start: 0,
    duration: 700,
    easing: "ease-out-expo",
  };

  const tracks: TimelineTrack[] = [
    { elementId: "slide-container", enter },
  ];

  const duration = 5000; // Default 5s display time

  return { id, duration, canvas, tracks };
}

/**
 * Convert an entire episode into PresentationData.
 */
export function buildPresentationData(
  episode: Episode,
  preset: PresentationPreset = DEFAULT_PRESET,
): PresentationData {
  const slides: PresentationSlide[] = episode.slides.map((_, i) =>
    buildPresentationSlide(i, episode.slides.length, preset),
  );

  // Add transitions between slides
  const transType = getPresetTransition(preset);
  const transDuration = getPresetTransitionDuration(preset);
  const transOverlap = getPresetTransitionOverlap(preset);
  const transEasing = getPresetTransitionEasing(preset);

  for (let i = 0; i < slides.length - 1; i++) {
    slides[i].transitionOut = {
      type: transType,
      duration: transDuration,
      overlap: transOverlap,
      easing: transEasing,
    };
  }

  return { version: 1, preset, slides };
}

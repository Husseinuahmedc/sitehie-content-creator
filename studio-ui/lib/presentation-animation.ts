"use client";

import { useRef, useState, useEffect } from "react";
import {
  evaluateTimeline,
  type PresentationSlide,
  type ResolvedFrame,
} from "@sitehie/core/presentation";

type SlideAnimation = {
  frame: ResolvedFrame | null;
  elapsed: number;
};

/**
 * Per-slide animation hook — drives evaluateTimeline via requestAnimationFrame.
 *
 * Each time the slide changes, the animation clock resets and runs the entrance
 * animation for all timeline tracks on that slide. After the slide's duration
 * elapses (or the longest animation completes), the slide enters "holding" state.
 */
export function useSlideAnimation(
  slide: PresentationSlide | null,
  playing: boolean,
) {
  const [anim, setAnim] = useState<SlideAnimation>({ frame: null, elapsed: 0 });
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const slideKeyRef = useRef<string>("");

  // Reset on slide change
  useEffect(() => {
    if (!slide) return;
    if (slide.id !== slideKeyRef.current) {
      slideKeyRef.current = slide.id;
      startRef.current = 0;
      const initialFrame = evaluateTimeline(slide, 0);
      setAnim({ frame: initialFrame, elapsed: 0 });
    }
  }, [slide]);

  // Animation loop
  useEffect(() => {
    if (!slide || !playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = (now: number) => {
      if (startRef.current === 0) startRef.current = now;
      const elapsed = now - startRef.current;

      // Cap at slide duration
      const t = Math.min(elapsed, slide.duration);
      const frame = evaluateTimeline(slide, t);
      setAnim({ frame, elapsed: t });

      if (t < slide.duration) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [slide, playing]);

  return anim;
}

/**
 * Compute CSS transform/opacity from a ResolvedFrame for a specific element ID.
 */
export function getElementStyle(
  frame: ResolvedFrame | null,
  elementId: string,
): React.CSSProperties {
  if (!frame || !frame.elements[elementId]) {
    return {};
  }

  const state = frame.elements[elementId];
  return {
    opacity: state.opacity,
    transform: state.transform,
    filter: state.filter,
    transition: state.phase === "entering" || state.phase === "exiting"
      ? "none" // driven by JS, not CSS transitions
      : undefined,
    willChange: state.phase === "entering" || state.phase === "exiting"
      ? "transform, opacity"
      : undefined,
  };
}

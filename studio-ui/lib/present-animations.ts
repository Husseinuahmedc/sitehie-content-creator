/**
 * Per-element animation config for the Present Mode.
 *
 * Supports 4 presets (cinematic, minimal, energetic, editorial) that map to
 * different animation types per element role, stagger delays, and transition
 * styles. The stagger-reveal effect is achieved by injecting CSS @keyframes
 * into the slide iframe and applying animation-delay per element.
 */

import type { Slide } from "@sitehie/core/domain";
import type { PresentationPreset } from "@sitehie/core/presentation";
import {
  getPresetStaggerDelay,
} from "@sitehie/core/presentation";

export type AnimType = "fade-up" | "scale-in" | "slide-in" | "spring-in";
export type TransitionStyle = "crossfade" | "depth-slide";

export type ElementAnimEntry = {
  selector: string;
  type: AnimType;
  role: string;
};

// ── Element definitions per slide type (selectors) ──────────────────────

const COVER_SELECTORS: Omit<ElementAnimEntry, "type">[] = [
  { selector: "#cover-title", role: "title" },
  { selector: "#icon-wrap", role: "icon" },
  { selector: "#series", role: "series" },
  { selector: "#cover-tech-badges", role: "badges" },
  { selector: "#cover-watermark", role: "watermark" },
  { selector: "#hint", role: "hint" },
];

const CODE_SELECTORS: Omit<ElementAnimEntry, "type">[] = [
  { selector: "#slide-number", role: "number" },
  { selector: "#slide-title", role: "title" },
  { selector: "#slide-subtitle", role: "subtitle" },
  { selector: "#code-wrap", role: "code" },
  { selector: "#explanation", role: "explanation" },
  { selector: "#progress", role: "progress" },
  { selector: "#footer", role: "footer" },
];

const QUOTE_SELECTORS: Omit<ElementAnimEntry, "type">[] = [
  { selector: "#quote-box", role: "text" },
];

const COMPARISON_SELECTORS: Omit<ElementAnimEntry, "type">[] = [
  { selector: "#slide-number", role: "number" },
  { selector: "#comparison-title", role: "title" },
  { selector: "#panels-wrap", role: "panels" },
  { selector: "#comparison-verdict", role: "verdict" },
];

const STAT_SELECTORS: Omit<ElementAnimEntry, "type">[] = [
  { selector: "#slide-number", role: "number" },
  { selector: "#stat-value", role: "value" },
  { selector: "#stat-label", role: "label" },
  { selector: "#stat-subtext", role: "subtext" },
];

const OUTRO_SELECTORS: Omit<ElementAnimEntry, "type">[] = [
  { selector: "#outro-image-wrap", role: "avatar" },
  { selector: "#outro-question", role: "question" },
  { selector: "#outro-brand", role: "brand" },
  { selector: "#outro-tech-badges", role: "badges" },
];

const SLIDE_SELECTORS: Partial<Record<Slide["type"], Omit<ElementAnimEntry, "type">[]>> = {
  cover: COVER_SELECTORS,
  quote: QUOTE_SELECTORS,
  code: CODE_SELECTORS,
  comparison: COMPARISON_SELECTORS,
  stat: STAT_SELECTORS,
  outro: OUTRO_SELECTORS,
};

// ── Preset configs ──────────────────────────────────────────────────────

const PRESET_ROLE_ANIM: Record<PresentationPreset, Record<string, AnimType>> = {
  cinematic: {
    title: "fade-up", subtitle: "fade-up", icon: "scale-in",
    code: "scale-in", text: "fade-up", value: "scale-in",
    panels: "scale-in", avatar: "scale-in", badges: "fade-up",
    series: "fade-up", number: "fade-up", question: "fade-up",
    brand: "fade-up", subtext: "fade-up", label: "fade-up",
    watermark: "fade-up", hint: "fade-up", verdict: "fade-up",
    footer: "fade-up", progress: "fade-up", explanation: "fade-up",
  },
  minimal: {
    title: "fade-up", subtitle: "fade-up", icon: "fade-up",
    code: "fade-up", text: "fade-up", value: "fade-up",
    panels: "fade-up", avatar: "fade-up", badges: "fade-up",
    series: "fade-up", number: "fade-up", question: "fade-up",
    brand: "fade-up", subtext: "fade-up", label: "fade-up",
    watermark: "fade-up", hint: "fade-up", verdict: "fade-up",
    footer: "fade-up", progress: "fade-up", explanation: "fade-up",
  },
  energetic: {
    title: "spring-in", subtitle: "fade-up", icon: "spring-in",
    code: "scale-in", text: "fade-up", value: "spring-in",
    panels: "scale-in", avatar: "spring-in", badges: "fade-up",
    series: "fade-up", number: "fade-up", question: "spring-in",
    brand: "fade-up", subtext: "fade-up", label: "fade-up",
    watermark: "fade-up", hint: "fade-up", verdict: "fade-up",
    footer: "fade-up", progress: "fade-up", explanation: "fade-up",
  },
  editorial: {
    title: "slide-in", subtitle: "slide-in", icon: "scale-in",
    code: "fade-up", text: "slide-in", value: "scale-in",
    panels: "fade-up", avatar: "scale-in", badges: "fade-up",
    series: "slide-in", number: "fade-up", question: "slide-in",
    brand: "fade-up", subtext: "slide-in", label: "fade-up",
    watermark: "fade-up", hint: "fade-up", verdict: "fade-up",
    footer: "fade-up", progress: "fade-up", explanation: "fade-up",
  },
};

const PRESET_TRANSITION: Record<PresentationPreset, TransitionStyle> = {
  cinematic: "crossfade",
  minimal: "crossfade",
  energetic: "depth-slide",
  editorial: "crossfade",
};

// ── Animation CSS ───────────────────────────────────────────────────────

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

function animKeyframesCSS(type: AnimType): string {
  switch (type) {
    case "fade-up":
      return `@keyframes present-fade-up {
  from { opacity: 0; transform: translateY(36px); }
  to { opacity: 1; transform: translateY(0); }
}`;
    case "scale-in":
      return `@keyframes present-scale-in {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}`;
    case "slide-in":
      return `@keyframes present-slide-in {
  from { opacity: 0; transform: translateX(-40px); }
  to { opacity: 1; transform: translateX(0); }
}`;
    case "spring-in":
      return `@keyframes present-spring-in {
  0% { opacity: 0; transform: scale(0.5); }
  55% { opacity: 1; transform: scale(1.1); }
  75% { transform: scale(0.95); }
  85% { transform: scale(1.03); }
  100% { opacity: 1; transform: scale(1); }
}`;
  }
}

// ── Main API ────────────────────────────────────────────────────────────

/**
 * Resolve the elements for a slide with the active preset's animation types.
 */
function resolveSlideElements(
  slideType: Slide["type"] | undefined,
  preset: PresentationPreset,
): ElementAnimEntry[] {
  if (!slideType) return [];
  const selectors = SLIDE_SELECTORS[slideType];
  if (!selectors) return [];
  const roleAnims = PRESET_ROLE_ANIM[preset];
  return selectors.map((s) => ({
    ...s,
    type: roleAnims[s.role] || "fade-up",
  }));
}

/**
 * Inject animation CSS and apply staggered entrance animations to slide elements.
 * Animations vary by preset.
 */
export function animateSlideElements(
  doc: Document,
  slideType: Slide["type"] | undefined,
  preset: PresentationPreset = "cinematic",
  delayOffset = 0,
): void {
  const elements = resolveSlideElements(slideType, preset);
  if (elements.length === 0) return;

  const staggerDelay = getPresetStaggerDelay(preset);

  const usedTypes = new Set<AnimType>();
  for (const el of elements) usedTypes.add(el.type);

  let css = "";
  for (const type of usedTypes) css += animKeyframesCSS(type) + "\n";

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const delay = delayOffset + i * staggerDelay;
    const className = `pa-${el.role.replace(/[^a-zA-Z0-9]/g, "-")}`;
    css += `
.present-anim {
  opacity: 0;
  animation-fill-mode: forwards;
  animation-timing-function: ${EASING};
  animation-duration: 650ms;
}
.${className} {
  animation-name: present-${el.type};
  animation-delay: ${delay}ms;
}`;
  }

  const style = doc.createElement("style");
  style.id = "present-animations";
  style.textContent = css;
  doc.head.appendChild(style);

  for (const el of elements) {
    const targets = doc.querySelectorAll(el.selector);
    const className = `pa-${el.role.replace(/[^a-zA-Z0-9]/g, "-")}`;
    targets.forEach((node) => {
      node.classList.add("present-anim", className);
    });
  }
}

/**
 * Get the total animation duration for a slide.
 */
export function getSlideAnimationDuration(
  slideType: Slide["type"] | undefined,
  preset: PresentationPreset = "cinematic",
): number {
  const elements = resolveSlideElements(slideType, preset);
  if (elements.length === 0) return 0;
  const staggerDelay = getPresetStaggerDelay(preset);
  return (elements.length - 1) * staggerDelay + 650;
}

/**
 * Get the transition style for a preset.
 */
export function getTransitionStyle(preset: PresentationPreset): TransitionStyle {
  return PRESET_TRANSITION[preset];
}

export { PRESET_TRANSITION };

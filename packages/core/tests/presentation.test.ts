import { describe, it } from "node:test";
import assert from "node:assert";
import {
  determineElementPhase,
  computeAnimationProgress,
  evaluateTimeline,
  evaluateAtMasterTime,
  computeSlideStartTimes,
  computeTotalDuration,
  computeHoldWindow,
  slideHas3DElements,
} from "../presentation/evaluate-timeline.js";
import {
  resolveAnimation,
  isKnownAnimationType,
  listAnimationTypes,
  getTransformSpace,
} from "../presentation/animation-registry.js";
import {
  resolveTransition,
  isKnownTransitionType,
  listTransitionTypes,
} from "../presentation/transition-registry.js";
import { parseEasing } from "../presentation/easing.js";
import { evaluateSpring } from "../presentation/curves/spring.js";
import { expandStagger } from "../presentation/stagger.js";
import {
  getPresetRecipe,
  resolvePresetAnimation,
  getPresetTransition,
  getPresetStaggerDelay,
} from "../presentation/presets.js";
import type {
  AnimationSpec,
  PresentationSlide,
  TimelineTrack,
  TransitionSpec,
} from "../presentation/types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function anim(
  type: string,
  start: number,
  duration: number,
  easing = "ease-out",
  direction?: string,
): AnimationSpec {
  return {
    type: type as AnimationSpec["type"],
    start,
    duration,
    easing,
    direction: direction as AnimationSpec["direction"],
  };
}

function slide(
  id: string,
  duration: number,
  tracks: TimelineTrack[],
  transitionOut?: TransitionSpec,
): PresentationSlide {
  return {
    id,
    duration,
    canvas: { width: 1080, height: 1350 },
    tracks,
    transitionOut,
  };
}

function track(elementId: string, enter: AnimationSpec, exit?: AnimationSpec): TimelineTrack {
  return { elementId, enter, exit };
}

// ── evaluateSpring ──────────────────────────────────────────────────────────

describe("evaluateSpring", () => {
  it("returns 0 at progress 0", () => {
    assert.strictEqual(evaluateSpring(0), 0);
  });

  it("is deterministic — same input produces identical output", () => {
    const results = Array.from({ length: 100 }, () => evaluateSpring(0.5));
    for (let i = 1; i < results.length; i++) {
      assert.strictEqual(results[i], results[0]);
    }
  });

  it("returns deterministic values: zero at progress 0, non-trivial shape", () => {
    assert.strictEqual(evaluateSpring(0), 0);
    // Spring is a damped oscillator — values should differ from linear
    const mid = evaluateSpring(0.5);
    assert(mid !== 0.5, "spring should not be linear");
    // Same input = same output
    assert.strictEqual(evaluateSpring(0.3), evaluateSpring(0.3));
  });

  it("returns a value with magnitude <= 1.5 for any progress", () => {
    // Spring can overshoot — value should stay bounded
    for (let i = 0; i <= 100; i++) {
      const val = evaluateSpring(i / 100);
      assert(val >= -0.5 && val <= 1.5, `spring(${i / 100}) = ${val} not in [-0.5, 1.5]`);
    }
  });
});

// ── determineElementPhase ───────────────────────────────────────────────────

describe("determineElementPhase", () => {
  const enter = anim("fade-up", 500, 400);
  const exit = anim("fade-up", 3000, 400);
  const slideDuration = 4000;

  it("returns before-enter before start", () => {
    assert.strictEqual(determineElementPhase(0, enter, exit, slideDuration), "before-enter");
    assert.strictEqual(determineElementPhase(499, enter, exit, slideDuration), "before-enter");
  });

  it("returns entering during entrance animation", () => {
    assert.strictEqual(determineElementPhase(500, enter, exit, slideDuration), "entering");
    assert.strictEqual(determineElementPhase(700, enter, exit, slideDuration), "entering");
  });

  it("returns holding between enter end and exit start", () => {
    assert.strictEqual(determineElementPhase(900, enter, exit, slideDuration), "holding");
    assert.strictEqual(determineElementPhase(2000, enter, exit, slideDuration), "holding");
  });

  it("returns exiting during exit animation", () => {
    assert.strictEqual(determineElementPhase(3000, enter, exit, slideDuration), "exiting");
    assert.strictEqual(determineElementPhase(3200, enter, exit, slideDuration), "exiting");
  });

  it("returns after-exit after exit ends", () => {
    assert.strictEqual(determineElementPhase(3400, enter, exit, slideDuration), "after-exit");
    assert.strictEqual(determineElementPhase(4000, enter, exit, slideDuration), "after-exit");
  });

  it("without exit, holds until slide ends", () => {
    const noExit = anim("fade-up", 500, 400);
    assert.strictEqual(determineElementPhase(0, noExit, undefined, 4000), "before-enter");
    assert.strictEqual(determineElementPhase(600, noExit, undefined, 4000), "entering");
    assert.strictEqual(determineElementPhase(900, noExit, undefined, 4000), "holding");
    assert.strictEqual(determineElementPhase(3500, noExit, undefined, 4000), "holding");
    assert.strictEqual(determineElementPhase(4000, noExit, undefined, 4000), "after-exit");
  });
});

// ── evaluateTimeline ────────────────────────────────────────────────────────

describe("evaluateTimeline", () => {
  it("resolves fade-up element — opacity goes 0 → 1", () => {
    const s = slide("s1", 5000, [
      track("title", anim("fade-up", 0, 1000)),
    ]);

    const before = evaluateTimeline(s, -1);
    assert.strictEqual(before.elements["title"].opacity, 0);
    assert.strictEqual(before.elements["title"].phase, "before-enter");

    const mid = evaluateTimeline(s, 500);
    assert(mid.elements["title"].opacity > 0.4);
    assert(mid.elements["title"].opacity < 0.8);
    assert.strictEqual(mid.elements["title"].phase, "entering");

    const done = evaluateTimeline(s, 1000);
    assert.strictEqual(done.elements["title"].opacity, 1);
    assert.strictEqual(done.elements["title"].transform, "none");
    assert.strictEqual(done.elements["title"].phase, "holding");
  });

  it("unknown animation type falls back to fade-up", () => {
    const s = slide("s1", 5000, [
      track("title", anim("nonexistent-type" as never, 0, 500)),
    ]);

    const result = evaluateTimeline(s, 250);
    // Should not throw, should resolve like fade-up
    assert.strictEqual(result.elements["title"].phase, "entering");
    assert(result.elements["title"].opacity > 0);
  });

  it("multiple elements resolve independently", () => {
    const s = slide("s1", 5000, [
      track("title", anim("fade-up", 0, 500)),
      track("icon", anim("scale-in", 200, 500)),
      track("badge1", anim("slide-in", 400, 400)),
    ]);

    const at0 = evaluateTimeline(s, 0);
    assert.strictEqual(at0.elements["title"].phase, "entering");
    assert.strictEqual(at0.elements["icon"].phase, "before-enter");
    assert.strictEqual(at0.elements["badge1"].phase, "before-enter");

    const at300 = evaluateTimeline(s, 300);
    assert.strictEqual(at300.elements["title"].phase, "entering"); // still entering (0-500)
    assert.strictEqual(at300.elements["icon"].phase, "entering"); // 200-700
    assert.strictEqual(at300.elements["badge1"].phase, "before-enter");

    const at600 = evaluateTimeline(s, 600);
    assert.strictEqual(at600.elements["title"].phase, "holding"); // done by 500
    assert.strictEqual(at600.elements["title"].opacity, 1);
    assert.strictEqual(at600.elements["icon"].phase, "entering"); // still 200-700
    assert.strictEqual(at600.elements["badge1"].phase, "entering"); // 400-800

    const at800 = evaluateTimeline(s, 800);
    assert.strictEqual(at800.elements["title"].phase, "holding");
    assert.strictEqual(at800.elements["icon"].phase, "holding");
    assert.strictEqual(at800.elements["badge1"].phase, "holding");
  });

  it("element with exit animation resolves exit phase", () => {
    const s = slide("s1", 5000, [
      track("title", anim("fade-up", 0, 500), anim("fade-up", 4000, 500)),
    ]);

    const holding = evaluateTimeline(s, 2000);
    assert.strictEqual(holding.elements["title"].phase, "holding");
    assert.strictEqual(holding.elements["title"].opacity, 1);

    const exiting = evaluateTimeline(s, 4200);
    assert.strictEqual(exiting.elements["title"].phase, "exiting");
    assert(exiting.elements["title"].opacity > 0);
    assert(exiting.elements["title"].opacity < 1);

    const gone = evaluateTimeline(s, 4500);
    assert.strictEqual(gone.elements["title"].phase, "after-exit");
    assert.strictEqual(gone.elements["title"].opacity, 0);
  });

  it("is pure and deterministic — 1000 calls same input same output", () => {
    const s = slide("s1", 5000, [
      track("title", anim("fade-up", 0, 1000)),
    ]);
    const first = JSON.stringify(evaluateTimeline(s, 500));
    for (let i = 0; i < 1000; i++) {
      const again = JSON.stringify(evaluateTimeline(s, 500));
      assert.strictEqual(again, first);
    }
  });

  it("returns correct frame metadata", () => {
    const s = slide("mySlide", 5000, []);
    const frame = evaluateTimeline(s, 250);
    assert.strictEqual(frame.slideId, "mySlide");
    assert.strictEqual(frame.time, 250);
  });
});

// ── computeSlideStartTimes / computeTotalDuration ──────────────────────────

describe("multi-slide timing", () => {
  it("computes start times with no transitions", () => {
    const slides = [
      slide("a", 5000, []),
      slide("b", 5000, []),
      slide("c", 5000, []),
    ];
    assert.deepStrictEqual(computeSlideStartTimes(slides), [0, 5000, 10000]);
    assert.strictEqual(computeTotalDuration(slides), 15000);
  });

  it("computes start times with transitions and overlap", () => {
    const transition: TransitionSpec = { type: "plain-crossfade", duration: 800, overlap: 400, easing: "ease-in-out" };
    const slides = [
      slide("a", 5000, [], transition),
      slide("b", 5000, [], transition),
    ];
    // Slide A: 5000, advance = 5000 - 400 = 4600
    // Slide B: starts at 4600
    // Total duration = 4600 + 5000 = 9600
    assert.deepStrictEqual(computeSlideStartTimes(slides), [0, 4600]);
    assert.strictEqual(computeTotalDuration(slides), 9600);
  });

  it("empty slides returns 0", () => {
    assert.strictEqual(computeTotalDuration([]), 0);
  });
});

// ── evaluateAtMasterTime ───────────────────────────────────────────────────

describe("evaluateAtMasterTime", () => {
  it("evaluates single slide at master time", () => {
    const slides = [slide("a", 5000, [track("title", anim("fade-up", 0, 500))])];
    const result = evaluateAtMasterTime(slides, 250);
    assert(result !== null);
    assert.strictEqual(result.frames.length, 1);
    assert.strictEqual(result.frames[0].slideId, "a");
    assert(result.frames[0].elements["title"].opacity > 0);
  });

  it("evaluates during transition with two frames", () => {
    const transition: TransitionSpec = { type: "plain-crossfade", duration: 800, overlap: 400, easing: "ease-in-out" };
    const slides = [
      slide("a", 5000, [track("titleA", anim("fade-up", 0, 500))], transition),
      slide("b", 5000, [track("titleB", anim("fade-up", 0, 500))]),
    ];
    // A: duration 5000, overlap 400 → B starts at 4600
    // Transition: 4600 → 5400
    const result = evaluateAtMasterTime(slides, 5000); // in transition
    assert(result !== null);
    assert.strictEqual(result.frames.length, 2);
    assert(result.transitionVisual !== undefined);
    assert.strictEqual(result.transitionVisual.type, "plain-crossfade");
    assert(result.transitionVisual.progress > 0);
    assert(result.transitionVisual.progress < 1);
  });

  it("returns null for empty slides", () => {
    assert.strictEqual(evaluateAtMasterTime([], 0), null);
  });
});

// ── computeHoldWindow ──────────────────────────────────────────────────────

describe("computeHoldWindow", () => {
  it("derives hold window for element with exit", () => {
    const enter = anim("fade-up", 500, 400);
    const exit = anim("fade-up", 3000, 400);
    const result = computeHoldWindow(enter, exit, 5000);
    assert.deepStrictEqual(result, [900, 3000]);
  });

  it("uses slide duration when no exit specified", () => {
    const enter = anim("fade-up", 500, 400);
    const result = computeHoldWindow(enter, undefined, 5000);
    assert.deepStrictEqual(result, [900, 5000]);
  });

  it("returns null when exit starts before enter ends", () => {
    const enter = anim("fade-up", 500, 400);
    const exit = anim("fade-up", 600, 400); // exit starts at 600, enter ends at 900
    const result = computeHoldWindow(enter, exit, 5000);
    assert.strictEqual(result, null);
  });
});

// ── slideHas3DElements ──────────────────────────────────────────────────────

describe("slideHas3DElements", () => {
  it("returns false for 2D-only slides", () => {
    const s = slide("s1", 5000, [
      track("title", anim("fade-up", 0, 500)),
      track("icon", anim("scale-in", 200, 300)),
    ]);
    assert.strictEqual(slideHas3DElements(s), false);
  });

  it("returns true when any element is flip-3d", () => {
    const s = slide("s1", 5000, [
      track("title", anim("fade-up", 0, 500)),
      track("card", anim("flip-3d", 200, 800)),
    ]);
    assert.strictEqual(slideHas3DElements(s), true);
  });
});

// ── Animation Registry ──────────────────────────────────────────────────────

describe("AnimationRegistry", () => {
  it("all known types resolve without throwing", () => {
    for (const type of listAnimationTypes()) {
      const result = resolveAnimation(type, 0.5);
      assert(typeof result.opacity === "number");
      assert(typeof result.transform === "string");
      assert(typeof result.filter === "string");
    }
  });

  it("fade-up: progress 1 → opacity 1, no transform", () => {
    const result = resolveAnimation("fade-up", 1);
    assert.strictEqual(result.opacity, 1);
    assert(result.transform.includes("0px") || result.transform === "none");
  });

  it("scale-in: progress 0 → opacity 0, scale < 1", () => {
    const result = resolveAnimation("scale-in", 0);
    assert.strictEqual(result.opacity, 0);
    assert(result.transform.includes("scale"));
  });

  it("scale-in: progress 1 → opacity 1, scale(1)", () => {
    const result = resolveAnimation("scale-in", 1);
    assert.strictEqual(result.opacity, 1);
    assert(result.transform.includes("scale(1)"));
  });

  it("slide-in: uses direction to determine translate axis", () => {
    const up = resolveAnimation("slide-in", 0.5, "up");
    assert(up.transform.includes("translateY"));

    const left = resolveAnimation("slide-in", 0.5, "left");
    assert(left.transform.includes("translateX"));
  });

  it("fade-up by default for unknown type", () => {
    assert(!isKnownAnimationType("bogus-animation"));
    const result = resolveAnimation("bogus-animation" as never, 0.5);
    assert(typeof result.opacity === "number");
    // Should not throw, should degrade gracefully
  });

  it("getTransformSpace returns 2d for 2d types", () => {
    assert.strictEqual(getTransformSpace("fade-up"), "2d");
    assert.strictEqual(getTransformSpace("scale-in"), "2d");
  });

  it("getTransformSpace returns 3d for flip-3d", () => {
    assert.strictEqual(getTransformSpace("flip-3d"), "3d");
  });
});

// ── Transition Registry ─────────────────────────────────────────────────────

describe("TransitionRegistry", () => {
  it("all known transitions resolve without throwing", () => {
    for (const type of listTransitionTypes()) {
      const result = resolveTransition(type, 0.5);
      assert(typeof result.slideA.opacity === "number");
      assert(typeof result.slideB.opacity === "number");
    }
  });

  it("plain-crossfade: progress 0 → A visible, B hidden", () => {
    const result = resolveTransition("plain-crossfade", 0);
    assert.strictEqual(result.slideA.opacity, 1);
    assert.strictEqual(result.slideB.opacity, 0);
  });

  it("plain-crossfade: progress 1 → A hidden, B visible", () => {
    const result = resolveTransition("plain-crossfade", 1);
    assert.strictEqual(result.slideA.opacity, 0);
    assert.strictEqual(result.slideB.opacity, 1);
  });

  it("glow-crossfade has effects with glowIntensity", () => {
    const result = resolveTransition("glow-crossfade", 0.5);
    assert(result.effects !== undefined);
    assert(typeof result.effects.glowIntensity === "number");
    assert(result.effects.glowIntensity > 0);
  });

  it("depth-slide has translateX in slideA and slideB", () => {
    const result = resolveTransition("depth-slide", 0.5);
    assert(result.slideA.transform.includes("translateX"));
    assert(result.slideB.transform.includes("translateX"));
  });

  it("unknown transition falls back to plain-crossfade", () => {
    assert(!isKnownTransitionType("bogus-transition"));
    const result = resolveTransition("bogus-transition" as never, 0.5);
    assert.strictEqual(result.slideA.opacity, 0.5);
    assert.strictEqual(result.slideB.opacity, 0.5);
  });
});

// ── Easing ──────────────────────────────────────────────────────────────────

describe("parseEasing", () => {
  it("parses named easings", () => {
    assert.strictEqual(parseEasing("linear")(0.5), 0.5);
    assert.strictEqual(parseEasing("ease-in")(0), 0);
    assert.strictEqual(parseEasing("ease-in")(1), 1);
    assert.strictEqual(parseEasing("ease-out")(0), 0);
    assert.strictEqual(parseEasing("ease-out")(1), 1);
  });

  it("parses cubic-bezier strings", () => {
    const fn = parseEasing("cubic-bezier(0.16, 1, 0.3, 1)");
    assert.strictEqual(fn(0), 0);
    assert.strictEqual(fn(1), 1);
    assert(fn(0.3) > 0.3); // ease-out-expo goes above linear in early portion
  });

  it("falls back to ease-out for unknown strings", () => {
    const fn = parseEasing("rubber-band");
    assert.strictEqual(fn(0), 0);
    assert.strictEqual(fn(1), 1);
  });

  it("caches parsed functions", () => {
    const a = parseEasing("ease-out-expo");
    const b = parseEasing("ease-out-expo");
    assert.strictEqual(a, b);
  });
});

// ── expandStagger ───────────────────────────────────────────────────────────

describe("expandStagger", () => {
  it("expands stagger spec into individual tracks", () => {
    const result = expandStagger({
      elementIds: ["b1", "b2", "b3"],
      staggerDelay: 80,
      childAnimation: { type: "fade-up", duration: 400, easing: "ease-out" },
      groupStart: 500,
    });

    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].elementId, "b1");
    assert.strictEqual(result[0].enter.start, 500);
    assert.strictEqual(result[1].elementId, "b2");
    assert.strictEqual(result[1].enter.start, 580);
    assert.strictEqual(result[2].elementId, "b3");
    assert.strictEqual(result[2].enter.start, 660);
  });

  it("preserves child animation properties", () => {
    const result = expandStagger({
      elementIds: ["b1"],
      staggerDelay: 80,
      childAnimation: { type: "scale-in", duration: 500, easing: "ease-out-expo" },
      groupStart: 0,
    });

    assert.strictEqual(result[0].enter.type, "scale-in");
    assert.strictEqual(result[0].enter.duration, 500);
    assert.strictEqual(result[0].enter.easing, "ease-out-expo");
  });
});

// ── Presets ─────────────────────────────────────────────────────────────────

describe("presets", () => {
  it("all presets have valid recipes", () => {
    const presetNames: Array<"cinematic" | "minimal" | "energetic" | "editorial"> = [
      "cinematic", "minimal", "energetic", "editorial",
    ];
    for (const name of presetNames) {
      const recipe = getPresetRecipe(name);
      assert(typeof recipe.transition === "string");
      assert(isKnownTransitionType(recipe.transition));
      assert(recipe.transitionDuration > 0);
      assert(recipe.transitionOverlap >= 0);
      assert(typeof recipe.defaultAnimation.type === "string");
      assert(isKnownAnimationType(recipe.defaultAnimation.type));
    }
  });

  it("resolvePresetAnimation returns valid animation spec", () => {
    const spec = resolvePresetAnimation("cinematic", "title", 0);
    assert.strictEqual(spec.start, 0);
    assert.strictEqual(spec.type, "fade-up");
    assert(spec.duration > 0);
  });

  it("resolvePresetAnimation uses element override when provided", () => {
    const spec = resolvePresetAnimation("cinematic", "title", 100, {
      type: "scale-in",
      duration: 300,
    });
    assert.strictEqual(spec.start, 100);
    assert.strictEqual(spec.type, "scale-in");
    assert.strictEqual(spec.duration, 300);
  });

  it("energetic stagger delay is fastest (50ms)", () => {
    assert.strictEqual(getPresetStaggerDelay("energetic"), 50);
    assert(getPresetStaggerDelay("minimal") > 50);
    assert(getPresetStaggerDelay("cinematic") > 50);
  });

  it("preset transitions are all registered", () => {
    const names: Array<"cinematic" | "minimal" | "energetic" | "editorial"> = [
      "cinematic", "minimal", "energetic", "editorial",
    ];
    for (const name of names) {
      assert(isKnownTransitionType(getPresetTransition(name)));
    }
  });
});

// ── computeAnimationProgress ────────────────────────────────────────────────

describe("computeAnimationProgress", () => {
  it("returns 0 for before-enter", () => {
    assert.strictEqual(computeAnimationProgress(0, anim("fade-up", 100, 500), "before-enter"), 0);
  });

  it("returns 1 for holding", () => {
    assert.strictEqual(computeAnimationProgress(0, anim("fade-up", 100, 500), "holding"), 1);
  });

  it("returns 0 for after-exit", () => {
    assert.strictEqual(computeAnimationProgress(0, anim("fade-up", 100, 500), "after-exit"), 0);
  });

  it("returns partial progress during entering", () => {
    const p = computeAnimationProgress(600, anim("fade-up", 500, 1000, "linear"), "entering");
    assert(p > 0.09 && p < 0.11); // 100ms into 1000ms = 0.1
  });

  it("reverse progresses during exiting", () => {
    // exit starts at 3000, duration 1000, t=3200 → raw = 1 - (200/1000) = 0.8
    const p = computeAnimationProgress(3200, anim("fade-up", 3000, 1000, "linear"), "exiting");
    assert(p > 0.79 && p < 0.81);
  });
});

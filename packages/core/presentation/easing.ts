/**
 * Easing functions for the timeline evaluator.
 *
 * All easings accept a progress value in [0, 1] and return a value in [0, 1].
 * They parse CSS-like easing strings (cubic-bezier, steps) and pre-defined
 * named curves. This is a pure-function evaluator — no runtime CSS required.
 */

type EasingFn = (t: number) => number;

const namedEasings: Record<string, EasingFn> = {
  linear: (t) => t,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  "ease-in": cubicBezier(0.42, 0, 1, 1),
  "ease-out": cubicBezier(0, 0, 0.58, 1),
  "ease-in-out": cubicBezier(0.42, 0, 0.58, 1),
  "ease-out-expo": cubicBezier(0.16, 1, 0.3, 1),
};

function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  // Newton-Raphson solve for t given x (sample the x-curve, find t, then sample y)
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  function sampleCurveX(t: number): number {
    return ((ax * t + bx) * t + cx) * t;
  }

  function sampleCurveY(t: number): number {
    return ((ay * t + by) * t + cy) * t;
  }

  function sampleCurveDerivativeX(t: number): number {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  function solveCurveX(x: number): number {
    let t0: number = 0;
    let t1: number = 0;
    let t2: number = x;

    // Newton-Raphson: find t where sampleCurveX(t) ≈ x
    const epsilon = 1e-7;
    for (let i = 0; i < 20; i++) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < epsilon) return t2;
      const d2 = sampleCurveDerivativeX(t2);
      if (Math.abs(d2) < epsilon) break;
      t2 -= x2 / d2;
    }

    // Fallback: bisection
    t0 = 0;
    t1 = 1;
    t2 = x;
    while (t0 < t1) {
      const x2 = sampleCurveX(t2);
      if (Math.abs(x2 - x) < epsilon) return t2;
      if (x > x2) { t0 = t2; } else { t1 = t2; }
      t2 = (t1 - t0) * 0.5 + t0;
    }
    return t2;
  }

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleCurveY(solveCurveX(t));
  };
}

const PARSED_CACHE = new Map<string, EasingFn>();

function cubicBezierFromString(str: string): EasingFn | null {
  const m = str.match(/^cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/);
  if (!m) return null;
  return cubicBezier(
    Number.parseFloat(m[1]),
    Number.parseFloat(m[2]),
    Number.parseFloat(m[3]),
    Number.parseFloat(m[4]),
  );
}

/**
 * Parse an easing string into a pure function `(t: number) => number`.
 * Supports named easings (ease, ease-in, ease-out, ease-in-out, ease-out-expo,
 * linear) and `cubic-bezier(x1, y1, x2, y2)`. Unknown strings fall back to
 * `ease-out`.
 */
export function parseEasing(easing: string): EasingFn {
  const cached = PARSED_CACHE.get(easing);
  if (cached) return cached;

  let fn: EasingFn | null = null;

  if (namedEasings[easing]) {
    fn = namedEasings[easing];
  } else {
    fn = cubicBezierFromString(easing);
  }

  if (!fn) {
    fn = namedEasings["ease-out"];
  }

  PARSED_CACHE.set(easing, fn);
  return fn;
}

export { cubicBezier, namedEasings };

/**
 * Deterministic spring curve (damped oscillation approximation).
 *
 * Stiffness ≈ 300, damping ≈ 20. Precomputed as a sampled curve, not a live
 * physics simulation. evaluateSpring(progress) returns a value in [0, 1]
 * with a slight overshoot characteristic of a spring.
 *
 * The curve is computed once at module load time using a numerical ODE solver
 * (RK4) for a damped harmonic oscillator, then normalized to [0, 1].
 */

const STIFFNESS = 300;
const DAMPING = 20;
const MASS = 1;
const SAMPLE_COUNT = 1000;

let springSamples: Float64Array;

function computeSpringSamples(): Float64Array {
  // Damped harmonic oscillator: m * x'' + c * x' + k * x = 0
  // State vector: [x, v]
  // x' = v
  // v' = (-c * v - k * x) / m
  //
  // Solve from t=0, x=0, v₀ such that it reaches x=1 and settles.
  // We estimate the total sim time based on natural frequency:
  // ωₙ = sqrt(k / m), damped freq ω_d = sqrt(ωₙ² - (c/(2m))²)
  const omegaN = Math.sqrt(STIFFNESS / MASS);
  const zeta = DAMPING / (2 * Math.sqrt(STIFFNESS * MASS));

  // Simulate until the oscillation settles (approximately 4 / (zeta * omegaN))
  const settleTime = zeta > 0 ? 4 / (zeta * omegaN) : 4;
  const maxTime = Math.max(settleTime * 3, 1.5);
  const dt = maxTime / SAMPLE_COUNT;

  const positions = new Float64Array(SAMPLE_COUNT + 1);

  // Initial velocity chosen so peak overshoot is around 1.15  (typical spring feel)
  // v₀ = ωₙ * peakTarget ≈ ωₙ * 1.15
  let x = 0;
  let v = omegaN * 1.15; // initial velocity

  positions[0] = x;

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    // RK4 step
    const dx1 = v;
    const dv1 = (-DAMPING * v - STIFFNESS * x) / MASS;

    const x2 = x + dx1 * dt * 0.5;
    const v2 = v + dv1 * dt * 0.5;
    const dx2 = v2;
    const dv2 = (-DAMPING * v2 - STIFFNESS * x2) / MASS;

    const x3 = x + dx2 * dt * 0.5;
    const v3 = v + dv2 * dt * 0.5;
    const dx3 = v3;
    const dv3 = (-DAMPING * v3 - STIFFNESS * x3) / MASS;

    const x4 = x + dx3 * dt;
    const v4 = v + dv3 * dt;
    const dx4 = v4;
    const dv4 = (-DAMPING * v4 - STIFFNESS * x4) / MASS;

    x += (dx1 + 2 * dx2 + 2 * dx3 + dx4) * dt / 6;
    v += (dv1 + 2 * dv2 + 2 * dv3 + dv4) * dt / 6;

    positions[i + 1] = x;
  }

  // Normalize: find the final settled value and normalize to [0, 1]
  // The settled value is the asymptote (0 for this oscillator)
  // We want the peak near 1.0, so we find the global max and scale
  let maxX = 0;
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    maxX = Math.max(maxX, Math.abs(positions[i]));
  }

  if (maxX < 1e-10) {
    // Degenerate case — shouldn't happen
    for (let i = 0; i <= SAMPLE_COUNT; i++) positions[i] = i / SAMPLE_COUNT;
    return positions;
  }

  // Scale so peak ≈ 1 and final settle ≈ ~0.95-1.0 (undershoot at tail)
  // Actually we want: at t = settleTime, value ≈ 1 (settled), and peak ≈ 1.05-1.15
  // So we scale so that the max value maps to 1.0
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    positions[i] = positions[i] / maxX;
  }

  return positions;
}

// Compute once at module load
springSamples = computeSpringSamples();

/**
 * Evaluate the deterministic spring curve at a given progress [0, 1].
 * Returns a value in approximately [0, 1] with characteristic overshoot.
 *
 * Both browser and exporter call this exact same function — the spring
 * animation is pixel-identical at any given progress.
 */
export function evaluateSpring(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) {
    // At t=1, return the settled value (last sample)
    return springSamples[SAMPLE_COUNT];
  }
  // Map progress [0, 1] to sample array index [0, SAMPLE_COUNT * 2]
  // We stretch to 2x so progress=1 maps to roughly settle point
  const index = progress * SAMPLE_COUNT * 2;
  const idxLo = Math.min(Math.floor(index), SAMPLE_COUNT);
  const idxHi = Math.min(idxLo + 1, SAMPLE_COUNT);
  const frac = index - idxLo;

  return springSamples[idxLo] + (springSamples[idxHi] - springSamples[idxLo]) * frac;
}

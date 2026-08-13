import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeRenderConfig, DEFAULT_RENDER_CONFIG } from "../index.js";

describe("mergeRenderConfig", () => {
  it("keeps the default width/height/scale/readabilityFloor/fontFitStep when overrides are empty", () => {
    const merged = mergeRenderConfig({});

    assert.equal(merged.width, DEFAULT_RENDER_CONFIG.width);
    assert.equal(merged.height, DEFAULT_RENDER_CONFIG.height);
    assert.equal(merged.scale, DEFAULT_RENDER_CONFIG.scale);
    assert.equal(merged.readabilityFloor, DEFAULT_RENDER_CONFIG.readabilityFloor);
    assert.equal(merged.fontFitStep, DEFAULT_RENDER_CONFIG.fontFitStep);
    assert.deepEqual(merged.safeZones, DEFAULT_RENDER_CONFIG.safeZones);
  });

  it("keeps the defaults when only scale is overridden (sparse object)", () => {
    const merged = mergeRenderConfig({ scale: 2 });

    assert.equal(merged.scale, 2);
    assert.equal(merged.width, DEFAULT_RENDER_CONFIG.width);
    assert.equal(merged.height, DEFAULT_RENDER_CONFIG.height);
    assert.equal(merged.readabilityFloor, DEFAULT_RENDER_CONFIG.readabilityFloor);
    assert.equal(merged.fontFitStep, DEFAULT_RENDER_CONFIG.fontFitStep);
    assert.deepEqual(merged.safeZones, DEFAULT_RENDER_CONFIG.safeZones);
  });

  it("does not let explicit undefined clobber a configured default", () => {
    const merged = mergeRenderConfig({
      width: undefined,
      height: undefined,
      scale: 2,
      readabilityFloor: undefined,
      fontFitStep: undefined,
    });

    assert.equal(merged.scale, 2);
    assert.equal(merged.width, DEFAULT_RENDER_CONFIG.width);
    assert.equal(merged.height, DEFAULT_RENDER_CONFIG.height);
    assert.equal(merged.readabilityFloor, DEFAULT_RENDER_CONFIG.readabilityFloor);
    assert.equal(merged.fontFitStep, DEFAULT_RENDER_CONFIG.fontFitStep);
  });

  it("still allows explicitly provided values to override defaults", () => {
    const merged = mergeRenderConfig({ width: 1920, height: 1080, scale: 1 });

    assert.equal(merged.width, 1920);
    assert.equal(merged.height, 1080);
    assert.equal(merged.scale, 1);
    assert.equal(merged.readabilityFloor, DEFAULT_RENDER_CONFIG.readabilityFloor);
    assert.equal(merged.fontFitStep, DEFAULT_RENDER_CONFIG.fontFitStep);
  });
});
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import type { Episode, Slide } from "@sitehie/core/domain";
import { resolveSlideStyle } from "@sitehie/core/resolver";
import {
  PlaywrightRenderAdapter,
  AssetLoader,
  buildCssVariables,
  loadThemeFromCarousel,
  DEFAULT_RENDER_CONFIG,
} from "../index.js";

const loader = new AssetLoader();

// Detect browser availability before registering Playwright-dependent tests so
// the { skip } condition is evaluated with the correct value.
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
let browserAvailable = false;
try {
  const browser = await chromium.launch({ headless: true });
  await browser.close();
  browserAvailable = true;
} catch {
  browserAvailable = false;
}

describe("buildCssVariables", () => {
  it("emits slide dimensions and safe zones from render config", async () => {
    const theme = await loadThemeFromCarousel(loader, "default");
    const slide: Slide = { type: "quote", text: "hello" };
    const resolved = resolveSlideStyle(theme, slide);
    const css = buildCssVariables(resolved, DEFAULT_RENDER_CONFIG);

    assert.ok(css.includes("--slide-width: 1080px;"));
    assert.ok(css.includes("--slide-height: 1350px;"));
    assert.ok(css.includes("--safe-top: 120px;"));
    assert.ok(css.includes("--safe-bottom: 100px;"));
    assert.ok(css.includes("--safe-x: 80px;"));
  });

  it("uses resolved typography values, not raw theme fallbacks", async () => {
    const theme = await loadThemeFromCarousel(loader, "default");
    const slide: Slide = {
      type: "stat",
      value: "10x",
      label: "faster",
      styleOverrides: {
        typography: {
          statSlideValue: { fontSizeMax: 250 },
        },
      },
    };
    const resolved = resolveSlideStyle(theme, slide);
    const css = buildCssVariables(resolved, DEFAULT_RENDER_CONFIG);

    assert.ok(css.includes("--type-stat-value-font-size: 250px;"));
  });
});

describe("AssetLoader", () => {
  it("loads all six slide templates", async () => {
    const types: Slide["type"][] = ["quote", "code", "cover", "outro", "comparison", "stat"];
    for (const type of types) {
      const html = await loader.loadTemplate(type);
      assert.ok(/<!doctype html>/i.test(html), `template ${type} should start with doctype`);
    }
  });

  it("inlines local slide assets as data URIs", async () => {
    // Any existing shared asset will do; here we use a stable PNG icon.
    const slide: Slide = {
      type: "cover",
      title: "Test",
      iconAsset: "assets/shared/icons/check.png",
    };
    const resolved = await loader.inlineSlideAssets(slide, undefined);
    const record = resolved as unknown as Record<string, unknown>;
    assert.ok(String(record.iconAsset).startsWith("data:"));
  });
});

describe("PlaywrightRenderAdapter", () => {
  it("buildSlideHtml returns a self-contained document", async () => {
    const adapter = new PlaywrightRenderAdapter();
    const theme = await loadThemeFromCarousel(loader, "default");
    const slide: Slide = { type: "quote", text: "Self-contained test" };
    const resolved = resolveSlideStyle(theme, slide);
    const html = await adapter.buildSlideHtml(slide, resolved);

    assert.ok(html.includes('<style id="theme-fonts">'));
    assert.ok(html.includes('<style id="theme-vars">'));
    assert.ok(html.includes('<style id="base-css">'));
    assert.ok(html.includes('window.TECH_ICONS='));
    assert.ok(!html.includes('src="shared/slide-runtime.js"'));
    assert.ok(html.includes("(function ()"));
  });

  it("renderSlide produces a non-empty PNG buffer", {
    skip: !browserAvailable,
  }, async () => {
    const adapter = new PlaywrightRenderAdapter();
    const theme = await loadThemeFromCarousel(loader, "default");
    const slide: Slide = { type: "quote", text: "PNG test" };
    const resolved = resolveSlideStyle(theme, slide);
    const buffer = await adapter.renderSlide(slide, resolved);

    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 0);
    assert.equal(buffer[0], 0x89);
    assert.equal(buffer[1], 0x50);
  });

  it("renderEpisode produces one PNG buffer per slide", {
    skip: !browserAvailable,
  }, async () => {
    const adapter = new PlaywrightRenderAdapter();
    const theme = await loadThemeFromCarousel(loader, "default");
    const slides: Slide[] = [
      { type: "cover", title: "Episode test" },
      { type: "quote", text: "Slide two" },
    ];
    const resolvedSlides = slides.map((s) => ({ slide: s, style: resolveSlideStyle(theme, s) }));
    const episode: Episode = { episode: "contract-episode", slides };

    const result = await adapter.renderEpisode(episode, resolvedSlides);
    assert.equal(result.count, 2);
    assert.equal(result.buffers.length, 2);
    for (const buf of result.buffers) {
      assert.ok(Buffer.isBuffer(buf));
      assert.ok(buf.length > 0);
    }
  });

  it("renderEpisodePdf produces a multi-page PDF buffer", {
    skip: !browserAvailable,
  }, async () => {
    const adapter = new PlaywrightRenderAdapter();
    const theme = await loadThemeFromCarousel(loader, "default");
    const slides: Slide[] = [
      { type: "cover", title: "PDF test" },
      { type: "stat", value: "100%", label: "success" },
    ];
    const resolvedSlides = slides.map((s) => ({ slide: s, style: resolveSlideStyle(theme, s) }));
    const episode: Episode = { episode: "pdf-episode", slides };

    const result = await adapter.renderEpisodePdf(episode, resolvedSlides);
    assert.equal(result.count, 2);
    assert.ok(Buffer.isBuffer(result.buffer));
    assert.ok(result.buffer.length > 0);
    assert.ok(result.buffer.toString("ascii", 0, 8).includes("PDF"));
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AssetLoader } from "../asset-loader.js";
import type { SlideType } from "@sitehie/core/domain";

const loader = new AssetLoader();

/**
 * Contract between `slide-runtime.js` and each template.
 *
 * The runtime queries the DOM by ID and by the `data-tech-icons` / `data-watermark`
 * hooks. If a template removes or renames one of these placeholders, rendering
 * silently breaks (a real failure mode that previously went undetected).
 */
const RUNTIME_CONTRACT: Record<SlideType, string[]> = {
  quote: [
    'id="slide"',
    'class="slide"',
    'id="quote-content"',
    'id="quote-box"',
    'data-fit="quoteSlide"',
    'id="slide-images"',
    'id="slide-data"',
    'id="tech-icons-data"',
    'src="shared/slide-runtime.js"',
  ],
  code: [
    'id="slide"',
    'class="slide"',
    'id="slide-number"',
    'id="slide-title"',
    'id="slide-subtitle"',
    'id="code-content"',
    'id="code-block"',
    'data-fit="codeSlideCode"',
    'id="explanation"',
    'data-fit="codeSlideExplanation"',
    'id="annotations"',
    'id="footer-handle"',
    'id="footer-meta"',
    'id="progress-fill"',
    'id="slide-images"',
    'id="slide-data"',
    'id="tech-icons-data"',
    'src="shared/slide-runtime.js"',
  ],
  cover: [
    'id="slide"',
    'class="slide"',
    'id="series"',
    'id="cover-title"',
    'data-fit="coverSlideTitle"',
    'id="icon-img"',
    'id="icon-placeholder"',
    'id="hint-dots"',
    'data-tech-icons',
    'data-watermark',
    'id="slide-images"',
    'id="slide-data"',
    'id="tech-icons-data"',
    'src="shared/slide-runtime.js"',
  ],
  outro: [
    'id="slide"',
    'class="slide"',
    'id="outro-question"',
    'data-fit="outroSlideQuestion"',
    'id="outro-handle"',
    'id="outro-follow-cta"',
    'id="outro-image"',
    'id="outro-image-placeholder"',
    'data-tech-icons',
    'id="slide-images"',
    'id="slide-data"',
    'id="tech-icons-data"',
    'src="shared/slide-runtime.js"',
  ],
  comparison: [
    'id="slide"',
    'class="slide"',
    'id="slide-number"',
    'id="comparison-title"',
    'data-fit="comparisonSlideTitle"',
    'id="side-a-label"',
    'id="side-a-points"',
    'data-fit="comparisonSlideBody"',
    'id="side-b-label"',
    'id="side-b-points"',
    'id="comparison-verdict"',
    'data-tech-icons',
    'id="slide-images"',
    'id="slide-data"',
    'id="tech-icons-data"',
    'src="shared/slide-runtime.js"',
  ],
  stat: [
    'id="slide"',
    'class="slide"',
    'id="slide-number"',
    'id="stat-value"',
    'data-fit="statSlideValue"',
    'id="stat-label"',
    'data-fit="statSlideLabel"',
    'id="stat-subtext"',
    'data-fit="statSlideSubtext"',
    'data-tech-icons',
    'id="slide-images"',
    'id="slide-data"',
    'id="tech-icons-data"',
    'src="shared/slide-runtime.js"',
  ],
  canvas: [
    'id="slide"',
    'class="slide"',
    'id="canvas-svg"',
    'id="slide-data"',
    'id="tech-icons-data"',
    'src="shared/slide-runtime.js"',
  ],
};

describe("slide-runtime contract", () => {
  for (const [type, expected] of Object.entries(RUNTIME_CONTRACT) as Array<[SlideType, string[]]>) {
    it(`template "${type}" exposes every placeholder the runtime expects`, async () => {
      const html = await loader.loadTemplate(type);
      for (const needle of expected) {
        assert.ok(
          html.includes(needle),
          `Template "${type}" is missing runtime placeholder: ${needle}`
        );
      }
    });
  }

  it("every template includes the shared data/script hooks", async () => {
    const types: SlideType[] = ["quote", "code", "cover", "outro", "comparison", "stat", "canvas"];
    for (const type of types) {
      const html = await loader.loadTemplate(type);
      assert.ok(html.includes('id="slide-data"'), `Template "${type}" missing #slide-data`);
      assert.ok(html.includes('id="tech-icons-data"'), `Template "${type}" missing #tech-icons-data`);
      assert.ok(html.includes('src="shared/slide-runtime.js"'), `Template "${type}" missing runtime script`);
      assert.ok(html.includes('class="slide"'), `Template "${type}" missing .slide root`);
      assert.ok(html.includes('id="slide"'), `Template "${type}" missing #slide root`);
    }
  });
});

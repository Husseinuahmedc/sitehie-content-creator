import { chromium, type Page } from "playwright";
import { PDFDocument } from "pdf-lib";
import type { Episode, Slide, SlideType } from "@sitehie/core/domain";
import type { ResolvedStyle } from "@sitehie/core/resolver";
import type {
  RenderAdapter,
  SlideMeta,
  RenderOptions,
  ResolvedSlide,
  EpisodeRenderResult,
  PdfRenderResult,
  RenderProgress,
  RenderWarning,
} from "@sitehie/core/ports";
import { AssetLoader, DEFAULT_RENDER_CONFIG, mergeRenderConfig, type RenderConfig } from "./asset-loader.js";
import { buildCssVariables } from "./css-variables.js";
import { highlightCodeToHtml } from "./highlight.js";
import { replaceOnce } from "./html-utils.js";

export type PlaywrightRenderAdapterOptions = {
  /** Path to the carousel-tool package (templates, assets, themes). */
  carouselRoot?: string;
  /** Render defaults; any omitted key falls back to {@link DEFAULT_RENDER_CONFIG}. */
  config?: Partial<RenderConfig>;
};

/**
 * Playwright-backed implementation of {@link RenderAdapter}.
 *
 * Inputs are domain objects and already-resolved styles only. This class has
 * zero knowledge of storage IDs, file CRUD, autosave, or history.
 */
export class PlaywrightRenderAdapter implements RenderAdapter {
  private readonly loader: AssetLoader;
  private readonly config: RenderConfig;

  constructor(options: PlaywrightRenderAdapterOptions = {}) {
    this.loader = new AssetLoader(options.carouselRoot);
    this.config = mergeRenderConfig(options.config);
  }

  /** Render a single slide to a PNG buffer. */
  async renderSlide(slide: Slide, style: ResolvedStyle, meta?: SlideMeta): Promise<Buffer> {
    const html = await this.buildSlideHtml(slide, style, meta);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: this.config.width, height: this.config.height },
        deviceScaleFactor: this.config.scale,
      });
      const page = await context.newPage();
      await this.renderToPage(page, html);
      const buffer = await page.locator("#slide").screenshot({ type: "png" });
      await context.close();
      return buffer;
    } finally {
      await browser.close();
    }
  }

  /** Render all slides of an episode to PNG buffers. */
  async renderEpisode(
    episode: Episode,
    resolvedSlides: ResolvedSlide[],
    options?: RenderOptions
  ): Promise<EpisodeRenderResult> {
    const config = applyRenderOptions(this.config, options);
    const prepared = await this.prepareEpisode(episode, resolvedSlides);
    const warnings: RenderWarning[] = [];
    const buffers: Buffer[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: config.width, height: config.height },
        deviceScaleFactor: config.scale,
      });
      const page = await context.newPage();

      for (let i = 0; i < prepared.length; i++) {
        const item = prepared[i];
        const pageWarnings = await this.renderToPage(page, item.html, config);
        for (const w of pageWarnings) {
          warnings.push({ slide: item.index, message: typeof w === "string" ? w : JSON.stringify(w) });
        }
        const buffer = await page.locator("#slide").screenshot({ type: "png" });
        buffers.push(buffer);

        options?.onProgress?.({
          index: item.index,
          total: prepared.length,
          type: item.type,
        } as RenderProgress);
      }

      await context.close();
    } finally {
      await browser.close();
    }

    return { count: buffers.length, buffers, warnings };
  }

  /** Render all slides of an episode to a single multi-page PDF buffer. */
  async renderEpisodePdf(
    episode: Episode,
    resolvedSlides: ResolvedSlide[],
    options?: RenderOptions
  ): Promise<PdfRenderResult> {
    const config = applyRenderOptions(this.config, options);
    const prepared = await this.prepareEpisode(episode, resolvedSlides);
    const warnings: RenderWarning[] = [];
    const pageBuffers: Buffer[] = [];

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: config.width, height: config.height },
      });
      const page = await context.newPage();

      for (let i = 0; i < prepared.length; i++) {
        const item = prepared[i];
        await page.setContent(item.html, { waitUntil: "networkidle" });
        await this.injectRuntimeConfig(page, config);
        await page.waitForFunction(
          () => document.documentElement.getAttribute("data-ready") === "true",
          { timeout: 15000 }
        );
        await page.evaluate(async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = window as any;
          if (w.__slideReady) await w.__slideReady;
          await document.fonts.ready;
        });

        const fitWarnings = await page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (window as any).__fitWarnings || [];
        });
        for (const w of fitWarnings) {
          warnings.push({ slide: item.index, message: JSON.stringify(w) });
        }

        const buf = await page.pdf({
          width: `${config.width}px`,
          height: `${config.height}px`,
          printBackground: true,
          pageRanges: "1",
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        pageBuffers.push(buf);

        options?.onProgress?.({
          index: item.index,
          total: prepared.length,
          type: item.type,
        } as RenderProgress);
      }

      await context.close();
    } finally {
      await browser.close();
    }

    const merged = await PDFDocument.create();
    for (const buf of pageBuffers) {
      const doc = await PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const p of pages) merged.addPage(p);
    }
    merged.setTitle(`${episode.episode || "episode"} — sitehie carousel`);
    merged.setProducer("sitehie-render-engine");
    const pdfBytes = await merged.save();
    return { count: pageBuffers.length, buffer: Buffer.from(pdfBytes), warnings };
  }

  /**
   * Build the fully self-contained HTML for one slide. Public so callers can
   * preview or cache the same document Playwright consumes.
   */
  async buildSlideHtml(slide: Slide, style: ResolvedStyle, meta?: SlideMeta): Promise<string> {
    const type = slide.type;
    const template = await this.loader.loadTemplate(type);
    const [fontCss, baseCss, runtime, techIcons] = await Promise.all([
      this.loader.buildFontFaceCss(style.fonts),
      this.loader.loadBaseCss(),
      this.loader.loadRuntime(),
      this.loader.loadTechIcons(),
    ]);

    const resolvedSlide = await this.loader.inlineSlideAssets(slide, style.name);
    if (type === "code") {
      const codeSlide = resolvedSlide as unknown as { code?: string; language?: string; codeHtml?: string };
      if (codeSlide.code) {
        codeSlide.codeHtml = highlightCodeToHtml(codeSlide.code, codeSlide.language);
      }
    }

    const payload = {
      slide: resolvedSlide,
      meta: meta ?? {},
      theme: {
        layout: style.layout,
        typography: style.typography,
        brand: style.brand || {},
        colors: style.colors,
      },
    };

    let html = template;
    html = replaceOnce(html, '<style id="theme-fonts"></style>', `<style id="theme-fonts">${fontCss}</style>`);
    html = replaceOnce(
      html,
      '<style id="theme-vars"></style>',
      `<style id="theme-vars">${buildCssVariables(style, this.config)}</style>`
    );
    html = replaceOnce(
      html,
      '<script type="application/json" id="slide-data"></script>',
      `<script type="application/json" id="slide-data">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`
    );

    const family = style.family || "dark";
    html = replaceOnce(
      html,
      '<div class="slide" id="slide">',
      `<div class="slide" id="slide" data-theme="${family}">`
    );

    html = replaceOnce(
      html,
      '<link rel="stylesheet" href="shared/base.css" />',
      `<style id="base-css">${baseCss}</style>`
    );
    html = replaceOnce(
      html,
      '<script id="tech-icons-data"></script>',
      `<script id="tech-icons-data">window.TECH_ICONS=${JSON.stringify(techIcons).replace(/</g, "\\u003c")};</script>`
    );
    html = html.replace('<script src="shared/slide-runtime.js"></script>', () => {
      return `<script>${runtime.replace(/<\/script/gi, "<\\/script")}</script>`;
    });

    return html;
  }

  /** Prepare every slide HTML document for an episode. */
  private async prepareEpisode(
    episode: Episode,
    resolvedSlides: ResolvedSlide[]
  ): Promise<Array<{ index: number; type: SlideType; html: string }>> {
    const slides = episode.slides;
    const total = slides.length;
    const readingTime = episode.readingTime ?? Math.max(1, Math.ceil(total * 0.4));

    const out: Array<{ index: number; type: SlideType; html: string }> = [];
    for (let i = 0; i < total; i++) {
      const slide = slides[i];
      const resolved = resolvedSlides[i];
      if (!resolved) throw new Error(`Missing resolved style for slide ${i}`);
      const meta: SlideMeta = {
        slideIndex: i + 1,
        totalSlides: total,
        progressPct: Math.round(((i + 1) / total) * 100),
        series: episode.series || "",
        episode: episode.episode || "episode",
        readingTime,
        handle: resolved.style.brand?.handle || "@sitehie",
      };
      const html = await this.buildSlideHtml(slide, resolved.style, meta);
      out.push({ index: i + 1, type: slide.type, html });
    }
    return out;
  }

  /** Set page content, inject runtime config, wait for slide-ready signal. */
  private async renderToPage(page: Page, html: string, config?: RenderConfig): Promise<unknown[]> {
    const cfg = config ?? this.config;
    await page.setContent(html, { waitUntil: "networkidle" });
    await this.injectRuntimeConfig(page, cfg);
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-ready") === "true",
      { timeout: 15000 }
    );
    return await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (w.__slideReady) await w.__slideReady;
      return w.__fitWarnings || [];
    });
  }

  private async injectRuntimeConfig(page: Page, config: RenderConfig): Promise<void> {
    await page.evaluate(
      ({ floor, fitStep }: { floor: number; fitStep: number }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        w.__readabilityFloor = floor;
        w.__fontFitStep = fitStep;
      },
      { floor: config.readabilityFloor, fitStep: config.fontFitStep }
    );
  }
}

function applyRenderOptions(base: RenderConfig, options?: RenderOptions): RenderConfig {
  if (!options) return base;
  return mergeRenderConfig({
    width: options.width,
    height: options.height,
    scale: options.scale,
    readabilityFloor: options.readabilityFloor,
    fontFitStep: options.fontFitStep,
  });
}

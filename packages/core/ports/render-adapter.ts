import type { Episode } from "../domain/episode.js";
import type { Slide } from "../domain/slide.js";
import type { ResolvedStyle } from "../resolver/resolved-style.js";

export type SlideMeta = {
  slideIndex: number;
  totalSlides: number;
  progressPct: number;
  series?: string;
  episode: string;
  readingTime: number;
  handle?: string;
};

/**
 * A slide together with its fully resolved style. This is the unit the renderer
 * consumes; callers resolve per-slide styles before invoking the adapter.
 */
export type ResolvedSlide = {
  slide: Slide;
  style: ResolvedStyle;
};

export type RenderWarning = {
  slide: number;
  message: string;
};

export type RenderProgress = {
  index: number;
  total: number;
  type: string;
};

export type RenderOptions = {
  width?: number;
  height?: number;
  scale?: number;
  readabilityFloor?: number;
  fontFitStep?: number;
  onProgress?: (info: RenderProgress) => void;
};

export type EpisodeRenderResult = {
  count: number;
  buffers: Buffer[];
  warnings: RenderWarning[];
};

export type PdfRenderResult = {
  count: number;
  buffer: Buffer;
  warnings: RenderWarning[];
};

/**
 * Rendering contract. Inputs are domain objects plus resolved styles; the
 * adapter must not accept storage IDs or perform its own storage lookups.
 */
export interface RenderAdapter {
  /** Render a single slide to a PNG buffer. */
  renderSlide(slide: Slide, style: ResolvedStyle, meta?: SlideMeta): Promise<Buffer>;

  /** Render all slides of an episode to PNG buffers. */
  renderEpisode(
    episode: Episode,
    resolvedSlides: ResolvedSlide[],
    options?: RenderOptions
  ): Promise<EpisodeRenderResult>;

  /** Render all slides of an episode to a single multi-page PDF buffer. */
  renderEpisodePdf(
    episode: Episode,
    resolvedSlides: ResolvedSlide[],
    options?: RenderOptions
  ): Promise<PdfRenderResult>;
}

/**
 * AI Slide Arranger — theme-icon asset resolution.
 *
 * The provider prompt / HTTP / validation logic that used to live here has
 * moved behind the `AiAdapter` port (wired in `lib/adapters.ts` via
 * `@sitehie/ai-tools`). This file now only holds the filesystem asset
 * enrichment the adapters deliberately do not do (they never read the carousel
 * asset directories), plus re-exports of the canonical draft types so the UI
 * imports a single definition from `@sitehie/core/domain`.
 */
import fs from "node:fs/promises";
import path from "node:path";

import type { DraftSlide } from "@sitehie/core/domain";

export type { DraftParagraph, DraftImage, DraftSlide, ArrangeResult } from "@sitehie/core/domain";

// ── Image resolution ───────────────────────────────────────

export async function resolveAssetsForSlides(
  slides: DraftSlide[],
  themeName: string,
  carouselRoot: string
): Promise<DraftSlide[]> {
  const themeIconsDir = path.join(carouselRoot, "assets", "themes", themeName, "icons");
  const sharedIconsDir = path.join(carouselRoot, "assets", "shared", "icons");

  let themeFiles: string[] = [];
  let sharedFiles: string[] = [];

  try {
    themeFiles = await fs.readdir(themeIconsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[resolveAssetsForSlides] Failed to read ${themeIconsDir}:`, err);
    }
  }
  try {
    sharedFiles = await fs.readdir(sharedIconsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[resolveAssetsForSlides] Failed to read ${sharedIconsDir}:`, err);
    }
  }

  const allFiles = [
    ...themeFiles.map((f) => ({ file: f, base: `assets/themes/${themeName}/icons` })),
    ...sharedFiles.map((f) => ({ file: f, base: "assets/shared/icons" })),
  ];

  return slides.map((slide) => {
    if (slide.type !== "cover" && slide.type !== "body") return slide;

    const textWords = extractTextWords(slide);

    for (const { file, base } of allFiles) {
      const fileLower = file.toLowerCase();
      for (const word of textWords) {
        if (fileLower.includes(word)) {
          return {
            ...slide,
            image: { resolved: true, path: `${base}/${file}` },
          };
        }
      }
    }

    return {
      ...slide,
      image: { resolved: false, placeholder: true, note: "ضع صورة هنا" },
    };
  });
}

function extractTextWords(slide: DraftSlide): string[] {
  const sources: string[] = [];
  if (slide.title) sources.push(slide.title);
  if (slide.titleEn) sources.push(slide.titleEn);
  if (slide.paragraphs) {
    for (const p of slide.paragraphs) {
      sources.push(p.text);
    }
  }
  const combined = sources.join(" ").toLowerCase().replace(/[^\w\s\u0600-\u06FF]/g, " ");
  return combined.split(/\s+/).filter((w) => w.length > 2);
}
import type { ArrangeResult, DraftParagraph, DraftSlide } from "@sitehie/core/domain";

/**
 * Parsing and validation of LLM output into the domain's {@link ArrangeResult}.
 *
 * This module has no HTTP or prompt knowledge. It takes a raw string or
 * already-parsed JSON value and returns a validated result, normalizing small
 * model quirks such as the undocumented "title" alias for "cover".
 */

const VALID_TYPES = new Set(["cover", "code", "quote", "body", "title", "outro"]);

/** "title" is an undocumented alias for "cover" — small models sometimes emit it. */
const TYPE_ALIAS: Record<string, DraftSlide["type"]> = { title: "cover" };

export function cleanJsonResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

/**
 * Safety net: if a term appears in both highlights AND cyanWords of the same
 * paragraph, remove it from highlights (keep in cyanWords). Small models
 * sometimes duplicate — this ensures the exclusivity contract is enforced.
 */
function dedupParagraphHighlights(p: DraftParagraph): DraftParagraph {
  const hSet = new Set(p.highlights ?? []);
  const cSet = new Set(p.cyanWords ?? []);
  const overlaps: string[] = [];
  for (const w of hSet) {
    if (cSet.has(w)) overlaps.push(w);
  }
  if (overlaps.length === 0) return p;
  return {
    text: p.text,
    highlights: p.highlights?.filter((w) => !cSet.has(w)),
    cyanWords: p.cyanWords,
  };
}

export function validateArrangeResult(data: unknown): ArrangeResult {
  if (!data || typeof data !== "object") throw new Error("Response is not an object");
  const obj = data as Record<string, unknown>;

  if (typeof obj.suggestedCount !== "number" || obj.suggestedCount < 1) {
    throw new Error("Invalid suggestedCount");
  }
  if (typeof obj.suggestionReason !== "string") {
    throw new Error("Invalid suggestionReason");
  }
  if (!Array.isArray(obj.slides)) throw new Error("slides is not an array");

  const slides: DraftSlide[] = obj.slides.map((s: Record<string, unknown>, i: number) => {
    const rawType = s.type as string;
    if (!VALID_TYPES.has(rawType)) {
      throw new Error(`Invalid slide type "${rawType}" at index ${i}`);
    }
    const type = (TYPE_ALIAS[rawType] ?? rawType) as DraftSlide["type"];

    const paragraphs: DraftParagraph[] = [];
    if (Array.isArray(s.paragraphs)) {
      for (const p of s.paragraphs) {
        if (p && typeof p === "object") {
          const pObj = p as Record<string, unknown>;
          if (typeof pObj.text === "string") {
            paragraphs.push(
              dedupParagraphHighlights({
                text: pObj.text,
                highlights: Array.isArray(pObj.highlights)
                  ? pObj.highlights.filter((h): h is string => typeof h === "string")
                  : undefined,
                cyanWords: Array.isArray(pObj.cyanWords)
                  ? pObj.cyanWords.filter((c): c is string => typeof c === "string")
                  : undefined,
              })
            );
          }
        }
      }
    }

    const annotations: { text?: string; target?: string }[] = [];
    if (Array.isArray(s.annotations)) {
      for (const a of s.annotations) {
        if (a && typeof a === "object") {
          const aObj = a as Record<string, unknown>;
          annotations.push({
            text: typeof aObj.text === "string" ? aObj.text : undefined,
            target: typeof aObj.target === "string" ? aObj.target : undefined,
          });
        }
      }
    }

    const slide: DraftSlide = {
      type,
      title: typeof s.title === "string" ? s.title : undefined,
      titleEn: typeof s.titleEn === "string" ? s.titleEn : undefined,
      subtitleEn: typeof s.subtitleEn === "string" ? s.subtitleEn : undefined,
      paragraphs: paragraphs.length > 0 ? paragraphs : undefined,
      code: typeof s.code === "string" ? s.code : undefined,
      language: typeof s.language === "string" ? s.language : undefined,
      explanation: typeof s.explanation === "string" ? s.explanation : undefined,
      annotations: annotations.length > 0 ? annotations : undefined,
      question: typeof s.question === "string" ? s.question : undefined,
      imagePrompt: typeof s.imagePrompt === "string" ? s.imagePrompt : undefined,
    };

    return slide;
  });

  return {
    suggestedCount: obj.suggestedCount,
    suggestionReason: obj.suggestionReason,
    slides,
  };
}

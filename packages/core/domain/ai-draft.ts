/**
 * Content drafts produced by AI adapters.
 *
 * These are intentionally looser than the canonical {@link Slide} type: they
 * represent raw LLM output before conversion into real slides (e.g. a "body"
 * draft must be mapped to a concrete slide type by the caller).
 */

export type DraftParagraph = {
  text: string;
  highlights?: string[];
  cyanWords?: string[];
};

export type DraftImage =
  | { resolved: true; path: string }
  | { resolved: false; placeholder: true; note: string };

export type DraftSlide = {
  type: "cover" | "code" | "quote" | "body" | "outro";
  title?: string;
  titleEn?: string;
  subtitleEn?: string;
  paragraphs?: DraftParagraph[];
  code?: string;
  language?: string;
  explanation?: string;
  annotations?: { text?: string; target?: string }[];
  image?: DraftImage;
  question?: string;
  imagePrompt?: string;
};

export type ArrangeResult = {
  suggestedCount: number;
  suggestionReason: string;
  slides: DraftSlide[];
};

import type { Slide } from "./slide.js";

export type Episode = {
  episode: string;
  series?: string;
  readingTime?: number;
  slides: Slide[];
};

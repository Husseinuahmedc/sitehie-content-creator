"use client";

import { createStore } from "./store";
import { createInitialEpisodeSlice, type EpisodeSlice } from "./episode-slice";
import { createInitialThemeSlice, type ThemeSlice } from "./theme-slice";
import { createInitialUiSlice, type UiSlice } from "./ui-slice";
import { createInitialEditHistorySlice, type EditHistorySlice } from "./edit-history-slice";

export type StudioState = {
  episode: EpisodeSlice;
  theme: ThemeSlice;
  ui: UiSlice;
  history: EditHistorySlice;
};

/**
 * The single combined store. Slices import `store` from here to read
 * (`getState()`) and write (`setState(...)`); panels subscribe through the
 * per-slice `use*` selector hooks. Module-level circularity with the slice
 * files is intentional and safe: slices only touch `store` at call time.
 */
export const store = createStore<StudioState>({
  episode: createInitialEpisodeSlice(),
  theme: createInitialThemeSlice(),
  ui: createInitialUiSlice(),
  history: createInitialEditHistorySlice(),
});

// Expose the store for e2e/QA tooling and console debugging (dev only).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __studioStore?: typeof store }).__studioStore = store;
}

export type { ExternalStore } from "./store";

export * from "./episode-slice";
export * from "./theme-slice";
export * from "./ui-slice";
export * from "./edit-history-slice";
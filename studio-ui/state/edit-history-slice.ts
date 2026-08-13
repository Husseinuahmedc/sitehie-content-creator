"use client";

import type { Episode as EpisodeContent, Theme } from "@sitehie/core/domain";
import { store } from "./index";
import { resolveValue } from "./store";

/**
 * In-memory undo/redo history for the editing session. NOT persisted — the
 * persisted `/api/history` snapshots + HistoryPanel are a separate feature and
 * never touch this slice.
 *
 * Ownership model (deliberate deviation from two per-slice stacks):
 * `past`/`future` hold one globally-ordered log of BOTH episode and theme
 * edits, discriminated by `kind`. The Undo/Redo buttons are single/global
 * controls, so a per-slice pair of stacks (episode-slice owning content
 * history, theme-slice owning theme history) would need a shared recency
 * ordering just to answer "which stack does the button pop next" — that
 * coordination machinery is exactly what a shared ordered log gives us for
 * free. Slice ownership stays clean: episode-slice and theme-slice remain the
 * sole writers of their domain values and dirty flags; this slice is the sole
 * owner of history state and, on undo/redo, restores the entry's `before`/
 * `after` value onto the owning slice while flipping the correct dirty flag.
 * The episode/theme mutation actions record history by calling
 * `recordEpisodeEdit`/`recordThemeEdit` (mirroring how they already call
 * `setSaving`/`setStatus`/`setTab` from ui-slice).
 */

/**
 * A single undoable step. `before`/`after` are the domain values immediately
 * around the edit, so undo restores `before`, redo restores `after` — the
 * stacks never depend on "current value" reconstruction.
 */
export type EditEntry =
  | { kind: "episode"; before: EpisodeContent; after: EpisodeContent; beforeIndex: number; afterIndex: number }
  | { kind: "theme"; before: Theme; after: Theme };

export type EditHistorySlice = {
  past: EditEntry[];
  future: EditEntry[];
};

export function createInitialEditHistorySlice(): EditHistorySlice {
  return { past: [], future: [] };
}

export const useEditHistory = () => store.useStore((s) => s.history);
export const useCanUndo = () => store.useStore((s) => s.history.past.length > 0);
export const useCanRedo = () => store.useStore((s) => s.history.future.length > 0);

/** Record an episode edit: push {before, after, indices} onto past, clear redo stack. */
export const recordEpisodeEdit = (before: EpisodeContent, after: EpisodeContent, beforeIndex: number, afterIndex: number) =>
  store.setState((s) => ({
    ...s,
    history: { past: [...s.history.past, { kind: "episode", before, after, beforeIndex, afterIndex }], future: [] },
  }));

/** Record a theme edit: push {before, after} onto past, clear redo stack. */
export const recordThemeEdit = (before: Theme, after: Theme) =>
  store.setState((s) => ({
    ...s,
    history: { past: [...s.history.past, { kind: "theme", before, after }], future: [] },
  }));

/**
 * Undo the most recent edit (episode or theme). Restores the entry's `before`
 * value onto its owning slice, marks that slice dirty, and moves the entry
 * onto `future`. One atomic update: the value, dirty flag, and stacks change
 * together so `past`/`future` always describe the current content/theme.
 */
export const undo = () =>
  store.setState((s) => {
    if (s.history.past.length === 0) return s;
    const entry = s.history.past[s.history.past.length - 1];
    const past = s.history.past.slice(0, -1);
    const future = [...s.history.future, entry];
    if (entry.kind === "episode") {
      return {
        ...s,
        episode: { ...s.episode, content: entry.before, dirty: true, activeIndex: entry.beforeIndex },
        history: { past, future },
      };
    }
    return {
      ...s,
      theme: { ...s.theme, theme: entry.before, themeDirty: true },
      history: { past, future },
    };
  });

/** Redo the most recently-undone edit. Restores `after` + activeIndex, marks dirty. */
export const redo = () =>
  store.setState((s) => {
    if (s.history.future.length === 0) return s;
    const entry = s.history.future[s.history.future.length - 1];
    const future = s.history.future.slice(0, -1);
    const past = [...s.history.past, entry];
    if (entry.kind === "episode") {
      return {
        ...s,
        episode: { ...s.episode, content: entry.after, dirty: true, activeIndex: entry.afterIndex },
        history: { past, future },
      };
    }
    return {
      ...s,
      theme: { ...s.theme, theme: entry.after, themeDirty: true },
      history: { past, future },
    };
  });

/** Reset both stacks (used when navigating to a different episode/theme). */
export const clearEditHistory = () =>
  store.setState((s) => {
    if (s.history.past.length === 0 && s.history.future.length === 0) return s;
    return { ...s, history: { past: [], future: [] } };
  });

export const setEditHistory = (next: EditHistorySlice | ((prev: EditHistorySlice) => EditHistorySlice)) =>
  store.setState((s) => ({ ...s, history: resolveValue(next, s.history) }));
import type { Episode } from "./episode.js";
import type { Theme } from "./theme.js";

/**
 * A persisted snapshot of an episode at a point in time, optionally including
 * the theme that was active when the snapshot was taken.
 */
export type HistorySnapshot = {
  _snapshot: true;
  _timestamp: string;
  _episodeFile: string;
  content: Episode;
  theme: Theme | null;
};

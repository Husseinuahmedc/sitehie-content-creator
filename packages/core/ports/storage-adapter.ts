import type { Episode } from "../domain/episode.js";
import type { Theme } from "../domain/theme.js";
import type { HistorySnapshot } from "../domain/history-snapshot.js";

export type { HistorySnapshot } from "../domain/history-snapshot.js";

/**
 * The kind of entity stored by the carousel tool.
 */
export type StoredEntityType = "episode" | "theme";

/**
 * Every persisted write goes through the same save method so the adapter can
 * enforce exactly one locking / sequencing strategy. Explicit saves should
 * atomically clear any existing autosave for the same file under the same lock,
 * eliminating the stale-autosave race.
 */
export type WriteMode = "explicit" | "autosave";

export type ListedEpisode = {
  file: string;
  episode: string;
  series: string;
  slideCount: number;
};

export type ListedTheme = {
  file: string;
  name: string;
  description: string;
};

export type SaveResult = {
  filePath: string;
};

export type AutosaveInfo = {
  exists: true;
  autosaveTime: number;
  explicitTime: number;
  isStale: boolean;
  /** Untyped because the autosave slot may hold either an episode or a theme. */
  data: unknown;
};

export type HistorySnapshotListItem = {
  file: string;
  timestamp: string | null;
  episodeFile: string;
};

export type ThemeAsset = {
  name: string;
  path: string;
  url: string;
  source: "theme" | "shared";
};

/**
 * Storage contract for episodes, themes, autosaves, history snapshots, and
 * theme assets.
 *
 * Implementations own all I/O and concurrency: callers pass domain objects and
 * receive domain objects. The autosave race is fixed structurally by routing
 * every write through {@link saveEpisode} / {@link saveTheme} with a
 * {@link WriteMode}, letting the adapter hold one lock per file.
 */
export interface StorageAdapter {
  // Episodes
  listEpisodes(): Promise<ListedEpisode[]>;
  loadEpisode(fileName: string): Promise<Episode>;
  /**
   * Persist an episode. When `mode` is `"explicit"`, the adapter should also
   * delete any autosave for the same file under the same lock.
   */
  saveEpisode(
    fileName: string,
    episode: Episode,
    options?: { mode?: WriteMode }
  ): Promise<SaveResult>;
  deleteEpisode(fileName: string): Promise<void>;

  // Themes
  listThemes(): Promise<ListedTheme[]>;
  loadTheme(fileName: string): Promise<Theme>;
  /**
   * Persist a theme. When `mode` is `"explicit"`, the adapter should also
   * delete any autosave for the same file under the same lock.
   */
  saveTheme(
    fileName: string,
    theme: Theme,
    options?: { mode?: WriteMode }
  ): Promise<SaveResult>;
  deleteTheme(fileName: string): Promise<void>;

  // Autosave introspection / cleanup
  readAutosave(type: StoredEntityType, fileName: string): Promise<AutosaveInfo | null>;
  clearAutosave(type: StoredEntityType, fileName: string): Promise<void>;

  // History snapshots for episodes
  listHistorySnapshots(episodeFile: string): Promise<HistorySnapshotListItem[]>;
  loadHistorySnapshot(
    episodeFile: string,
    snapshotFile: string
  ): Promise<HistorySnapshot | null>;
  deleteHistorySnapshot(episodeFile: string, snapshotFile: string): Promise<void>;
  saveHistorySnapshot(
    episodeFile: string,
    content: Episode,
    theme: Theme | null
  ): Promise<HistorySnapshot>;

  // Assets available for a theme (used by AI adapters to match draft images)
  listAssetsForTheme(themeName: string): Promise<ThemeAsset[]>;
}

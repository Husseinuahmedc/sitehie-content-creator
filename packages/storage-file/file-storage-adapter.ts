import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Episode, Theme } from "@sitehie/core/domain";
import type {
  StorageAdapter,
  StoredEntityType,
  ListedEpisode,
  ListedTheme,
  SaveResult,
  AutosaveInfo,
  HistorySnapshotListItem,
  HistorySnapshot,
  ThemeAsset,
  WriteMode,
} from "@sitehie/core/ports";

export type FileStorageAdapterOptions = {
  /** Directory that mirrors the carousel-tool layout:
   *  - `{rootDir}/content` for episodes
   *  - `{rootDir}/themes` for themes
   *  - `{rootDir}/assets` for theme/shared assets
   */
  rootDir: string;
};

/**
 * Filesystem implementation of the core `StorageAdapter` port.
 *
 * All writes to a given file are sequenced through a per-file lock so explicit
 * saves and autosaves cannot race. An explicit save writes the canonical file
 * and, in the same locked step, deletes any autosave for that file. This
 * structurally prevents the stale-autosave race instead of relying on UI
 * debounce timing.
 */
export class FileStorageAdapter implements StorageAdapter {
  private readonly _rootDir: string;
  private readonly _contentDir: string;
  private readonly _themesDir: string;
  private readonly _historyDir: string;
  private readonly _autosaveDirs: Record<StoredEntityType, string>;
  private readonly _assetExts = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
    ".gif",
  ]);
  private readonly _maxHistory = 20;
  private readonly _locks = new Map<string, Promise<unknown>>();

  constructor(options: FileStorageAdapterOptions) {
    this._rootDir = path.resolve(options.rootDir);
    this._contentDir = path.join(this._rootDir, "content");
    this._themesDir = path.join(this._rootDir, "themes");
    this._historyDir = path.join(this._contentDir, ".history");
    this._autosaveDirs = {
      episode: path.join(this._contentDir, ".autosave"),
      theme: path.join(this._themesDir, ".autosave"),
    };
  }

  // ── Episodes ─────────────────────────────────────────────────────────────

  async listEpisodes(): Promise<ListedEpisode[]> {
    if (!existsSync(this._contentDir)) return [];

    const files = await fs.readdir(this._contentDir);
    const episodes: ListedEpisode[] = [];

    for (const f of files.filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      try {
        const c = (await this._readJson(path.join(this._contentDir, f))) as Episode;
        episodes.push({
          file: f,
          episode: c.episode || f.replace(/\.json$/, ""),
          series: c.series || "",
          slideCount: (c.slides || []).length,
        });
      } catch {
        /* skip unreadable */
      }
    }

    return episodes;
  }

  async loadEpisode(fileName: string): Promise<Episode> {
    const filePath = this._resolveEpisodePath(fileName);
    return (await this._readJson(filePath)) as Episode;
  }

  async saveEpisode(
    fileName: string,
    episode: Episode,
    options?: { mode?: WriteMode }
  ): Promise<SaveResult> {
    const safe = this._safeEpisodeFileName(fileName);
    const explicitPath = path.join(this._contentDir, safe);
    const mode = options?.mode ?? "explicit";

    return this._sequencedWrite("episode", safe, async () => {
      if (mode === "explicit") {
        await this._writeJson(explicitPath, episode);
        await this._deleteAutosaveFile("episode", safe);
        return { filePath: explicitPath };
      } else {
        const autosavePath = this._autosavePath("episode", safe);
        await this._writeJson(autosavePath, episode);
        return { filePath: autosavePath };
      }
    });
  }

  async deleteEpisode(fileName: string): Promise<void> {
    const safe = this._safeEpisodeFileName(fileName);
    const filePath = path.join(this._contentDir, safe);

    await this._sequencedWrite("episode", safe, async () => {
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }
      await this._deleteAutosaveFile("episode", safe);
    });
  }

  // ── Themes ───────────────────────────────────────────────────────────────

  async listThemes(): Promise<ListedTheme[]> {
    if (!existsSync(this._themesDir)) return [];

    const files = await fs.readdir(this._themesDir);
    const themes: ListedTheme[] = [];

    for (const f of files.filter((x) => x.endsWith(".theme.json"))) {
      try {
        const t = (await this._readJson(path.join(this._themesDir, f))) as Theme;
        themes.push({
          file: f,
          name: t.name || f.replace(/\.theme\.json$/, ""),
          description: t.description || "",
        });
      } catch {
        themes.push({ file: f, name: f, description: "(unreadable)" });
      }
    }

    return themes;
  }

  async loadTheme(fileName: string): Promise<Theme> {
    const filePath = this._resolveThemePath(fileName);
    return (await this._readJson(filePath)) as Theme;
  }

  async saveTheme(
    fileName: string,
    theme: Theme,
    options?: { mode?: WriteMode }
  ): Promise<SaveResult> {
    const safe = this._safeThemeFileName(fileName);
    const explicitPath = path.join(this._themesDir, safe);
    const mode = options?.mode ?? "explicit";

    return this._sequencedWrite("theme", safe, async () => {
      if (mode === "explicit") {
        await this._writeJson(explicitPath, theme);
        await this._deleteAutosaveFile("theme", safe);
        return { filePath: explicitPath };
      } else {
        const autosavePath = this._autosavePath("theme", safe);
        await this._writeJson(autosavePath, theme);
        return { filePath: autosavePath };
      }
    });
  }

  async deleteTheme(fileName: string): Promise<void> {
    const safe = this._safeThemeFileName(fileName);
    const filePath = path.join(this._themesDir, safe);

    await this._sequencedWrite("theme", safe, async () => {
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }
      await this._deleteAutosaveFile("theme", safe);
    });
  }

  // ── Autosave introspection / cleanup ─────────────────────────────────────

  async readAutosave(
    type: StoredEntityType,
    fileName: string
  ): Promise<AutosaveInfo | null> {
    const safe = this._safeFileName(type, fileName);
    const asPath = this._autosavePath(type, safe);
    if (!existsSync(asPath)) return null;

    try {
      const asStat = await fs.stat(asPath);
      const explicitPath = this._explicitPath(type, safe);
      let explicitTime = 0;
      let explicitData: unknown = null;

      if (existsSync(explicitPath)) {
        try {
          const eStat = await fs.stat(explicitPath);
          explicitTime = eStat.mtimeMs;
          explicitData = await this._readJson(explicitPath);
        } catch {
          /* no explicit save yet */
        }
      }

      const data = await this._readJson(asPath);
      const isRedundant =
        explicitData !== null && JSON.stringify(data) === JSON.stringify(explicitData);

      return {
        exists: true,
        autosaveTime: asStat.mtimeMs,
        explicitTime,
        isStale: asStat.mtimeMs > explicitTime && !isRedundant,
        data,
      };
    } catch {
      return null;
    }
  }

  async clearAutosave(type: StoredEntityType, fileName: string): Promise<void> {
    const safe = this._safeFileName(type, fileName);
    await this._sequencedWrite(type, safe, async () => {
      await this._deleteAutosaveFile(type, safe);
    });
  }

  // ── History snapshots for episodes ───────────────────────────────────────

  async listHistorySnapshots(episodeFile: string): Promise<HistorySnapshotListItem[]> {
    const dir = this._historyDirFor(episodeFile);
    if (!existsSync(dir)) return [];

    const files = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const snapshots: HistorySnapshotListItem[] = [];
    for (const f of files) {
      try {
        const data = (await this._readJson(path.join(dir, f))) as HistorySnapshot;
        snapshots.push({
          file: f,
          timestamp: data._timestamp || null,
          episodeFile: data._episodeFile || episodeFile,
        });
      } catch {
        snapshots.push({ file: f, timestamp: null, episodeFile });
      }
    }

    return snapshots;
  }

  async loadHistorySnapshot(
    episodeFile: string,
    snapshotFile: string
  ): Promise<HistorySnapshot | null> {
    const dir = this._historyDirFor(episodeFile);
    const safe = path.basename(snapshotFile);
    const filePath = path.join(dir, safe);
    if (!existsSync(filePath)) return null;
    return (await this._readJson(filePath)) as HistorySnapshot;
  }

  async deleteHistorySnapshot(episodeFile: string, snapshotFile: string): Promise<void> {
    const dir = this._historyDirFor(episodeFile);
    const safe = path.basename(snapshotFile);
    const filePath = path.join(dir, safe);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  }

  async saveHistorySnapshot(
    episodeFile: string,
    content: Episode,
    theme: Theme | null
  ): Promise<HistorySnapshot> {
    const dir = this._historyDirFor(episodeFile);
    await fs.mkdir(dir, { recursive: true });

    const snapshot: HistorySnapshot = {
      _snapshot: true,
      _timestamp: new Date().toISOString(),
      _episodeFile: episodeFile,
      content,
      theme: theme ?? null,
    };

    const filePath = path.join(dir, this._historyFileName());
    await this._writeJson(filePath, snapshot);
    await this._pruneHistory(episodeFile);

    return snapshot;
  }

  // ── Assets available for a theme ─────────────────────────────────────────

  async listAssetsForTheme(themeName: string): Promise<ThemeAsset[]> {
    const results: ThemeAsset[] = [];

    const walkDir = async (dir: string, prefix: string) => {
      if (!existsSync(dir)) return;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.name.startsWith(".")) continue;
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            await walkDir(full, prefix);
          } else if (ent.isFile()) {
            const ext = path.extname(ent.name).toLowerCase();
            if (!this._assetExts.has(ext)) continue;
            const relPath = `assets/${prefix}/${path
              .relative(dir, full)
              .replace(/\\/g, "/")}`;
            const urlPath = `/uploads/${path.basename(full)}`;
            results.push({
              name: ent.name,
              path: relPath,
              url: urlPath,
              source: prefix.startsWith("themes") ? "theme" : "shared",
            });
          }
        }
      } catch {
        /* skip unreadable dirs */
      }
    };

    if (themeName) {
      await walkDir(
        path.join(this._rootDir, "assets", "themes", themeName),
        `themes/${themeName}`
      );
    }

    await walkDir(path.join(this._rootDir, "assets", "shared"), "shared");

    return results;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private _resolveEpisodePath(fileOrName: string): string {
    if (path.isAbsolute(fileOrName)) return fileOrName;
    const base = path.basename(fileOrName);
    const safe = base.endsWith(".json") ? base : `${base}.json`;
    return path.join(this._contentDir, safe);
  }

  private _resolveThemePath(fileOrName: string): string {
    if (path.isAbsolute(fileOrName)) return fileOrName;
    const dir = this._themesDir;
    if (fileOrName.endsWith(".json")) {
      return path.join(dir, path.basename(fileOrName));
    }
    const candidate = path.join(dir, `${fileOrName}.theme.json`);
    if (existsSync(candidate)) return candidate;
    return path.join(dir, fileOrName);
  }

  private _safeEpisodeFileName(fileName: string): string {
    const base = path.basename(fileName);
    return base.endsWith(".json") ? base : `${base}.json`;
  }

  private _safeThemeFileName(fileName: string): string {
    const base = path.basename(fileName);
    return base.endsWith(".theme.json")
      ? base
      : `${path.basename(base, ".json")}.theme.json`;
  }

  private _safeFileName(type: StoredEntityType, fileName: string): string {
    return type === "episode"
      ? this._safeEpisodeFileName(fileName)
      : this._safeThemeFileName(fileName);
  }

  private _explicitPath(type: StoredEntityType, safeFileName: string): string {
    return type === "episode"
      ? path.join(this._contentDir, safeFileName)
      : path.join(this._themesDir, safeFileName);
  }

  private _autosavePath(type: StoredEntityType, safeFileName: string): string {
    return path.join(this._autosaveDirs[type], safeFileName);
  }

  private async _deleteAutosaveFile(
    type: StoredEntityType,
    safeFileName: string
  ): Promise<void> {
    const filePath = this._autosavePath(type, safeFileName);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  }

  private _historyDirFor(episodeFile: string): string {
    const stem = path.basename(episodeFile, ".json");
    return path.join(this._historyDir, stem);
  }

  private _historyFileName(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`;
  }

  private async _pruneHistory(episodeFile: string): Promise<void> {
    const dir = this._historyDirFor(episodeFile);
    if (!existsSync(dir)) return;

    const files = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".json"))
      .sort();

    if (files.length <= this._maxHistory) return;

    const toDelete = files.slice(0, files.length - this._maxHistory);
    for (const f of toDelete) {
      await fs.unlink(path.join(dir, f)).catch(() => {
        /* ignore prune failures */
      });
    }
  }

  private async _readJson(filePath: string): Promise<unknown> {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  }

  private async _writeJson(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  private async _sequencedWrite<T>(
    type: StoredEntityType,
    safeFileName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const key = `${type}:${safeFileName}`;
    const previous = this._locks.get(key) ?? Promise.resolve();
    const next = previous.then(async () => operation());
    this._locks.set(
      key,
      next.then(
        () => {},
        () => {}
      )
    );
    return next;
  }
}

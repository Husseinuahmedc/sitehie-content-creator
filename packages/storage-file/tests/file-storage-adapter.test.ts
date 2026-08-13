import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Episode, Theme } from "@sitehie/core/domain";
import { FileStorageAdapter } from "../file-storage-adapter.js";

async function makeTempRoot(): Promise<string> {
  const prefix = path.join(os.tmpdir(), "sitehie-storage-file-test-");
  return fs.mkdtemp(prefix);
}

function sampleEpisode(): Episode {
  return {
    episode: "test-episode",
    series: "test-series",
    slides: [
      {
        type: "cover",
        title: "Hello",
      },
    ],
  };
}

function sampleTheme(): Theme {
  return {
    name: "test-theme",
    description: "A theme for tests",
    colors: {
      background: "#000000",
      primary: "#ffffff",
      secondary: "#cccccc",
      textPrimary: "#ffffff",
      textSecondary: "#aaaaaa",
      codeBackground: "#111111",
      highlightMarker: "#ff0000",
    },
    fonts: {
      body: { family: "sans", path: "shared/fonts/body.woff2" },
    },
    typography: {},
    layout: {},
  };
}

describe("FileStorageAdapter", () => {
  let rootDir: string;
  let adapter: FileStorageAdapter;

  beforeEach(async () => {
    rootDir = await makeTempRoot();
    adapter = new FileStorageAdapter({ rootDir });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  describe("episodes", () => {
    it("saves and loads an episode", async () => {
      const episode = sampleEpisode();
      const result = await adapter.saveEpisode("my-episode", episode);
      assert.match(result.filePath, /my-episode\.json$/);

      const loaded = await adapter.loadEpisode("my-episode.json");
      assert.deepStrictEqual(loaded, episode);
    });

    it("normalises missing .json extension on save", async () => {
      const episode = sampleEpisode();
      await adapter.saveEpisode("plain-name", episode);
      const listed = await adapter.listEpisodes();
      assert.strictEqual(listed.length, 1);
      assert.strictEqual(listed[0].file, "plain-name.json");
    });

    it("lists episodes", async () => {
      const ep = sampleEpisode();
      await adapter.saveEpisode("a.json", ep);
      await adapter.saveEpisode("b.json", { ...ep, episode: "second" });

      const listed = await adapter.listEpisodes();
      assert.strictEqual(listed.length, 2);
      assert.ok(listed.find((x) => x.episode === "test-episode"));
      assert.ok(listed.find((x) => x.episode === "second"));
    });

    it("skips unreadable and _prefixed episode files", async () => {
      await fs.mkdir(path.join(rootDir, "content"), { recursive: true });
      await fs.writeFile(path.join(rootDir, "content", "bad.json"), "not json");
      await fs.writeFile(
        path.join(rootDir, "content", "_hidden.json"),
        JSON.stringify(sampleEpisode())
      );

      const listed = await adapter.listEpisodes();
      assert.strictEqual(listed.length, 0);
    });

    it("deletes an episode and its autosave", async () => {
      const ep = sampleEpisode();
      await adapter.saveEpisode("to-delete.json", ep);
      await adapter.saveEpisode("to-delete.json", { ...ep, episode: "autosaved" }, {
        mode: "autosave",
      });

      await adapter.deleteEpisode("to-delete.json");

      assert.strictEqual(exists("content/to-delete.json"), false);
      assert.strictEqual(exists("content/.autosave/to-delete.json"), false);
    });

    function exists(rel: string): boolean {
      return existsSync(path.join(rootDir, rel));
    }
  });

  describe("themes", () => {
    it("saves and loads a theme", async () => {
      const theme = sampleTheme();
      const result = await adapter.saveTheme("my-theme", theme);
      assert.match(result.filePath, /my-theme\.theme\.json$/);

      const loaded = await adapter.loadTheme("my-theme");
      assert.deepStrictEqual(loaded, theme);
    });

    it("lists themes", async () => {
      const theme = sampleTheme();
      await adapter.saveTheme("one", theme);
      await adapter.saveTheme("two", { ...theme, name: "second" });

      const listed = await adapter.listThemes();
      assert.strictEqual(listed.length, 2);
    });

    it("deletes a theme and its autosave", async () => {
      const theme = sampleTheme();
      await adapter.saveTheme("del", theme);
      await adapter.saveTheme("del", { ...theme, name: "autosaved" }, { mode: "autosave" });

      await adapter.deleteTheme("del");

      assert.strictEqual(exists("themes/del.theme.json"), false);
      assert.strictEqual(exists("themes/.autosave/del.theme.json"), false);
    });

    function exists(rel: string): boolean {
      return existsSync(path.join(rootDir, rel));
    }
  });

  describe("autosave", () => {
    it("writes an autosave slot", async () => {
      const ep = sampleEpisode();
      await adapter.saveEpisode("auto.json", ep, { mode: "autosave" });

      const info = await adapter.readAutosave("episode", "auto.json");
      assert.ok(info);
      assert.strictEqual(info?.exists, true);
      assert.strictEqual((info?.data as Episode).episode, "test-episode");
    });

    it("reports autosave as stale when newer than explicit save", async () => {
      const ep = sampleEpisode();
      await adapter.saveEpisode("auto.json", ep);
      await new Promise((r) => setTimeout(r, 20));
      await adapter.saveEpisode("auto.json", { ...ep, episode: "autosaved" }, {
        mode: "autosave",
      });

      const info = await adapter.readAutosave("episode", "auto.json");
      assert.ok(info?.isStale);
    });

    it("reports autosave as not stale when it matches explicit save", async () => {
      const ep = sampleEpisode();
      await adapter.saveEpisode("auto.json", ep);
      await adapter.saveEpisode("auto.json", ep, { mode: "autosave" });

      const info = await adapter.readAutosave("episode", "auto.json");
      assert.ok(info);
      assert.strictEqual(info.isStale, false);
    });

    it("clears an autosave", async () => {
      const ep = sampleEpisode();
      await adapter.saveEpisode("auto.json", ep, { mode: "autosave" });
      await adapter.clearAutosave("episode", "auto.json");

      const info = await adapter.readAutosave("episode", "auto.json");
      assert.strictEqual(info, null);
    });

    it("explicit save clears the autosave under the same lock", async () => {
      const ep = sampleEpisode();
      await adapter.saveEpisode("race.json", ep, { mode: "autosave" });
      await adapter.saveEpisode("race.json", { ...ep, episode: "explicit" });

      const info = await adapter.readAutosave("episode", "race.json");
      assert.strictEqual(info, null);
    });

    it("serializes concurrent autosave and explicit saves", async () => {
      const ep = sampleEpisode();
      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          adapter.saveEpisode("seq.json", { ...ep, episode: `autosave-${i}` }, {
            mode: "autosave",
          })
        );
        promises.push(
          adapter.saveEpisode("seq.json", { ...ep, episode: `explicit-${i}` })
        );
      }
      await Promise.all(promises);

      const loaded = await adapter.loadEpisode("seq.json");
      assert.match(loaded.episode, /^explicit-/);
    });
  });

  describe("history snapshots", () => {
    it("lists, loads, and deletes snapshots", async () => {
      const dir = path.join(rootDir, "content", ".history", "hist");
      await fs.mkdir(dir, { recursive: true });
      const snapshot: import("@sitehie/core/ports").HistorySnapshot = {
        _snapshot: true,
        _timestamp: "2026-08-08T12:00:00.000Z",
        _episodeFile: "hist.json",
        content: sampleEpisode(),
        theme: sampleTheme(),
      };
      await fs.writeFile(path.join(dir, "2026-08-08_12-00-00.json"), JSON.stringify(snapshot));

      const listed = await adapter.listHistorySnapshots("hist.json");
      assert.strictEqual(listed.length, 1);
      assert.strictEqual(listed[0].timestamp, "2026-08-08T12:00:00.000Z");

      const loaded = await adapter.loadHistorySnapshot("hist.json", "2026-08-08_12-00-00.json");
      assert.deepStrictEqual(loaded, snapshot);

      await adapter.deleteHistorySnapshot("hist.json", "2026-08-08_12-00-00.json");
      const after = await adapter.loadHistorySnapshot("hist.json", "2026-08-08_12-00-00.json");
      assert.strictEqual(after, null);
    });

    it("saves a snapshot and round-trips through list and load", async () => {
      const content = sampleEpisode();
      const theme = sampleTheme();
      const snapshot = await adapter.saveHistorySnapshot("hist.json", content, theme);

      assert.strictEqual(snapshot._snapshot, true);
      assert.strictEqual(snapshot._episodeFile, "hist.json");
      assert.strictEqual(snapshot.content, content);
      assert.strictEqual(snapshot.theme, theme);
      assert.ok(typeof snapshot._timestamp === "string");

      const listed = await adapter.listHistorySnapshots("hist.json");
      assert.strictEqual(listed.length, 1);
      assert.strictEqual(listed[0].episodeFile, "hist.json");
      assert.strictEqual(listed[0].timestamp, snapshot._timestamp);

      const loaded = await adapter.loadHistorySnapshot("hist.json", listed[0].file);
      assert.deepStrictEqual(loaded, snapshot);
    });

  });

  describe("theme assets", () => {
    it("lists theme and shared assets", async () => {
      await fs.mkdir(path.join(rootDir, "assets", "themes", "dark", "icons"), {
        recursive: true,
      });
      await fs.mkdir(path.join(rootDir, "assets", "shared", "icons"), { recursive: true });
      await fs.writeFile(path.join(rootDir, "assets", "themes", "dark", "icons", "a.svg"), "a");
      await fs.writeFile(path.join(rootDir, "assets", "shared", "icons", "b.svg"), "b");

      const assets = await adapter.listAssetsForTheme("dark");
      assert.strictEqual(assets.length, 2);
      assert.ok(assets.find((a) => a.source === "theme"));
      assert.ok(assets.find((a) => a.source === "shared"));
    });
  });
});

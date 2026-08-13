import { describe, it } from "node:test";
import assert from "node:assert";
import { validateTheme, validateEpisode, episodeSchema } from "../validation/index.js";
import {
  loadThemeSchema,
  loadTheme,
  loadEpisode,
  listThemeNames,
  listEpisodeNames,
} from "./fixtures.js";

describe("validateTheme", async () => {
  const schema = await loadThemeSchema();

  for (const name of listThemeNames()) {
    it(`validates ${name}.theme.json`, async () => {
      const theme = await loadTheme(name);
      const result = validateTheme(theme, schema);
      assert.strictEqual(result.ok, true, result.errors.join("\n"));
    });
  }

  it("rejects an invalid theme", () => {
    const result = validateTheme({ name: "bad" }, schema);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.length > 0);
  });
});

describe("validateEpisode", async () => {
  for (const name of listEpisodeNames()) {
    it(`validates ${name}.json`, async () => {
      const episode = await loadEpisode(name);
      const result = validateEpisode(episode, episodeSchema);
      assert.strictEqual(result.ok, true, result.errors.join("\n"));
    });
  }

  it("rejects an episode without slides", () => {
    const result = validateEpisode({ episode: "empty" }, episodeSchema);
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.length > 0);
  });

  it("rejects a slide without a type", () => {
    const result = validateEpisode(
      { episode: "bad", slides: [{ title: "x" }] },
      episodeSchema
    );
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.length > 0);
  });
});

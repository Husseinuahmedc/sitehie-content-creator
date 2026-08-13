import { describe, it } from "node:test";
import type {
  StorageAdapter,
  RenderAdapter,
  AiAdapter,
} from "../ports/index.js";
import type { Episode, Theme, Slide } from "../domain/index.js";
import type { ResolvedStyle } from "../resolver/index.js";
import type {
  ArrangeInput,
  ArrangeResult,
  ChatTurnInput,
  ChatTurnResult,
  GenerateFromChatInput,
} from "../ports/ai-adapter.js";

/**
 * Dummy classes that implement the core ports. These are never instantiated;
 * they exist only to prove the interfaces are structurally sound.
 */
class DummyStorageAdapter implements StorageAdapter {
  async listEpisodes() {
    return [];
  }
  async loadEpisode(_fileName: string): Promise<Episode> {
    return { episode: "", slides: [] };
  }
  async saveEpisode(
    _fileName: string,
    _episode: Episode,
    _options?: { mode?: "explicit" | "autosave" }
  ) {
    return { filePath: "" };
  }
  async deleteEpisode(_fileName: string) {}
  async listThemes() {
    return [];
  }
  async loadTheme(_fileName: string): Promise<Theme> {
    return {
      name: "",
      colors: {},
      fonts: {},
      typography: {},
      layout: {},
    };
  }
  async saveTheme(
    _fileName: string,
    _theme: Theme,
    _options?: { mode?: "explicit" | "autosave" }
  ) {
    return { filePath: "" };
  }
  async deleteTheme(_fileName: string) {}
  async readAutosave(_type: "episode" | "theme", _fileName: string) {
    return null;
  }
  async clearAutosave(_type: "episode" | "theme", _fileName: string) {}
  async listHistorySnapshots(_episodeFile: string) {
    return [];
  }
  async loadHistorySnapshot(_episodeFile: string, _snapshotFile: string) {
    return null;
  }
  async deleteHistorySnapshot(_episodeFile: string, _snapshotFile: string) {}
  async saveHistorySnapshot(
    _episodeFile: string,
    _content: Episode,
    _theme: Theme | null
  ) {
    return {
      _snapshot: true as const,
      _timestamp: "",
      _episodeFile: _episodeFile,
      content: _content,
      theme: _theme,
    };
  }
  async listAssetsForTheme(_themeName: string) {
    return [];
  }
}

class DummyRenderAdapter implements RenderAdapter {
  async renderSlide(_slide: Slide, _style: ResolvedStyle) {
    return Buffer.from("");
  }
  async renderEpisode() {
    return { count: 0, buffers: [], warnings: [] };
  }
  async renderEpisodePdf() {
    return { count: 0, buffer: Buffer.from(""), warnings: [] };
  }
}

class DummyAiAdapter implements AiAdapter {
  async arrange(_input: ArrangeInput): Promise<ArrangeResult> {
    return { suggestedCount: 0, suggestionReason: "", slides: [] };
  }
  async chatTurn(_input: ChatTurnInput): Promise<ChatTurnResult> {
    return { reply: "" };
  }
  async generateFromChat(_input: GenerateFromChatInput): Promise<ArrangeResult> {
    return { suggestedCount: 0, suggestionReason: "", slides: [] };
  }
}

describe("ports compile-time shape", () => {
  it("storage adapter can be implemented", () => {
    void (new DummyStorageAdapter() satisfies StorageAdapter);
  });

  it("render adapter can be implemented", () => {
    void (new DummyRenderAdapter() satisfies RenderAdapter);
  });

  it("ai adapter can be implemented", () => {
    void (new DummyAiAdapter() satisfies AiAdapter);
  });
});

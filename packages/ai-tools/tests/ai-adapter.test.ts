import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OllamaAdapter } from "../ollama-adapter.js";
import { OpenCodeAdapter } from "../opencode-adapter.js";
import {
  buildArrangeSystemPrompt,
  buildArrangeUserPrompt,
  buildChatSystemPrompt,
  buildGenerateSystemPrompt,
  buildGenerateFinalUserPrompt,
  buildGenerateOpenCodeUserContent,
} from "../prompt-builder.js";
import { cleanJsonResponse, validateArrangeResult } from "../response-validator.js";

const dummyArrangeResult = {
  suggestedCount: 2,
  suggestionReason: "الموضوع يناسب شريحتين",
  slides: [
    { type: "cover", title: "Test Cover" },
    {
      type: "body",
      paragraphs: [
        { text: "Hello world", highlights: ["problem"], cyanWords: ["solution"] },
      ],
    },
  ],
};

function mockOllamaFetch(responseContent: string): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === "string" ? url : url.toString();
    assert.ok(urlString.includes("/api/chat"), `unexpected Ollama URL: ${urlString}`);
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify({ message: { content: responseContent } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function mockOpenCodeFetch(responseContent: string): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === "string" ? url : url.toString();
    if (urlString.includes("/global/health")) {
      return new Response(JSON.stringify({ healthy: true }), { status: 200 });
    }
    if (urlString.endsWith("/session") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "sess-123" }), { status: 200 });
    }
    const sessionMatch = urlString.match(/\/session\/([^/]+)(?:\/message|\/abort)?$/);
    const sessionID = sessionMatch?.[1];
    if (sessionID && urlString.includes("/message") && init?.method === "POST") {
      return new Response(
        JSON.stringify({ info: { id: "msg-1" }, parts: [{ type: "text", text: responseContent }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (
      (sessionID && urlString.includes("/abort") && init?.method === "POST") ||
      (sessionID && urlString.endsWith(`/session/${sessionID}`) && init?.method === "DELETE")
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected OpenCode URL: ${urlString}`);
  }) as typeof fetch;
}

describe("prompt-builder", () => {
  it("arrange system prompt contains schema and rules", () => {
    const prompt = buildArrangeSystemPrompt();
    assert.ok(prompt.includes("JSON SCHEMA"));
    assert.ok(prompt.includes('"type": "cover"'));
    assert.ok(prompt.includes("highlights"));
    assert.ok(prompt.includes("cyanWords"));
  });

  it("arrange user prompt includes raw text and target count", () => {
    const prompt = buildArrangeUserPrompt("some content", 3);
    assert.ok(prompt.includes("some content"));
    assert.ok(prompt.includes("3"));
    assert.ok(prompt.includes("---TEXT START---"));
  });

  it("chat system prompt stays plain text", () => {
    const prompt = buildChatSystemPrompt();
    assert.ok(prompt.includes("plain text"));
    assert.ok(!prompt.includes("JSON SCHEMA"));
  });

  it("generate system prompt includes outro type and style examples", () => {
    const prompt = buildGenerateSystemPrompt(["example one"], 4);
    assert.ok(prompt.includes('"type": "outro"'));
    assert.ok(prompt.includes("Example 1"));
    assert.ok(prompt.includes("example one"));
  });

  it("generate final user prompt references target count", () => {
    const prompt = buildGenerateFinalUserPrompt(5);
    assert.ok(prompt.includes("5"));
    assert.ok(prompt.includes("JSON"));
  });

  it("OpenCode generate user content flattens history", () => {
    const history = [
      { role: "user" as const, content: "Hi" },
      { role: "assistant" as const, content: "Hello" },
    ];
    const prompt = buildGenerateOpenCodeUserContent(history, 3);
    assert.ok(prompt.includes("User: Hi"));
    assert.ok(prompt.includes("Assistant: Hello"));
    assert.ok(prompt.includes("3"));
  });
});

describe("response-validator", () => {
  it("validates a clean arrange result", () => {
    const result = validateArrangeResult(dummyArrangeResult);
    assert.equal(result.suggestedCount, 2);
    assert.equal(result.slides.length, 2);
    assert.equal(result.slides[1]?.type, "body");
  });

  it("strips markdown fences before JSON parsing", () => {
    const raw = "```json\n" + JSON.stringify(dummyArrangeResult) + "\n```";
    const cleaned = cleanJsonResponse(raw);
    assert.doesNotMatch(cleaned, /^```/);
    const parsed = JSON.parse(cleaned);
    assert.equal(parsed.suggestedCount, 2);
  });

  it("normalizes the 'title' alias to 'cover'", () => {
    const result = validateArrangeResult({
      suggestedCount: 1,
      suggestionReason: "ok",
      slides: [{ type: "title", title: "Alias test" }],
    });
    assert.equal(result.slides[0]?.type, "cover");
  });

  it("rejects invalid slide types", () => {
    assert.throws(
      () =>
        validateArrangeResult({
          suggestedCount: 1,
          suggestionReason: "ok",
          slides: [{ type: "invalid" }],
        }),
      /Invalid slide type/
    );
  });

  it("deduplicates overlapping highlights and cyanWords", () => {
    const result = validateArrangeResult({
      suggestedCount: 1,
      suggestionReason: "ok",
      slides: [
        {
          type: "body",
          paragraphs: [{ text: "x", highlights: ["shared", "only-highlight"], cyanWords: ["shared"] }],
        },
      ],
    });
    const paragraph = result.slides[0]?.paragraphs?.[0];
    assert.deepEqual(paragraph?.highlights, ["only-highlight"]);
    assert.deepEqual(paragraph?.cyanWords, ["shared"]);
  });
});

describe("OllamaAdapter", () => {
  it("arrange returns parsed slides", async () => {
    const adapter = new OllamaAdapter({ fetch: mockOllamaFetch(JSON.stringify(dummyArrangeResult)) });
    const result = await adapter.arrange({
      rawText: "test",
      targetCount: 2,
      themeName: "default",
      themeColors: {},
    });
    assert.equal(result.slides.length, 2);
    assert.equal(result.slides[0]?.type, "cover");
  });

  it("chatTurn returns plain reply", async () => {
    const adapter = new OllamaAdapter({ fetch: mockOllamaFetch("Hello back") });
    const result = await adapter.chatTurn({
      history: [{ role: "user", content: "Hi" }],
    });
    assert.equal(result.reply, "Hello back");
    assert.equal(result.sessionID, undefined);
  });

  it("generateFromChat returns parsed slides", async () => {
    const adapter = new OllamaAdapter({ fetch: mockOllamaFetch(JSON.stringify(dummyArrangeResult)) });
    const result = await adapter.generateFromChat({
      history: [{ role: "user", content: "Make slides about caching" }],
      targetCount: 2,
      themeName: "default",
      themeColors: {},
    });
    assert.equal(result.suggestedCount, 2);
  });

  it("destroySession is a no-op that resolves", async () => {
    const adapter = new OllamaAdapter({ fetch: mockOllamaFetch(JSON.stringify(dummyArrangeResult)) });
    await adapter.destroySession("x");
  });
});

describe("OpenCodeAdapter", () => {
  it("arrange creates and destroys a session", async () => {
    const adapter = new OpenCodeAdapter({ fetch: mockOpenCodeFetch(JSON.stringify(dummyArrangeResult)) });
    const result = await adapter.arrange({
      rawText: "test",
      targetCount: 2,
      themeName: "default",
      themeColors: {},
    });
    assert.equal(result.slides.length, 2);
  });

  it("chatTurn reuses an existing sessionID", async () => {
    const adapter = new OpenCodeAdapter({ fetch: mockOpenCodeFetch("Got it") });
    const result = await adapter.chatTurn({
      history: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Explain" },
      ],
      sessionID: "existing-session",
    });
    assert.equal(result.reply, "Got it");
    assert.equal(result.sessionID, "existing-session");
  });

  it("chatTurn without sessionID creates a new session and returns it", async () => {
    const adapter = new OpenCodeAdapter({ fetch: mockOpenCodeFetch("Hello") });
    const result = await adapter.chatTurn({
      history: [{ role: "user", content: "Hi" }],
    });
    assert.equal(result.reply, "Hello");
    assert.equal(result.sessionID, "sess-123");
  });

  it("generateFromChat creates and destroys a session", async () => {
    const adapter = new OpenCodeAdapter({ fetch: mockOpenCodeFetch(JSON.stringify(dummyArrangeResult)) });
    const result = await adapter.generateFromChat({
      history: [{ role: "user", content: "Topic" }],
      targetCount: 2,
      themeName: "default",
      themeColors: {},
    });
    assert.equal(result.slides[0]?.type, "cover");
  });

  it("destroySession calls abort then delete", async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const adapter = new OpenCodeAdapter({ fetch: mockFetch });
    await adapter.destroySession("sess-cleanup");
    assert.deepEqual(calls, [
      { url: "http://localhost:4096/session/sess-cleanup/abort", method: "POST" },
      { url: "http://localhost:4096/session/sess-cleanup", method: "DELETE" },
    ]);
  });
});

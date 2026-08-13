import type {
  AiAdapter,
  ArrangeInput,
  ArrangeResult,
  ChatTurnInput,
  ChatTurnResult,
  GenerateFromChatInput,
  Message,
} from "@sitehie/core/ports";
import { fetchWithTimeout, readJson, type Fetch } from "./http-client.js";
import {
  buildArrangeSystemPrompt,
  buildArrangeUserPrompt,
  buildChatSystemPrompt,
  buildGenerateOpenCodeUserContent,
  buildGenerateSystemPrompt,
} from "./prompt-builder.js";
import { cleanJsonResponse, validateArrangeResult } from "./response-validator.js";

export type OpenCodeAdapterOptions = {
  fetch?: Fetch;
  baseUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
};

type OpenCodeModelRef = { providerID: string; modelID: string };

/**
 * Stateful {@link AiAdapter} for the OpenCode Go server.
 *
 * OpenCode keeps conversation state on the server in a "session". For one-shot
 * operations (arrange, generateFromChat) we create a session, send one message,
 * and destroy it. For chatTurn we reuse an existing sessionID when provided and
 * return it so the caller can continue the conversation.
 */
export class OpenCodeAdapter implements AiAdapter {
  private readonly fetchImpl: Fetch;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor(options: OpenCodeAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.baseUrl =
      options.baseUrl ?? process.env.OPENCODE_SERVER_URL ?? "http://localhost:4096";
    this.defaultModel = options.defaultModel ?? "opencode-go/deepseek-v4-flash";
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async arrange(input: ArrangeInput): Promise<ArrangeResult> {
    const session = await this.createSession();
    try {
      const messages: Message[] = [
        { role: "system", content: buildArrangeSystemPrompt() },
        { role: "user", content: buildArrangeUserPrompt(input.rawText, input.targetCount) },
      ];
      const raw = await this.sendMessage(session.id, messages, input.modelName);
      return this.parseSlides(raw);
    } finally {
      await this.destroySession(session.id).catch(() => {});
    }
  }

  async chatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
    const systemPrompt = buildChatSystemPrompt(input.styleExamples);
    const latestUserContent = input.history[input.history.length - 1]?.content ?? "";

    let sessionID = input.sessionID;
    let messages: Message[];
    if (sessionID) {
      // Server already has the history for this session.
      messages = [{ role: "user", content: latestUserContent }];
    } else {
      const session = await this.createSession();
      sessionID = session.id;
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: latestUserContent },
      ];
    }

    const reply = await this.sendMessage(sessionID, messages, input.modelName);
    return { reply, sessionID };
  }

  async generateFromChat(input: GenerateFromChatInput): Promise<ArrangeResult> {
    const session = await this.createSession();
    try {
      const messages: Message[] = [
        { role: "system", content: buildGenerateSystemPrompt(input.styleExamples, input.targetCount) },
        { role: "user", content: buildGenerateOpenCodeUserContent(input.history, input.targetCount) },
      ];
      const raw = await this.sendMessage(session.id, messages, input.modelName);
      return this.parseSlides(raw);
    } finally {
      await this.destroySession(session.id).catch(() => {});
    }
  }

  private parseModelRef(model?: string): OpenCodeModelRef {
    const m = model || this.defaultModel;
    const parts = m.split("/");
    if (parts.length > 1) {
      return { providerID: parts[0], modelID: parts.slice(1).join("/") };
    }
    return { providerID: "opencode-go", modelID: m };
  }

  private async healthCheck(timeoutMs: number): Promise<void> {
    try {
      await fetchWithTimeout(
        this.fetchImpl,
        `${this.baseUrl}/global/health`,
        { method: "GET" },
        timeoutMs
      );
    } catch {
      throw new Error("OpenCode server مو شغال — شغله بـ opencode serve");
    }
  }

  private async createSession(): Promise<{ id: string }> {
    await this.healthCheck(5_000);
    const res = await fetchWithTimeout(
      this.fetchImpl,
      `${this.baseUrl}/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "carousel-generator" }),
      },
      this.timeoutMs
    );
    return readJson<{ id: string }>(res);
  }

  private async sendMessage(
    sessionID: string,
    messages: Message[],
    model?: string
  ): Promise<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();

    const body: Record<string, unknown> = {
      parts: [{ type: "text", text: lastUserMsg?.content ?? "" }],
      model: this.parseModelRef(model),
    };
    if (systemMsg?.content) {
      body.system = systemMsg.content;
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(
        this.fetchImpl,
        `${this.baseUrl}/session/${sessionID}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        this.timeoutMs
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("OpenCode لم يستجب — حاول مرة أخرى");
      }
      throw err;
    }

    const data = await readJson<{
      info: { id: string };
      parts: { type: string; text?: string }[];
    }>(res);
    return data.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("\n");
  }

  /**
   * Best-effort session teardown; adapter sessions are created by
   * arrange/generateFromChat and destroyed internally, but chatTurn reuses
   * caller-supplied sessionIDs, so callers may need to destroy those.
   */
  async destroySession(sessionID: string): Promise<void> {
    try {
      await fetchWithTimeout(
        this.fetchImpl,
        `${this.baseUrl}/session/${sessionID}/abort`,
        { method: "POST" },
        5_000
      );
    } catch {
      // Session may have no active work — ignore abort errors.
    }
    try {
      await fetchWithTimeout(
        this.fetchImpl,
        `${this.baseUrl}/session/${sessionID}`,
        { method: "DELETE" },
        5_000
      );
    } catch {
      // Session may already be gone — ignore delete errors.
    }
  }

  private parseSlides(raw: string): ArrangeResult {
    const cleaned = cleanJsonResponse(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI response is not valid JSON. Please retry.");
    }
    return validateArrangeResult(parsed);
  }
}

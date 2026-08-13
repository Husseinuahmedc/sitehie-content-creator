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
  buildGenerateFinalUserPrompt,
  buildGenerateSystemPrompt,
} from "./prompt-builder.js";
import { cleanJsonResponse, validateArrangeResult } from "./response-validator.js";

export type OllamaAdapterOptions = {
  fetch?: Fetch;
  baseUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
};

/**
 * Stateless {@link AiAdapter} for Ollama's /api/chat endpoint.
 *
 * Every call sends the full message history; Ollama does not maintain server
 * state between requests.
 */
export class OllamaAdapter implements AiAdapter {
  private readonly fetchImpl: Fetch;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaAdapterOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.baseUrl = options.baseUrl ?? "http://localhost:11434";
    this.defaultModel = options.defaultModel ?? "qwen3:8b";
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async arrange(input: ArrangeInput): Promise<ArrangeResult> {
    const messages: Message[] = [
      { role: "system", content: buildArrangeSystemPrompt() },
      { role: "user", content: buildArrangeUserPrompt(input.rawText, input.targetCount) },
    ];
    const raw = await this.callChat(messages, { model: input.modelName, temperature: 0.3 });
    return this.parseSlides(raw);
  }

  async chatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
    const messages: Message[] = [
      { role: "system", content: buildChatSystemPrompt(input.styleExamples) },
      ...input.history,
    ];
    const reply = await this.callChat(messages, { model: input.modelName, temperature: 0.7 });
    return { reply };
  }

  async generateFromChat(input: GenerateFromChatInput): Promise<ArrangeResult> {
    const messages: Message[] = [
      { role: "system", content: buildGenerateSystemPrompt(input.styleExamples, input.targetCount) },
      ...input.history,
      { role: "user", content: buildGenerateFinalUserPrompt(input.targetCount) },
    ];
    const raw = await this.callChat(messages, { model: input.modelName, temperature: 0.3 });
    return this.parseSlides(raw);
  }

  async destroySession(_sessionID: string): Promise<void> {
    // Stateless: every call is independent; nothing to tear down.
  }

  private async callChat(
    messages: Message[],
    options: { model?: string; temperature?: number }
  ): Promise<string> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        this.fetchImpl,
        `${this.baseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: options.model || this.defaultModel,
            messages,
            stream: false,
            options: { temperature: options.temperature ?? 0.3 },
          }),
        },
        this.timeoutMs
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Ollama لم يستجب خلال دقيقتين — حاول مرة أخرى");
      }
      throw new Error("Ollama مو شغال — شغله بـ ollama serve");
    }

    const data = await readJson<{ message?: { content?: string } }>(res);
    return data?.message?.content ?? "";
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

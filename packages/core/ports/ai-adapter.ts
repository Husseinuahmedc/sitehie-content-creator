import type { ArrangeResult } from "../domain/ai-draft.js";

export type { ArrangeResult } from "../domain/ai-draft.js";

/**
 * A single turn in a conversational generate workflow.
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Input for one-shot arrangement of raw text into slide drafts.
 */
export type ArrangeInput = {
  rawText: string;
  targetCount: number;
  themeName: string;
  themeColors: Record<string, string>;
  modelName?: string;
};

/**
 * Input for a free-form chat turn used to refine a topic before generating.
 */
export type ChatTurnInput = {
  history: Message[];
  styleExamples?: string[];
  modelName?: string;
  /**
   * Provider-specific session identifier. Stateless adapters (e.g. Ollama) may
   * ignore this; stateful adapters (e.g. OpenCode) return it in the result.
   */
  sessionID?: string;
};

export type ChatTurnResult = {
  reply: string;
  sessionID?: string;
};

/**
 * Input for generating final slide drafts from a conversation history.
 */
export type GenerateFromChatInput = {
  history: Message[];
  targetCount: number;
  themeName: string;
  themeColors: Record<string, string>;
  styleExamples?: string[];
  modelName?: string;
  sessionID?: string;
};

/**
 * Provider-agnostic AI contract.
 *
 * "Arrange" and "generate" are kept as separate methods because they accept
 * different inputs: arrange takes raw text directly, while generate consumes a
 * chat history. A future adapter may implement both by delegating to the same
 * internal prompt builder; the split here keeps the port stable for callers.
 */
export interface AiAdapter {
  /** One-shot: split raw text into slide drafts. */
  arrange(input: ArrangeInput): Promise<ArrangeResult>;

  /** Conversational refinement turn (plain text reply). */
  chatTurn(input: ChatTurnInput): Promise<ChatTurnResult>;

  /** Produce slide drafts from a conversation history. */
  generateFromChat(input: GenerateFromChatInput): Promise<ArrangeResult>;

  /**
   * Best-effort teardown of a provider session previously returned by
   * chatTurn (e.g. OpenCode's server-side session). Stateless adapters
   * (Ollama) should treat this as a no-op. Must not throw for already-gone
   * sessions — callers use this for cleanup only.
   */
  destroySession?(sessionID: string): Promise<void>;
}

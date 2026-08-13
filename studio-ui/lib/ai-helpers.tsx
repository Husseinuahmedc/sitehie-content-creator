import type { DraftSlide, DraftParagraph } from "@sitehie/core/domain";

// ── Shared types ──────────────────────────────────────────

export type { DraftImage, ArrangeResult } from "@sitehie/core/domain";

export type Provider = "ollama" | "opencode";

// ── Shared AI request helper ──────────────────────────────

/**
 * POST JSON to an AI route with a client-side timeout and a stable error.
 * A generous timeout (5 min) lets cold Ollama model loads (~1 min) and long
 * generations finish, while still surfacing a clear message if the server
 * hangs instead of spinning forever.
 */
export async function aiPost(url: string, body: unknown, timeoutMs = 300_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
    }
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("استغرق الطلب وقتًا طويلاً — أعد المحاولة أو جرّب نموذجًا محليًا أسرع");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Slide type metadata ───────────────────────────────────

/** Maps DraftSlide.type to a human-readable label for the preview badge. */
export const TYPE_LABELS: Record<string, string> = {
  cover: "Cover",
  title: "Cover",
  code: "Code",
  quote: "Quote",
  body: "Body",
  outro: "Outro",
  comparison: "Comparison",
  stat: "Stat",
};

/** Color accent for each slide type's preview badge. */
export const TYPE_COLORS: Record<string, string> = {
  cover: "#00c8d7",
  title: "#00c8d7",
  code: "#7B2FFF",
  quote: "#FFD400",
  body: "#9a9aab",
  outro: "#4CAF50",
  comparison: "#FF6B35",
  stat: "#E91E63",
};

// ── Provider options ──────────────────────────────────────

export type ProviderOption = { label: string; provider: Provider; model: string };

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { label: "Ollama — qwen3:8b (local)", provider: "ollama", model: "qwen3:8b" },
  { label: "Ollama — llama3.2:latest (local)", provider: "ollama", model: "llama3.2:latest" },
  { label: "Ollama — llama3.1:8b (local)", provider: "ollama", model: "llama3.1:8b" },
  { label: "Ollama — qwen2.5-coder:7b (local)", provider: "ollama", model: "qwen2.5-coder:7b" },
  { label: "Ollama — mistral:latest (local)", provider: "ollama", model: "mistral:latest" },
  { label: "OpenCode — DeepSeek V4 Flash Free (Zen)", provider: "opencode", model: "opencode/deepseek-v4-flash-free" },
  { label: "OpenCode — MiMo V2.5 Free (Zen)", provider: "opencode", model: "opencode/mimo-v2.5-free" },
  { label: "OpenCode — DeepSeek V4 Flash (Go)", provider: "opencode", model: "opencode-go/deepseek-v4-flash" },
  { label: "OpenCode — MiMo-V2.5 (Go)", provider: "opencode", model: "opencode-go/mimo-v2.5" },
];

export function optionKey(o: ProviderOption) {
  return `${o.provider}::${o.model}`;
}

// ── Draft → Slide conversion ──────────────────────────────

/**
 * Convert a DraftSlide (from AI arranger) into a real Slide (for the editor).
 *
 * NOTE: "body" and "quote" both map to `type: "quote"` because the Slide union
 * has no "body" variant — quote slides support paragraphs natively.
 */
export function draftSlideToSlide(d: DraftSlide): import("@sitehie/core/domain").Slide {
  switch (d.type) {
    case "cover":
      return {
        type: "cover",
        title: d.title,
        iconAsset: d.image?.resolved ? d.image.path : undefined,
      };
    case "code":
      return {
        type: "code",
        titleEn: d.titleEn,
        subtitleEn: d.subtitleEn || d.language || "code",
        code: d.code || "",
        explanation: d.explanation || "",
        annotations: d.annotations || [],
      };
    case "outro":
      return {
        type: "outro",
        question: d.question,
        imagePrompt: d.imagePrompt,
        images: d.image?.resolved
          ? [{ asset: d.image.path, top: "0%", left: "0%", width: "100%", height: "100%" }]
          : undefined,
      };
    case "quote":
    case "body":
    default:
      return {
        type: "quote",
        paragraphs: d.paragraphs && d.paragraphs.length > 0
          ? d.paragraphs.map((p) => ({
              text: p.text,
              highlights: p.highlights || [],
              cyanWords: p.cyanWords || [],
            }))
          : [{ text: d.title || "", highlights: [], cyanWords: [] }],
        images: d.image?.resolved
          ? [{ asset: d.image.path, top: "10%", left: "10%", width: "40%", height: "30%" }]
          : undefined,
      };
  }
}

// ── Paragraph preview (React) ─────────────────────────────

/**
 * Render a DraftParagraph as React elements with highlighted/cyan words colored.
 * Used in both AiArranger and AiGenerator preview panels.
 */
export function renderParagraphPreview(p: DraftParagraph): React.ReactNode {
  if (!p.highlights?.length && !p.cyanWords?.length) return p.text;

  const marks: { start: number; end: number; color: string }[] = [];
  for (const w of p.highlights || []) {
    const idx = p.text.indexOf(w);
    if (idx !== -1) marks.push({ start: idx, end: idx + w.length, color: "#7B2FFF" });
  }
  for (const w of p.cyanWords || []) {
    const idx = p.text.indexOf(w);
    if (idx !== -1) marks.push({ start: idx, end: idx + w.length, color: "#00C8D7" });
  }
  if (!marks.length) return p.text;

  marks.sort((a, b) => a.start - b.start);
  const parts: { text: string; color?: string }[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start > cursor) parts.push({ text: p.text.slice(cursor, m.start) });
    parts.push({ text: p.text.slice(m.start, m.end), color: m.color });
    cursor = m.end;
  }
  if (cursor < p.text.length) parts.push({ text: p.text.slice(cursor) });

  return parts.map((seg, i) =>
    seg.color ? (
      <span key={i} style={{ color: seg.color, fontWeight: 600 }}>{seg.text}</span>
    ) : (
      <span key={i}>{seg.text}</span>
    )
  );
}

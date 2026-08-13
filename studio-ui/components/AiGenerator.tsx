"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Episode as EpisodeContent, Slide, Theme, DraftSlide } from "@sitehie/core/domain";
import {
  TYPE_LABELS,
  TYPE_COLORS,
  PROVIDER_OPTIONS,
  optionKey,
  aiPost,
  draftSlideToSlide,
  renderParagraphPreview,
  type ArrangeResult,
  type Provider,
} from "@/lib/ai-helpers";

type Props = {
  theme: Theme;
  themeFile: string;
  onApply: (content: EpisodeContent) => void;
  episodeName: string;
  seriesName: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function AiGenerator({ theme, themeFile, onApply, episodeName, seriesName }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [targetCount, setTargetCount] = useState(6);
  const [providerKey, setProviderKey] = useState(optionKey(PROVIDER_OPTIONS[0]));
  const [sessionID, setSessionID] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArrangeResult | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedOption = PROVIDER_OPTIONS.find((o) => optionKey(o) === providerKey) || PROVIDER_OPTIONS[0];
  const provider = selectedOption.provider;
  const modelName = selectedOption.model;
  const themeName = theme.name || themeFile.replace(/\.theme\.json$/, "");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, result]);

  // Elapsed-time ticker so a cold model load (~1 min) doesn't look frozen.
  useEffect(() => {
    if (!loading && !generating) { setElapsedSec(0); return; }
    setElapsedSec(0);
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [loading, generating]);

  const performCleanup = useCallback(async () => {
    if (!sessionID) return;
    try {
      await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup", sessionID }),
      });
    } catch { /* best-effort cleanup */ }
    setSessionID(null);
  }, [sessionID]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const data = (await aiPost("/api/ai-generate", {
        action: "chat",
        history: updatedHistory,
        provider,
        modelName,
        sessionID,
      })) as { sessionID?: string; reply: string };
      if (data.sessionID) setSessionID(data.sessionID);
      setMessages([...updatedHistory, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, provider, modelName, sessionID]);

  const handleGenerate = useCallback(async () => {
    if (messages.length === 0 || generating) return;
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const data = (await aiPost("/api/ai-generate", {
        action: "generate",
        history: messages,
        targetCount,
        themeName,
        provider,
        modelName,
      })) as ArrangeResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [messages, targetCount, themeName, provider, modelName, generating]);

  const handleApply = useCallback(async () => {
    if (!result) return;
    const slides: Slide[] = result.slides.map((d) => draftSlideToSlide(d));
    onApply({ episode: episodeName, series: seriesName || undefined, slides });
    await performCleanup();
    setOpen(false);
    setMessages([]);
    setResult(null);
    setInput("");
  }, [result, onApply, episodeName, seriesName, performCleanup]);

  const handleClose = useCallback(async () => {
    await performCleanup();
    setOpen(false);
    setMessages([]);
    setResult(null);
    setInput("");
  }, [performCleanup]);

  const handleDiscard = useCallback(async () => {
    await performCleanup();
    setResult(null);
  }, [performCleanup]);

  // Best-effort cleanup when the tab closes
  useEffect(() => {
    if (!open) return;
    const handleBeforeUnload = () => {
      if (sessionID) {
        navigator.sendBeacon(
          "/api/ai-generate",
          new Blob([JSON.stringify({ action: "cleanup", sessionID })], { type: "application/json" })
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [open, sessionID]);

  const displaySlides = result?.slides || [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div>
      <button
        className="btn btn-sm"
        onClick={() => setOpen(!open)}
        style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
      >
        {open ? "Close Generate" : "Generate"}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            background: "rgba(0,0,0,0.7)",
          }}
        >
          <div
            style={{
              width: 480,
              height: "100vh",
              background: "#FFFFFF",
              borderRight: "1px solid #DDE0ED",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div className="panel-header" style={{ flexShrink: 0 }}>
              <span>AI Content Generator</span>
              <button className="btn btn-sm btn-ghost" onClick={handleClose}>
                ×
              </button>
            </div>

            {/* Messages / Slides area */}
            <div className="scroll-y" style={{ flex: 1, padding: 14 }}>
              {result && displaySlides.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                      marginBottom: 8,
                    }}
                  >
                    Generated Slides
                  </div>
                  {displaySlides.map((slide, i) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: TYPE_COLORS[slide.type] || "var(--text-muted)",
                            background: `${TYPE_COLORS[slide.type] || "var(--text-muted)"}22`,
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {TYPE_LABELS[slide.type] || slide.type}
                        </span>
                        <span className="muted" style={{ fontSize: 10 }}>
                          #{i + 1}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          maxHeight: 120,
                          overflow: "hidden",
                        }}
                      >
                        {slide.type === "cover" && slide.title && (
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{slide.title}</div>
                        )}
                        {slide.type === "code" && (
                          <>
                            {slide.titleEn && <div style={{ fontWeight: 700 }}>{slide.titleEn}</div>}
                            {slide.subtitleEn && <div className="muted" style={{ fontSize: 11 }}>{slide.subtitleEn}</div>}
                            {slide.code && <pre style={{ fontSize: 11, marginTop: 4, background: "var(--bg-input)", padding: 6, borderRadius: 4, overflow: "hidden" }}>{slide.code}</pre>}
                          </>
                        )}
                        {(slide.type === "body" || slide.type === "quote") &&
                          slide.paragraphs?.map((p, pi) => (
                            <div key={pi} style={{ direction: /[\u0600-\u06FF]/.test(p.text) ? "rtl" : "ltr", marginBottom: pi < (slide.paragraphs?.length ?? 0) - 1 ? 8 : 0 }}>
                              {renderParagraphPreview(p)}
                            </div>
                          ))}
                      </div>
                      {slide.image && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 11,
                            color: slide.image.resolved ? "var(--success)" : "var(--text-muted)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {slide.image.resolved ? (
                            <>🖼 {slide.image.path.split("/").pop()}</>
                          ) : (
                            <>📷 {slide.image.note}</>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(!result || displaySlides.length === 0) && messages.length === 0 && !loading && (
                <div className="muted" style={{ textAlign: "center", padding: 40, fontSize: 13 }}>
                  Describe the concept you want to create carousel slides about.
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "8px 12px",
                      borderRadius: 12,
                      fontSize: 13,
                      lineHeight: 1.5,
                      background: m.role === "user" ? "#3D52D5" : "#F0F1F7",
                      color: m.role === "user" ? "#16161A" : "#16161A",
                      direction: /[\u0600-\u06FF]/.test(m.content) ? "rtl" : "ltr",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "8px 12px",
                      borderRadius: 12,
                      fontSize: 13,
                      background: "#F0F1F7",
                      color: "#6A7389",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#3D52D5",
                        animation: "pulse 1.5s ease-in-out infinite",
                      }}
                    />
                    {elapsedSec > 8
                      ? `جارٍ تحميل النموذج… ${elapsedSec} ثانية (أول طلب قد يستغرق ~دقيقة)`
                      : `Thinking… ${elapsedSec}s`}
                  </div>
                </div>
              )}

              {generating && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "8px 12px",
                      borderRadius: 12,
                      fontSize: 13,
                      background: "#F0F1F7",
                      color: "#6A7389",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#5B6FE0",
                        animation: "pulse 1.5s ease-in-out infinite",
                      }}
                    />
                    {elapsedSec > 8
                      ? `جارٍ تحميل النموذج… ${elapsedSec} ثانية (أول طلب قد يستغرق ~دقيقة)`
                      : `Generating slides… ${elapsedSec}s`}
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Footer */}
            <div
              style={{
                padding: 14,
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                flexShrink: 0,
              }}
            >
              {error && (
                <div style={{ color: "var(--danger)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{error}</span>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      setError(null);
                      if (messages.length > 0) sendMessage();
                    }}
                    style={{ fontSize: 11, padding: "2px 8px" }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Target count + Generate button */}
              {messages.length > 0 && !result && (
                <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                  <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                    <label>Target slides</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={targetCount}
                      onChange={(e) => setTargetCount(Number(e.target.value))}
                      aria-label="Target slides"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                    <label>Provider</label>
                    <select
                      value={providerKey}
                      onChange={(e) => setProviderKey(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", fontSize: 12 }}
                    >
                      {PROVIDER_OPTIONS.map((o) => (
                        <option key={optionKey(o)} value={optionKey(o)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={generating}
                    onClick={handleGenerate}
                  >
                    {generating ? "Generating…" : "Generate Slides"}
                  </button>
                </div>
              )}

              {/* Chat input */}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your concept…"
                  dir="auto"
                  style={{ flex: 1, fontSize: 13 }}
                  disabled={loading || generating}
                />
                <button
                  className="btn btn-primary"
                  disabled={!input.trim() || loading || generating}
                  onClick={sendMessage}
                >
                  Send
                </button>
              </div>

              {/* Apply / Discard */}
              {result && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" onClick={handleApply}>
                    Apply to episode
                  </button>
                  <button className="btn btn-danger" onClick={handleDiscard}>
                    Discard
                  </button>
                  <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>
                    {displaySlides.length} slides
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Backdrop click to close */}
          <div style={{ flex: 1 }} onClick={handleClose} />
        </div>
      )}
    </div>
  );
}



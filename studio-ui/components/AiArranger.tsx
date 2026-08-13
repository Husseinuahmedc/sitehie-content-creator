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

export default function AiArranger({ theme, themeFile, onApply, episodeName, seriesName }: Props) {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [targetCount, setTargetCount] = useState(6);
  const [providerKey, setProviderKey] = useState(optionKey(PROVIDER_OPTIONS[0]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArrangeResult | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const selectedOption = PROVIDER_OPTIONS.find((o) => optionKey(o) === providerKey) || PROVIDER_OPTIONS[0];
  const provider = selectedOption.provider;
  const modelName = selectedOption.model;
  const themeName = theme.name || themeFile.replace(/\.theme\.json$/, "");

  // Elapsed-time ticker so a cold model load (~1 min) doesn't look frozen.
  useEffect(() => {
    if (!loading) { setElapsedSec(0); return; }
    setElapsedSec(0);
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  const handleGenerate = useCallback(async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setApprovedCount(null);

    try {
      const data = (await aiPost("/api/ai-arrange", {
        rawText: rawText.trim(),
        targetCount,
        themeName,
        themeColors: theme.colors,
        modelName,
        provider,
      })) as ArrangeResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rawText, targetCount, themeName, theme.colors, modelName, provider]);

  const handleApply = useCallback(() => {
    if (!result) return;
    const slides: Slide[] = result.slides.map((d) => draftSlideToSlide(d));
    onApply({
      episode: episodeName,
      series: seriesName || undefined,
      slides,
    });
    setOpen(false);
    setResult(null);
    setRawText("");
  }, [result, onApply, episodeName, seriesName]);

  const displaySlides = result?.slides || [];
  const countMismatch =
    result && approvedCount === null && result.suggestedCount !== targetCount;

  return (
    <div>
      <button
        className="btn btn-sm"
        onClick={() => setOpen(!open)}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {open ? "Close AI Arrange" : "AI Arrange"}
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
              <span>AI Slide Arranger</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            {/* Input area */}
            <div style={{ padding: 14, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div className="field">
                <label>Paste raw text</label>
                <textarea
                  rows={6}
                  dir="auto"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="الصق النص هنا — مقال، كود، اقتباسات، مختلط عربي/إنجليزي..."
                  style={{ fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
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
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
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
                  disabled={!rawText.trim() || loading}
                  onClick={handleGenerate}
                >
                  {loading ? "Generating…" : "Generate"}
                </button>
              </div>
              {error && (
                <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{error}</div>
              )}
            </div>

            {/* Suggestion banner */}
            {countMismatch && result && (
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: "rgba(0,200,215,0.08)",
                  flexShrink: 0,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  AI suggests {result.suggestedCount} slides instead of {targetCount}
                </div>
                <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
                  {result.suggestionReason}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setApprovedCount(result.suggestedCount)}
                  >
                    Use {result.suggestedCount}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => setApprovedCount(targetCount)}
                  >
                    Keep {targetCount}
                  </button>
                </div>
              </div>
            )}

            {/* Draft slides preview */}
            <div className="scroll-y" style={{ flex: 1, padding: 14 }}>
              {!result && !loading && (
                <div className="muted" style={{ textAlign: "center", padding: 40, fontSize: 13 }}>
                  Paste text and click Generate to create slides
                </div>
              )}
              {loading && (
                <div className="muted" style={{ textAlign: "center", padding: 40, fontSize: 13 }}>
                  <div style={{ marginBottom: 8 }}>
                    {elapsedSec > 8
                      ? `جارٍ تحميل النموذج… ${elapsedSec} ثانية (أول طلب قد يستغرق ~دقيقة)`
                      : `Analyzing text and arranging slides… ${elapsedSec}s`}
                  </div>
                  <div style={{ fontSize: 11 }}>Using {modelName}</div>
                </div>
              )}
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

            {/* Apply / Discard */}
            {result && (
              <div
                style={{
                  padding: 14,
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <button className="btn btn-primary" onClick={handleApply}>
                  Apply to episode
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    setResult(null);
                    setApprovedCount(null);
                  }}
                >
                  Discard
                </button>
                <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>
                  {displaySlides.length} slides generated
                </span>
              </div>
            )}
          </div>

          {/* Backdrop click to close */}
          <div style={{ flex: 1 }} onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}



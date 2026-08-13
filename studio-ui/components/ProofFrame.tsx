"use client";

import { useEffect, useRef, useState } from "react";
import type { Episode as EpisodeContent, Theme } from "@sitehie/core/domain";

type FrameSize = "mini" | "card" | "lg";

const FRAME_CLASS: Record<FrameSize, string> = {
  mini: "pf-mini",
  card: "pf-card",
  lg: "pf-lg",
};

type Props = {
  content: EpisodeContent;
  theme: Theme;
  slideIndex?: number;
  /** Renders the slide scaled into a 9:16 proof frame. */
  size?: FrameSize;
  debounceMs?: number;
  className?: string;
};

/**
 * Scaled, non-interactive proof frame rendered from the real template via
 * POST /api/preview (the same path the editor's live preview uses). The
 * template output is self-contained (fonts/assets inlined as data URIs), so
 * the HTML can be safely injected via srcDoc regardless of the route.
 */
export default function ProofFrame({
  content,
  theme,
  slideIndex = 0,
  size = "card",
  debounceMs = 200,
  className = "",
}: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const latest = useRef({ content, theme, slideIndex });
  latest.current = { content, theme, slideIndex };

  const key = JSON.stringify([
    content.slides,
    content.series,
    slideIndex,
    theme.colors,
    theme.fonts,
    theme.typography,
    theme.effects,
    theme.brand,
  ]);

  useEffect(() => {
    const id = ++reqId.current;
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const { content, theme, slideIndex } = latest.current;
        // Prevent the preview from consuming/reading nested fields at call time
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, theme, slideIndex }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Preview failed (${res.status})`);
        }
        const text = await res.text();
        if (id !== reqId.current) return;
        setHtml(text);
      } catch (err) {
        if (id !== reqId.current) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [key, debounceMs]);

  return (
    <div className={`pf-frame ${FRAME_CLASS[size]} ${html ? "" : "pf-empty"} ${className}`.trim()}>
      {html ? (
        <iframe title={`proof-${size}`} srcDoc={html} />
      ) : error ? (
        <span className="pf-frame-error">{error}</span>
      ) : (
        <span className="pf-skeleton">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
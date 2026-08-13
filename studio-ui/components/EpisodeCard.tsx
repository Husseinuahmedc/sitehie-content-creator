"use client";

import { useEffect, useRef, useState } from "react";
import type { Episode as EpisodeContent, Theme } from "@sitehie/core/domain";
import type { EpisodeMeta } from "@/state";
import ProofFrame from "./ProofFrame";
import { swatch } from "./swatch";

type Props = {
  meta: EpisodeMeta;
  theme: Theme | null;
  onOpen: () => void;
};

/**
 * Episode card for the Home screen. Thumbnail lazily loads the episode's real
 * first slide through the real preview pipeline when it scrolls into view; if
 * the episode content cannot be loaded the frame degrades to the active
 * theme's real swatches (never invented titles).
 */
export default function EpisodeCard({ meta, theme, onOpen }: Props) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [content, setContent] = useState<EpisodeContent | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    fetch(`/api/episodes?name=${encodeURIComponent(meta.file)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Load failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled && data.content) setContent(data.content);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, meta.file]);

  const title = meta.episode || meta.file.replace(/\.json$/, "");
  const canPreview = visible && loaded && content && theme;
  // Ghost + fallback swatches derive from the real active theme; when no theme
  // is loaded the CSS-only neutral classes (no hex literals) stand in.
  const themeSwatches =
    theme === null
      ? []
      : [theme.colors?.background, theme.colors?.textPrimary, theme.colors?.primary].filter(Boolean) as string[];

  return (
    <button
      ref={rootRef}
      className="episode-card"
      onClick={onOpen}
      aria-label={`فتح حلقة ${title}`}
    >
      <div className="episode-card-thumb">
        {meta.slideCount > 1 && (
          <span className="episode-ghost" style={swatch(theme?.colors?.background)} />
        )}
        {canPreview ? (
          <ProofFrame content={content} theme={theme} slideIndex={0} size="card" />
        ) : (
          <span className="pf-frame pf-card pf-empty">
            {loaded && visible ? (
              <span className="episode-fallback">
                <span className="episode-fallback-swatches">
                  {themeSwatches.length > 0 ? (
                    themeSwatches.map((c, i) => (
                      <i key={i} className="episode-fallback-swatch" style={swatch(c)} />
                    ))
                  ) : (
                    <>
                      <i className="episode-fallback-swatch neutral" />
                      <i className="episode-fallback-swatch neutral" />
                      <i className="episode-fallback-swatch neutral" />
                    </>
                  )}
                </span>
              </span>
            ) : (
              <span className="pf-skeleton">
                <i />
                <i />
                <i />
              </span>
            )}
          </span>
        )}
      </div>

      <div className="episode-card-body">
        <h3 className="episode-card-title">{title}</h3>
        <div className="episode-card-meta">
          <span className="episode-chips">
            <span className="chip-sm">{meta.slideCount} شرائح</span>
          </span>
          {meta.series && <span className="episode-card-series">{meta.series}</span>}
        </div>
      </div>
    </button>
  );
}
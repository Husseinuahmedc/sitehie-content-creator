"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Episode, Slide } from "@sitehie/core/domain";
import type { Theme } from "@sitehie/core/domain";
import type { PresentationPreset } from "@sitehie/core/presentation";
import { buildPresentationData } from "@/lib/presentation-builder";
import { useSlideAnimation, getElementStyle } from "@/lib/presentation-animation";
import {
  animateSlideElements,
  getSlideAnimationDuration,
  getTransitionStyle,
  type TransitionStyle,
} from "@/lib/present-animations";

type Props = {
  episodeId: string;
  themeName: string;
  initialSlide: number;
  initialPreset?: PresentationPreset;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; episode: Episode; theme: Theme };

const TRANSITION_MS = 650;
const CONTROLS_AUTOHIDE_MS = 3000;

export type ExportSize = "1080x1350" | "1080x1920";
export type ExportFormat = "mp4" | "webm";

export function PresentPlayer({ episodeId, themeName, initialSlide, initialPreset = "cinematic" }: Props) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [currentSlide, setCurrentSlide] = useState(initialSlide);
  const [playing, setPlaying] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activePreset, setActivePreset] = useState<PresentationPreset>(initialPreset);
  const [transitioningSlide, setTransitioningSlide] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [exportState, setExportState] = useState<"idle" | "exporting" | "done">("idle");
  const [exportPct, setExportPct] = useState(0);
  const [exportSize, setExportSize] = useState<ExportSize>("1080x1350");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
  const [showExportPanel, setShowExportPanel] = useState(false);

  // ── Load episode + theme data ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const epName = episodeId.endsWith(".json") ? episodeId : `${episodeId}.json`;
        const res = await fetch(`/api/episodes?name=${encodeURIComponent(epName)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to load episode" }));
          if (!cancelled) setLoadState({ status: "error", message: err.error || "Failed to load episode" });
          return;
        }
        const { content: episode } = await res.json();

        const themeRes = await fetch(`/api/themes?name=${encodeURIComponent(themeName)}`);
        if (!themeRes.ok) {
          const err = await themeRes.json().catch(() => ({ error: "Failed to load theme" }));
          if (!cancelled) setLoadState({ status: "error", message: err.error || "Failed to load theme" });
          return;
        }
        const { theme } = await themeRes.json();

        if (!cancelled) {
          setLoadState({ status: "ready", episode, theme });
        }
      } catch (err) {
        if (!cancelled) {
          setLoadState({ status: "error", message: err instanceof Error ? err.message : "Failed to load data" });
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [episodeId, themeName]);

  // ── Build presentation data ────────────────────────────────────────────

  const presentationData = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return buildPresentationData(loadState.episode, activePreset);
  }, [loadState, activePreset]);

  const currentPresentationSlide = useMemo(() => {
    if (!presentationData) return null;
    return presentationData.slides[currentSlide] ?? null;
  }, [presentationData, currentSlide]);

  // ── Animation ──────────────────────────────────────────────────────────

  const anim = useSlideAnimation(currentPresentationSlide, playing);

  // ── Navigation with transitions ────────────────────────────────────────

  const totalSlides = loadState.status === "ready" ? loadState.episode.slides.length : 0;
  const currentSlideType = loadState.status === "ready"
    ? loadState.episode.slides[currentSlide]?.type
    : undefined;

  const goToSlide = useCallback((target: number) => {
    if (totalSlides === 0) return;
    const next = ((target % totalSlides) + totalSlides) % totalSlides;
    if (next === currentSlide) return;

    setTransitioningSlide(currentSlide);
    setTransitionProgress(0);

    // Animate the crossfade
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / TRANSITION_MS, 1);
      setTransitionProgress(progress);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setTransitioningSlide(null);
        setTransitionProgress(0);
      }
    };
    requestAnimationFrame(tick);

    setCurrentSlide(next);
  }, [currentSlide, totalSlides]);

  const goNext = useCallback(() => {
    goToSlide(currentSlide + 1);
  }, [currentSlide, goToSlide]);

  const goPrev = useCallback(() => {
    goToSlide(currentSlide - 1);
  }, [currentSlide, goToSlide]);

  const goBack = useCallback(() => {
    router.push("/editor");
  }, [router]);

  // Auto-advance timer
  useEffect(() => {
    if (!playing) return;
    const animTime = getSlideAnimationDuration(currentSlideType, activePreset);
    const delay = Math.max(animTime + 3000, 4000);
    const timer = setTimeout(goNext, delay);
    return () => clearTimeout(timer);
  }, [playing, currentSlide, goNext, currentSlideType, activePreset]);

  // ── Controls auto-hide ─────────────────────────────────────────────────

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_AUTOHIDE_MS);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showControls]);

  // ── Keyboard ───────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { goBack(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { goNext(); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { goPrev(); return; }
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goBack, goNext, goPrev]);

  // ── Export handler ──────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExportState("exporting");
    setExportPct(0);

    const [w, h] = exportSize.split("x").map(Number);
    try {
      const res = await fetch("/api/export-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId,
          themeName,
          preset: activePreset,
          format: exportFormat,
          target: { canvas: { width: w, height: h }, fit: "contain", anchor: "center" },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error || `Export failed (${res.status})`);
      }

      // Download the file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `present-${episodeId}-${exportSize}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportPct(100);
      setExportState("done");
      setTimeout(() => { setExportState("idle"); setShowExportPanel(false); }, 3000);
    } catch (err) {
      console.error("Export failed:", err);
      setExportState("idle");
      setShowExportPanel(false);
    }
  }, [episodeId, themeName, activePreset, exportSize, exportFormat]);

  // ── Loading / Error ────────────────────────────────────────────────────

  if (loadState.status === "loading") {
    return (
      <div style={centerStyle}>
        <div style={{ color: "#6A7389", fontSize: "16px" }}>Loading presentation</div>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div style={centerStyle}>
        <div style={{ color: "#D94040", fontSize: "18px", marginBottom: "16px" }}>
          {loadState.message}
        </div>
        <button onClick={goBack} style={backBtnStyle}>Return to Editor</button>
      </div>
    );
  }

  const { episode, theme } = loadState;
  const isTransitioning = transitioningSlide !== null;
  const transOpacity = 1 - transitionProgress;
  const transStyle = getTransitionStyle(activePreset);
  const isDepthSlide = transStyle === "depth-slide";

  // Depth-slide visual: exiting slides left + down-scaled, entering from right
  const exitingTransform = isDepthSlide
    ? `translateX(-${transitionProgress * 80}px) scale(${1 - transitionProgress * 0.1})`
    : "none";
  const enteringTransform = isDepthSlide
    ? `translateX(${(1 - transitionProgress) * 120}px)`
    : "none";

  return (
    <div
      ref={containerRef}
      onMouseMove={showControls}
      onMouseEnter={showControls}
      onTouchStart={showControls}
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0a0c0e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        cursor: controlsVisible ? "default" : "none",
      }}
    >
      {/* Slide stage */}
      <div style={{
        position: "relative",
        width: "1080px",
        height: "1350px",
        maxWidth: "100vw",
        maxHeight: "100vh",
        aspectRatio: "1080 / 1350",
        overflow: "hidden",
        borderRadius: "12px",
        boxShadow: "0 0 80px rgba(0,0,0,0.5)",
        background: "#111416",
      }}>
        {/* Transitioning-out slide */}
        {isTransitioning && (
          <div
            key={`exit-${transitioningSlide}`}
            style={{
              position: "absolute",
              inset: 0,
              opacity: transOpacity,
              transform: exitingTransform,
              transition: "none",
            }}
          >
            <SlideContent
              episode={episode}
              theme={theme}
              preset={activePreset}
              slideIndex={transitioningSlide}
              animate={false}
            />
          </div>
        )}

        {/* Incoming slide */}
        <div
          key={currentSlide}
          style={{
            position: "absolute",
            inset: 0,
            opacity: isTransitioning ? transitionProgress : 1,
            transform: isTransitioning ? enteringTransform : "none",
            transition: "none",
            ...(anim.frame && !isTransitioning
              ? getElementStyle(anim.frame, "slide-container")
              : {}),
          }}
        >
          <SlideContent
            episode={episode}
            theme={theme}
            preset={activePreset}
            slideIndex={currentSlide}
            animate={!isTransitioning}
          />
        </div>
      </div>

      {/* Bottom controls */}
      <ControlsBar
        current={currentSlide}
        total={totalSlides}
        playing={playing}
        visible={controlsVisible}
        preset={activePreset}
        exportState={exportState}
        exportPct={exportPct}
        showExportPanel={showExportPanel}
        exportSize={exportSize}
        exportFormat={exportFormat}
        onPrev={goPrev}
        onNext={goNext}
        onPlayToggle={() => setPlaying((p) => !p)}
        onBack={goBack}
        onPresetChange={setActivePreset}
        onExport={handleExport}
        onToggleExportPanel={() => setShowExportPanel((p) => !p)}
        onExportSizeChange={setExportSize}
        onExportFormatChange={setExportFormat}
      />
    </div>
  );
}

// ── Slide Content with per-element animation injection ───────────────────

function SlideContent({
  episode,
  theme,
  slideIndex,
  preset = "cinematic",
  animate = true,
}: {
  episode: Episode;
  theme: Theme;
  slideIndex: number;
  preset?: PresentationPreset;
  animate?: boolean;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const slideTypeRef = useRef<Slide["type"] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);

    async function loadSlide() {
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: episode, theme, slideIndex }),
        });
        if (!res.ok) {
          if (!cancelled) setError("Failed to render slide");
          return;
        }
        const slideHtml = await res.text();
        if (!cancelled) {
          setHtml(slideHtml);
          slideTypeRef.current = episode.slides[slideIndex]?.type;
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Render error");
      }
    }

    loadSlide();
    return () => { cancelled = true; };
  }, [episode, theme, slideIndex]);

  const handleIframeLoad = useCallback(() => {
    if (!animate) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    const tryAnimate = () => {
      const ready = doc.documentElement.getAttribute("data-ready");
      if (ready === "true") {
        const slideType = slideTypeRef.current;
        if (slideType) {
          const oldStyle = doc.getElementById("present-animations");
          if (oldStyle) oldStyle.remove();
          animateSlideElements(doc, slideType, preset, 100);
        }
      } else {
        setTimeout(tryAnimate, 50);
      }
    };

    tryAnimate();
  }, [animate, preset]);

  if (error) {
    return <div style={{ padding: "40px", color: "#D94040" }}>{error}</div>;
  }

  if (!html) {
    return <div style={{ padding: "40px", color: "#6A7389" }}>Rendering slide</div>;
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      onLoad={handleIframeLoad}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        background: "transparent",
      }}
      title={`Slide ${slideIndex + 1}`}
    />
  );
}

// ── Controls Bar ───────────────────────────────────────────────────────────

function ControlsBar({
  current, total, playing, visible, preset,
  exportState, exportPct, showExportPanel,
  exportSize, exportFormat,
  onPrev, onNext, onPlayToggle, onBack, onPresetChange,
  onExport, onToggleExportPanel, onExportSizeChange, onExportFormatChange,
}: {
  current: number; total: number; playing: boolean; visible: boolean;
  preset: PresentationPreset;
  exportState: "idle" | "exporting" | "done";
  exportPct: number;
  showExportPanel: boolean;
  exportSize: ExportSize;
  exportFormat: ExportFormat;
  onPrev: () => void; onNext: () => void; onPlayToggle: () => void;
  onBack: () => void; onPresetChange: (preset: PresentationPreset) => void;
  onExport: () => void;
  onToggleExportPanel: () => void;
  onExportSizeChange: (s: ExportSize) => void;
  onExportFormatChange: (f: ExportFormat) => void;
}) {
  const presetOptions: Array<{ value: PresentationPreset; label: string }> = [
    { value: "cinematic", label: "Cinematic" },
    { value: "minimal", label: "Minimal" },
    { value: "energetic", label: "Energetic" },
    { value: "editorial", label: "Editorial" },
  ];

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.5s ease",
      pointerEvents: visible ? "auto" : "none",
    }}>
      {/* Export panel */}
      {showExportPanel && (
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "12px 24px",
          background: "rgba(0,0,0,0.8)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}>
          {exportState === "idle" && (
            <>
              <select value={exportSize} onChange={(e) => onExportSizeChange(e.target.value as ExportSize)}
                style={dropdownStyle} aria-label="Export size">
                <option value="1080x1350">1080×1350 (4:5)</option>
                <option value="1080x1920">1080×1920 (9:16)</option>
              </select>
              <select value={exportFormat} onChange={(e) => onExportFormatChange(e.target.value as ExportFormat)}
                style={dropdownStyle} aria-label="Export format">
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
              </select>
              <button onClick={onExport} style={exportBtnStyle}>
                Export Video
              </button>
            </>
          )}
          {exportState === "exporting" && (
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px" }}>
              Rendering {exportPct}%
            </div>
          )}
          {exportState === "done" && (
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px" }}>
              Export complete
            </div>
          )}
        </div>
      )}

      {/* Main controls bar */}
      <div style={{
        width: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "24px", padding: "24px 32px",
        background: "linear-gradient(transparent, rgba(0,0,0,0.6))",
      }}>
        <button onClick={onBack} style={escapeBtnStyle}>Esc</button>
        <button onClick={onPrev} disabled={current === 0} style={navBtnStyle}>←</button>
        <button onClick={onPlayToggle} style={playBtnStyle}>{playing ? "⏸" : "▶"}</button>
        <button onClick={onNext} disabled={current >= total - 1} style={navBtnStyle}>→</button>

        <select value={preset} onChange={(e) => onPresetChange(e.target.value as PresentationPreset)} style={dropdownStyle} aria-label="Transition preset">
          {presetOptions.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ background: "#FFFFFF", color: "#16161A" }}>{opt.label}</option>
          ))}
        </select>

        <button onClick={onToggleExportPanel} style={exportToggleStyle}>
          Export
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center", pointerEvents: "none" }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{
              width: i === current ? "20px" : "6px", height: "6px", borderRadius: "3px",
              background: i === current ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)",
              transition: "all 0.3s ease",
            }}/>
          ))}
          <span style={{ marginLeft: "12px", color: "rgba(255,255,255,0.5)", fontSize: "13px", fontFamily: "'JetBrains Mono', monospace" }}>
            {current + 1} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const centerStyle: React.CSSProperties = {
  width: "100vw",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "#0a0c0e",
  fontFamily: "Manrope, sans-serif",
};

const backBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.8)",
  padding: "10px 24px",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "14px",
  fontFamily: "inherit",
};

const escapeBtnStyle: React.CSSProperties = {
  position: "absolute",
  left: 24,
  background: "none",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.7)",
  padding: "8px 16px",
  borderRadius: "8px",
  cursor: "pointer",
  fontSize: "13px",
  fontFamily: "inherit",
};

const navBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.8)",
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  cursor: "pointer",
  fontSize: "18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "inherit",
};

const playBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.8)",
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  cursor: "pointer",
  fontSize: "16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "inherit",
};

const dropdownStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.7)",
  padding: "6px 10px",
  borderRadius: "6px",
  fontSize: "12px",
  fontFamily: "inherit",
  cursor: "pointer",
  outline: "none",
  width: "auto",
  flexShrink: 0,
};

const exportToggleStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.7)",
  padding: "6px 14px",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "12px",
  fontFamily: "inherit",
};

const exportBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "rgba(255,255,255,0.9)",
  padding: "8px 20px",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "13px",
  fontFamily: "inherit",
  fontWeight: 600,
};

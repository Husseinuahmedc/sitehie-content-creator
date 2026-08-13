"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Episode as EpisodeContent, Slide, Theme } from "@sitehie/core/domain";
import { resolveSlideStyle } from "@sitehie/core/resolver";
import {
  applyBoxToElement,
  getLayoutBox,
  measureInSlide,
  pct,
  rectToBox,
  setLayoutBox,
  snapPosition,
  targetsForType,
  type LayoutTarget,
  type SnapGuide,
} from "@/lib/layoutTargets";

const SLIDE_W = 1080;
const SLIDE_H = 1350;

const FONT_SIZE_KEY_MAP: Record<string, string> = {
  "quote.text": "quoteSlide",
  "code.title": "codeSlideTitle",
  "code.explanation": "codeSlideExplanation",
  "cover.title": "coverSlideTitle",
  "code.block": "codeSlideCode",
  "outro.question": "outroSlideQuestion",
  "comparison.title": "comparisonSlideTitle",
  "comparison.panels": "comparisonSlideBody",
  "stat.value": "statSlideValue",
  "stat.label": "statSlideLabel",
  "stat.subtext": "statSlideSubtext",
};

const FONT_SIZE_RANGE: Record<string, { min: number; max: number }> = {
  quoteSlide: { min: 24, max: 72 },
  codeSlideTitle: { min: 16, max: 56 },
  codeSlideExplanation: { min: 16, max: 56 },
  coverSlideTitle: { min: 24, max: 72 },
  codeSlideCode: { min: 12, max: 48 },
  outroSlideQuestion: { min: 20, max: 72 },
  comparisonSlideTitle: { min: 20, max: 72 },
  comparisonSlideBody: { min: 14, max: 48 },
  statSlideValue: { min: 40, max: 220 },
  statSlideLabel: { min: 20, max: 72 },
  statSlideSubtext: { min: 14, max: 48 },
};

type Props = {
  content: EpisodeContent;
  theme: Theme;
  slideIndex: number;
  debounceMs?: number;
  selectedTargetId?: string | null;
  onSelectTarget?: (id: string | null) => void;
  onSelectSlide?: (index: number) => void;
  onThemeChange?: (theme: Theme) => void;
  onUpdateSlide?: (slide: Slide) => void;
  saveStatus?: "idle" | "saving" | "synced" | "error";
  onPresent?: () => void;
};

type HitRect = {
  id: string;
  label: string;
  target: LayoutTarget;
  x: number; // slide coords
  y: number;
  w: number;
  h: number;
};

type DragState =
  | {
      mode: "move" | "resize" | "spacing";
      handle?: string;
      id: string;
      startX: number;
      startY: number;
      orig: { x: number; y: number; w: number; h: number };
    }
  | null;

export default function SlidePreview({
  content,
  theme,
  slideIndex,
  debounceMs = 300,
  selectedTargetId = null,
  onSelectTarget,
  onSelectSlide,
  onThemeChange,
  onUpdateSlide,
  saveStatus = "idle",
  onPresent,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(0.35);
  const [hits, setHits] = useState<HitRect[]>([]);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [dragging, setDragging] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const dragRef = useRef<DragState>(null);
  const reqId = useRef(0);
  const contentRef = useRef(content);
  contentRef.current = content;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const showSafeZonesRef = useRef(false);
  showSafeZonesRef.current = showSafeZones;
  const imageDragPending = useRef<{
    index: number;
    top: string;
    left: string;
    width?: string;
    height?: string;
  } | null>(null);

  const slideType = content.slides[slideIndex]?.type;
  const targets = useMemo(() => targetsForType(slideType), [slideType]);

  // Fingerprints: full reload only when non-layout visual inputs change
  const contentKey = useMemo(
    () => JSON.stringify({ slides: content.slides, series: content.series, i: slideIndex }),
    [content, slideIndex]
  );
  const styleKey = useMemo(
    () =>
      JSON.stringify({
        colors: theme.colors,
        fonts: theme.fonts,
        typography: theme.typography,
        effects: theme.effects,
        brand: theme.brand,
      }),
    [theme.colors, theme.fonts, theme.typography, theme.effects, theme.brand]
  );
  const layoutKey = useMemo(() => JSON.stringify(theme.layout), [theme.layout]);

  // Per-slide resolved styles via the core resolver — the single source of truth
  // for the effective sizes the canvas steppers display (theme default ←
  // styleOverrides ← legacy fontSizes folded into typography.fontSizeMax).
  const resolvedByIndex = useMemo(
    () => content.slides.map((s) => resolveSlideStyle(theme, s)),
    [content, theme]
  );

  const measureScale = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const pad = 24;
    const w = Math.max(0, el.clientWidth - pad);
    const h = Math.max(0, el.clientHeight - pad);
    if (w < 40 || h < 40) return;
    // Fill available space — no artificial max of 1 if panel is huge; still cap at 1
    // so we never upscale beyond native 1080 (crisp). Use full fill.
    const next = Math.min(w / SLIDE_W, h / SLIDE_H);
    setScale(next > 0.05 ? next : 0.2);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    measureScale();
    const ro = new ResizeObserver(() => measureScale());
    ro.observe(el);
    // re-measure after layout settles
    const t = requestAnimationFrame(() => measureScale());
    return () => {
      ro.disconnect();
      cancelAnimationFrame(t);
    };
  }, [measureScale]);

  const refreshHits = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const slide = doc?.getElementById("slide");
    if (!doc || !slide) {
      setHits([]);
      return;
    }
    const next: HitRect[] = [];
    for (const t of targets) {
      const el = doc.querySelector(t.selector) as HTMLElement | null;
      if (!el || el.classList.contains("hidden")) continue;
      const m = measureInSlide(el, slide);
      if (m.w < 2 || m.h < 2) continue;
      next.push({
        id: t.id,
        label: t.label,
        target: t,
        x: m.x,
        y: m.y,
        w: m.w,
        h: m.h,
      });
    }
    setHits(next);
  }, [targets]);

  /** Toggle Instagram safe-zone guides inside the loaded slide document. */
  const applySafeZoneAttr = useCallback((doc: Document, on: boolean) => {
    const slideEl = doc.getElementById("slide");
    if (!slideEl) return;
    if (on) slideEl.setAttribute("data-safe-zones", "true");
    else slideEl.removeAttribute("data-safe-zones");
  }, []);

  // React to safe-zone toggle changes against the live iframe
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) applySafeZoneAttr(doc, showSafeZones);
  }, [showSafeZones, status, applySafeZoneAttr]);

  /** Hot-patch layout boxes into the live iframe without re-fetching HTML. */
  const hotPatchLayout = useCallback(
    (layoutTheme: Theme) => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      // Update paragraph spacing CSS variable live
      const ps = (layoutTheme.layout as Record<string, Record<string, unknown>>)?.quoteSlide
        ?.paragraphSpacing;
      if (ps != null) {
        doc.documentElement.style.setProperty(
          "--layout-quote-paragraph-spacing",
          typeof ps === "number" ? `${ps}px` : String(ps)
        );
      }
      for (const t of targets) {
        if (t.id.startsWith("slide.image.")) continue; // images handled separately
        const el = doc.querySelector(t.selector) as HTMLElement | null;
        if (!el) continue;
        const box = getLayoutBox(layoutTheme, t.path);
        applyBoxToElement(el, box);
        if (t.resizeIconSize) {
          const size = (layoutTheme.layout as { coverSlide?: { iconSize?: string } })?.coverSlide
            ?.iconSize;
          if (size) {
            const frame = doc.querySelector(".icon-frame") as HTMLElement | null;
            if (frame) {
              frame.style.width = size;
              frame.style.height = size;
            }
          }
        }
      }
      // allow layout to settle then remeasure
      requestAnimationFrame(() => refreshHits());
    },
    [targets, refreshHits]
  );

  // Full HTML reload when content or non-layout style changes (not layout / drag)
  useEffect(() => {
    const id = ++reqId.current;
    setStatus("loading");
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, theme: themeRef.current, slideIndex }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Preview failed (${res.status})`);
        }
        const html = await res.text();
        if (id !== reqId.current) return;

        const iframe = iframeRef.current;
        const doc = iframe?.contentDocument;
        if (!doc) return;
        doc.open();
        doc.write(html);
        doc.close();

        // Wait for fonts + auto-fit
        await new Promise<void>((resolve) => {
          const check = () => {
            if (doc.documentElement.getAttribute("data-ready") === "true") resolve();
            else setTimeout(check, 40);
          };
          check();
          setTimeout(resolve, 2000);
        });

        if (id !== reqId.current) return;
        applySafeZoneAttr(doc, showSafeZonesRef.current);
        setStatus("ready");
        refreshHits();
      } catch (err) {
        if (id !== reqId.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    }, debounceMs);

    return () => clearTimeout(timer);
    // intentionally exclude theme.layout — handled by hot-patch.
    // contentKey/styleKey encode slides/style changes; slideIndex for navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, styleKey, slideIndex, debounceMs]);

  // Layout-only updates → hot patch (no full reload). Skip while dragging (already patched live).
  useEffect(() => {
    if (dragging) return;
    if (status !== "ready") return;
    hotPatchLayout(theme);
    // layoutKey encodes theme.layout changes; status is a guard, not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, dragging]);

  /** Get the font size key for a selected target, if applicable */
  const selectedFontSizeKey = selectedTargetId ? FONT_SIZE_KEY_MAP[selectedTargetId] : null;

  // Re-measure hits when scale changes (rects are in slide coords so overlay just re-renders)
  useEffect(() => {
    if (status === "ready") refreshHits();
  }, [scale, status, refreshHits]);

  const commitTheme = useCallback(
    (next: Theme) => {
      onThemeChange?.(next);
    },
    [onThemeChange]
  );

  const overlayRef = useRef<HTMLDivElement>(null);

  const onPointerDownHit = (e: React.PointerEvent, hit: HitRect, handle?: string) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectTarget?.(hit.id);
    const mode = handle ? "resize" : "move";
    dragRef.current = {
      mode,
      handle,
      id: hit.id,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: hit.x, y: hit.y, w: hit.w, h: hit.h },
    };
    setDragging(true);
    // Capture on overlay so move events keep firing outside the hit box
    overlayRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const hit = hits.find((h) => h.id === drag.id);
    if (!hit) return;

    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;

    let x = drag.orig.x;
    let y = drag.orig.y;
    let w = drag.orig.w;
    let h = drag.orig.h;

    if (drag.mode === "move") {
      x = drag.orig.x + dx;
      y = drag.orig.y + dy;
    } else if (drag.mode === "resize" && drag.handle) {
      const hd = drag.handle;
      if (hd.includes("e")) w = Math.max(40, drag.orig.w + dx);
      if (hd.includes("s")) h = Math.max(24, drag.orig.h + dy);
      if (hd.includes("w")) {
        w = Math.max(40, drag.orig.w - dx);
        x = drag.orig.x + dx;
      }
      if (hd.includes("n")) {
        h = Math.max(24, drag.orig.h - dy);
        y = drag.orig.y + dy;
      }
    }

    const others = hits
      .filter((h) => h.id !== drag.id)
      .map((h) => ({ x: h.x, y: h.y, w: h.w, h: h.h }));
    const snapped = snapPosition(x, y, w, h, others);
    x = snapped.x;
    y = snapped.y;
    setGuides(snapped.guides);

    // Update hit rects live
    setHits((prev) =>
      prev.map((ht) => (ht.id === drag.id ? { ...ht, x, y, w, h } : ht))
    );

    // Handle paragraph spacing drag
    if (drag.mode === "spacing") {
      const curPs = parseFloat(
        String(
          (themeRef.current.layout as Record<string, Record<string, unknown>>)?.quoteSlide
            ?.paragraphSpacing ?? 24
        )
      );
      const newPs = Math.max(0, Math.min(120, curPs + dy));
      const layout = structuredClone(themeRef.current.layout);
      if (!layout.quoteSlide) layout.quoteSlide = {};
      (layout.quoteSlide as Record<string, unknown>).paragraphSpacing = newPs;
      const nextTheme = { ...themeRef.current, layout };
      hotPatchLayout(nextTheme);
      themeRef.current = nextTheme;
      commitTheme(nextTheme);
      return;
    }

    // Hot-patch DOM
    const t = hit.target;
    const isImage = drag.id.startsWith("slide.image.");

    if (isImage) {
      // Image targets: hot-patch the iframe image element directly
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        const imgEl = doc.querySelector(t.selector) as HTMLElement | null;
        if (imgEl) {
          imgEl.style.top = pct((y / SLIDE_H) * 100);
          imgEl.style.left = pct((x / SLIDE_W) * 100);
          if (drag.mode === "resize") {
            imgEl.style.width = pct((w / SLIDE_W) * 100);
            imgEl.style.height = pct((h / SLIDE_H) * 100);
          }
        }
      }
      // Store pending position for commit on pointer up
      imageDragPending.current = {
        index: parseInt(drag.id.split(".")[2]),
        top: pct((y / SLIDE_H) * 100),
        left: pct((x / SLIDE_W) * 100),
        width: drag.mode === "resize" ? pct((w / SLIDE_W) * 100) : undefined,
        height: drag.mode === "resize" ? pct((h / SLIDE_H) * 100) : undefined,
      };
    } else {
      // Existing theme-based hot-patch
      let nextTheme = themeRef.current;

      if (t.resizeIconSize && drag.mode === "resize") {
        const sizePct = (w / SLIDE_W) * 100;
        nextTheme = setLayoutBox(nextTheme, ["coverSlide", "iconSize"], pct(sizePct, 1));
        const box = getLayoutBox(nextTheme, t.path);
        const posBox = {
          ...box,
          top: pct((y / SLIDE_H) * 100),
          center: box.center !== false,
          left: box.center !== false ? undefined : pct((x / SLIDE_W) * 100),
        };
        nextTheme = setLayoutBox(nextTheme, t.path, posBox);
      } else {
        const box = rectToBox(x, y, w, h, {
          keepWidth: t.resizeWidth || drag.mode === "resize",
          keepHeight: t.resizeHeight || (drag.mode === "resize" && !!drag.handle?.match(/[ns]/)),
          center: false,
        });
        const prev = getLayoutBox(themeRef.current, t.path);
        if (!t.resizeHeight && prev.height && drag.mode === "move") {
          box.height = prev.height;
        }
        if (!t.resizeWidth && prev.width && drag.mode === "move") {
          // still write width from measured for consistency when moving
        }
        nextTheme = setLayoutBox(nextTheme, t.path, box);
      }

      hotPatchLayout(nextTheme);
      themeRef.current = nextTheme;
      commitTheme(nextTheme);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const wasImage = dragRef.current.id.startsWith("slide.image.");
    dragRef.current = null;
    setDragging(false);
    setGuides([]);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    // Commit image position changes to slide data
    if (wasImage && imageDragPending.current) {
      const pending = imageDragPending.current;
      imageDragPending.current = null;
      const curSlide: Slide | undefined = contentRef.current?.slides[slideIndex];
      if (curSlide && curSlide.images && curSlide.images[pending.index] && onUpdateSlide) {
        const updatedImages = [...curSlide.images];
        updatedImages[pending.index] = {
          ...updatedImages[pending.index],
          top: pending.top,
          left: pending.left,
          width: pending.width ?? updatedImages[pending.index].width,
          height: pending.height ?? updatedImages[pending.index].height,
        };
        onUpdateSlide({ ...curSlide, images: updatedImages });
      }
    }

    // Final measure after layout settles
    requestAnimationFrame(() => refreshHits());
  };

  const frameW = SLIDE_W * scale;
  const frameH = SLIDE_H * scale;

  const ZOOM_STEPS = [0.2, 0.35, 0.5, 0.65, 0.8, 1.0];
  const zoomIn = () => {
    const idx = ZOOM_STEPS.findIndex((s) => s >= scale + 0.01);
    if (idx >= 0) setScale(ZOOM_STEPS[idx]);
  };
  const zoomOut = () => {
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
      if (ZOOM_STEPS[i] <= scale - 0.01) { setScale(ZOOM_STEPS[i]); return; }
    }
  };
  const zoomFit = () => measureScale();

  const statusLabel = dragging
    ? "Dragging…"
    : status === "loading"
      ? "Updating…"
      : status === "error"
        ? "Error"
        : saveStatus === "saving"
          ? "Saving…"
          : saveStatus === "error"
            ? "Save failed"
            : "Synced";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #DDE0ED", height: 74 }}>
        <div>
          <div style={{ margin: "0 0 4px", color: "#6A7389", fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 500, letterSpacing: ".1em" }}>LIVE PREVIEW</div>
          <div style={{ margin: 0, color: "#8E96A8", fontSize: 10 }}>Instagram carousel · 1080 × 1350</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className={`toggle-btn ${showSafeZones ? "active" : ""}`}
            onClick={() => setShowSafeZones((v) => !v)}
            title="Overlay Instagram UI danger zones (top 120px / bottom 100px / sides 80px)"
            aria-pressed={showSafeZones}
          >
            {showSafeZones ? "◼ Safe zones" : "◻ Safe zones"}
          </button>
          <div style={{ height: 25, borderRadius: 14, padding: "0 9px", background: "#F0F1F7", color: "#6A7389", fontFamily: "JetBrains Mono, monospace", fontSize: 10, display: "flex", alignItems: "center", gap: 6, border: "1px solid #DDE0ED" }}>
            <span className="sync-dot" />
            {statusLabel}
          </div>
        </div>
      </div>

      <div ref={wrapRef} className="preview-stage">
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 16,
              zIndex: 10,
              background: "rgba(255,255,255,0.95)",
              border: "1px solid var(--danger)",
              borderRadius: 10,
              padding: 16,
              color: "var(--danger)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          ref={frameRef}
          className="preview-frame"
          style={{ width: frameW, height: frameH }}
          onPointerDown={() => onSelectTarget?.(null)}
        >
          <iframe
            ref={iframeRef}
            title="slide-preview"
            style={{
              width: SLIDE_W,
              height: SLIDE_H,
              transform: `scale(${scale})`,
            }}
          />

          <div
            ref={overlayRef}
            className="canvas-overlay"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {guides.map((g, i) => (
              <div
                key={i}
                className={`snap-guide ${g.type}`}
                style={
                  g.type === "v"
                    ? { left: (g.pos / SLIDE_W) * 100 + "%" }
                    : { top: (g.pos / SLIDE_H) * 100 + "%" }
                }
              />
            ))}

            {hits.map((hit) => {
              const selected = selectedTargetId === hit.id;
              const t = hit.target;
              const fsKey = selectedFontSizeKey;
              const currentSlide: Slide | undefined = content.slides[slideIndex];
              const hasMultipleParas =
                currentSlide?.type === "quote" &&
                (currentSlide.paragraphs?.length ?? 1) > 1;
              const resolvedCur = resolvedByIndex[slideIndex];
              const effectiveFontSize: number = fsKey
                ? (resolvedCur?.typography[fsKey]?.fontSizeMax ??
                  resolvedCur?.typography[fsKey]?.fontSize ??
                  0)
                : 0;
              const fsRange = fsKey ? FONT_SIZE_RANGE[fsKey] : undefined;
              return (
                <div
                  key={hit.id}
                  className={`canvas-hit ${selected ? "selected" : ""}`}
                  style={{
                    left: (hit.x / SLIDE_W) * 100 + "%",
                    top: (hit.y / SLIDE_H) * 100 + "%",
                    width: (hit.w / SLIDE_W) * 100 + "%",
                    height: (hit.h / SLIDE_H) * 100 + "%",
                  }}
                  onPointerDown={(e) => onPointerDownHit(e, hit)}
                >
                  {selected && <span className="canvas-label">{hit.label}</span>}
                  {selected && (
                    <>
                      {(t.resizeWidth || t.resizeHeight || t.resizeIconSize) && (
                        <>
                          {(t.resizeWidth || t.resizeIconSize) && (
                            <>
                              <span
                                className="handle e"
                                onPointerDown={(e) => onPointerDownHit(e, hit, "e")}
                              />
                              <span
                                className="handle w"
                                onPointerDown={(e) => onPointerDownHit(e, hit, "w")}
                              />
                            </>
                          )}
                          {(t.resizeHeight || t.resizeIconSize) && (
                            <>
                              <span
                                className="handle n"
                                onPointerDown={(e) => onPointerDownHit(e, hit, "n")}
                              />
                              <span
                                className="handle s"
                                onPointerDown={(e) => onPointerDownHit(e, hit, "s")}
                              />
                            </>
                          )}
                          {(t.resizeWidth && t.resizeHeight) || t.resizeIconSize ? (
                            <>
                              <span
                                className="handle nw"
                                onPointerDown={(e) => onPointerDownHit(e, hit, "nw")}
                              />
                              <span
                                className="handle ne"
                                onPointerDown={(e) => onPointerDownHit(e, hit, "ne")}
                              />
                              <span
                                className="handle sw"
                                onPointerDown={(e) => onPointerDownHit(e, hit, "sw")}
                              />
                              <span
                                className="handle se"
                                onPointerDown={(e) => onPointerDownHit(e, hit, "se")}
                              />
                            </>
                          ) : null}
                        </>
                      )}
                      {hasMultipleParas && hit.id === "quote.text" && (
                        <span
                          className="handle spacing-handle"
                          title="Drag to adjust paragraph spacing"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            onSelectTarget?.(hit.id);
                            const mode = "spacing";
                            dragRef.current = {
                              mode,
                              id: hit.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              orig: { x: hit.x, y: hit.y, w: hit.w, h: hit.h },
                            };
                            setDragging(true);
                            overlayRef.current?.setPointerCapture(e.pointerId);
                          }}
                        />
                      )}
                      {fsKey && fsRange && (
                        <div className="canvas-fontsize">
                          <button
                            className="canvas-fs-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                               const next = Math.max(fsRange.min, effectiveFontSize - 2);
                              if (currentSlide && onUpdateSlide) {
                                onUpdateSlide({
                                  ...currentSlide,
                                  fontSizes: { ...currentSlide.fontSizes, [fsKey]: next },
                                });
                              }
                            }}
                          >
                            –
                          </button>
                           <span className="canvas-fs-value">
                             {effectiveFontSize}
                           </span>
                          <button
                            className="canvas-fs-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                               const next = Math.min(fsRange.max, effectiveFontSize + 2);
                              if (currentSlide && onUpdateSlide) {
                                onUpdateSlide({
                                  ...currentSlide,
                                  fontSizes: { ...currentSlide.fontSizes, [fsKey]: next },
                                });
                              }
                            }}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Canvas controls */}
        <div className="canvas-controls">
          <button onClick={zoomOut} title="Zoom out" aria-label="Zoom out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10.5" cy="10.5" r="6.5" /><path d="M21 21l-5.8-5.8M7.5 10.5h6" />
            </svg>
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} title="Zoom in" aria-label="Zoom in">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10.5" cy="10.5" r="6.5" /><path d="M21 21l-5.8-5.8M10.5 7.5v6M7.5 10.5h6" />
            </svg>
          </button>
          <i />
          <button onClick={zoomFit} title="Fit to panel" aria-label="Fit to panel">FIT</button>
        </div>

        {/* Canvas caption */}
        <div className="canvas-caption">
          <span>Slide {slideIndex + 1} of {content.slides.length}</span>
          <button onClick={onPresent || (() => {})} title="Present" aria-label="Present">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 9 6-9 6V6Z" />
            </svg>
            عرض
          </button>
        </div>
      </div>

      {/* Filmstrip */}
      <div className="filmstrip">
        <div className="filmstrip-title">
          <span>SLIDE DECK</span>
          <button onClick={() => onSelectSlide?.(0)} title="Reorder slides" aria-label="Reorder slides">Reorder</button>
        </div>
        <div className="thumbnail-row">
          <SlideThumbnails
            content={content}
            theme={theme}
            contentKey={contentKey}
            styleKey={styleKey}
            activeIndex={slideIndex}
            onSelect={onSelectSlide}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Lazy thumbnail strip: renders every slide of the carousel into small
 * scaled iframes via /api/preview, cached per content/style fingerprint.
 */
function SlideThumbnails({
  content,
  theme,
  contentKey,
  styleKey,
  activeIndex,
  onSelect,
}: {
  content: EpisodeContent;
  theme: Theme;
  contentKey: string;
  styleKey: string;
  activeIndex: number;
  onSelect?: (index: number) => void;
}) {
  const THUMB_W = 64;
  const THUMB_SCALE = THUMB_W / SLIDE_W;
  const THUMB_H = Math.round(SLIDE_H * THUMB_SCALE);
  const [htmlByIndex, setHtmlByIndex] = useState<Record<number, string>>({});
  const cacheKey = useMemo(() => `${contentKey}::${styleKey}`, [contentKey, styleKey]);
  const cacheRef = useRef<{ key: string; html: Record<number, string> }>({ key: "", html: {} });

  useEffect(() => {
    let cancelled = false;
    if (cacheRef.current.key === cacheKey) {
      setHtmlByIndex(cacheRef.current.html);
      return;
    }
    setHtmlByIndex({});
    const timer = setTimeout(async () => {
      const collected: Record<number, string> = {};
      // Fetch all thumbnails in parallel (max 8 concurrent to avoid overwhelming the server)
      const BATCH = 8;
      for (let batch = 0; batch < content.slides.length; batch += BATCH) {
        if (cancelled) return;
        const slice = content.slides.slice(batch, batch + BATCH);
        const results = await Promise.allSettled(
          slice.map((_, i) =>
            fetch("/api/preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content, theme, slideIndex: batch + i }),
            }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Preview ${batch + i} failed`))))
          )
        );
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          if (r.status === "fulfilled") {
            collected[batch + j] = r.value;
          }
        }
        if (!cancelled) setHtmlByIndex({ ...collected });
      }
      cacheRef.current = { key: cacheKey, html: collected };
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cacheKey, content, theme]);

  const writeThumb = (el: HTMLIFrameElement | null, html?: string) => {
    if (!el) return;
    const doc = el.contentDocument;
    if (!doc || !html) return;
    if (el.dataset.loaded === html) return;
    doc.open();
    doc.write(html);
    doc.close();
    el.dataset.loaded = html;
  };

  return (
    <>
      {content.slides.map((s, i) => (
        <button
          key={i}
          className={`thumb ${i === activeIndex ? "selected" : ""}`}
          onClick={() => onSelect?.(i)}
          title={`Slide ${i + 1} (${s.type})`}
        >
          {htmlByIndex[i] ? (
            <iframe
              ref={(el) => writeThumb(el, htmlByIndex[i])}
              title={`thumb-${i}`}
              scrolling="no"
              style={{
                width: SLIDE_W,
                height: SLIDE_H,
                transform: `scale(${THUMB_SCALE})`,
                transformOrigin: "top left",
                border: "none",
                pointerEvents: "none",
              }}
            />
          ) : (
            <div className="thumb-art">
              <small>{String(i + 1).padStart(2, "0")} —</small>
              <strong>{s.type}</strong>
            </div>
          )}
        </button>
      ))}
      <button className="thumb add-thumb" title="Add slide" aria-label="Add slide">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" /><path d="M5 12h14" />
        </svg>
      </button>
    </>
  );
}

"use client";

import { useMemo } from "react";
import type { Slide, Theme } from "@sitehie/core/domain";
import { resolveSlideStyle } from "@sitehie/core/resolver";
import { toHex } from "@/lib/colorVerify";
import ColorPicker from "./ColorPicker";

type StyleOverride = NonNullable<Slide["styleOverrides"]>;

/** Drop empty sections off the override bag so stored JSON stays tidy. */
function pruneStyleOverride(so: StyleOverride): StyleOverride | undefined {
  const out: StyleOverride = {};
  if (so.colors && Object.keys(so.colors).length) out.colors = so.colors;
  if (so.typography && Object.keys(so.typography).length) out.typography = so.typography;
  if (so.layout && Object.keys(so.layout).length) out.layout = so.layout;
  if (so.effects && Object.keys(so.effects).length) out.effects = so.effects;
  return Object.keys(out).length ? out : undefined;
}

/** Color tokens whose surfaces are visible on each slide type (from template usage). */
const COLOR_CHOICES: Record<Slide["type"], { key: string; label: string }[]> = {
  cover: [
    { key: "background", label: "Background" },
    { key: "primary", label: "Primary" },
    { key: "surface", label: "Surface" },
    { key: "iconFrame", label: "Icon frame" },
    { key: "textPrimary", label: "Text primary" },
  ],
  quote: [
    { key: "background", label: "Background" },
    { key: "primary", label: "Primary" },
    { key: "textPrimary", label: "Text primary" },
    { key: "textSecondary", label: "Text secondary" },
    { key: "highlightMarker", label: "Highlight marker" },
  ],
  code: [
    { key: "background", label: "Background" },
    { key: "primary", label: "Primary" },
    { key: "codeBackground", label: "Code background" },
    { key: "codeText", label: "Code text" },
    { key: "textPrimary", label: "Text primary" },
  ],
  outro: [
    { key: "background", label: "Background" },
    { key: "primary", label: "Primary" },
    { key: "surface", label: "Surface" },
    { key: "iconFrame", label: "Icon frame" },
    { key: "textPrimary", label: "Text primary" },
  ],
  comparison: [
    { key: "background", label: "Background" },
    { key: "primary", label: "Primary" },
    { key: "surface", label: "Surface" },
    { key: "textPrimary", label: "Text primary" },
    { key: "textSecondary", label: "Text secondary" },
  ],
  stat: [
    { key: "background", label: "Background" },
    { key: "primary", label: "Primary" },
    { key: "textPrimary", label: "Text primary" },
    { key: "textSecondary", label: "Text secondary" },
  ],
  canvas: [
    { key: "background", label: "Background" },
    { key: "primary", label: "Primary" },
    { key: "textPrimary", label: "Text primary" },
  ],
};

/** Main text-surface alignment control per slide type → layout override path. */
const ALIGN_TARGET: Record<
  Slide["type"],
  { section: string; key: string; label: string }
> = {
  cover: { section: "coverSlide", key: "titleAlign", label: "Title alignment" },
  quote: { section: "quoteSlide", key: "textAlign", label: "Text alignment" },
  code: { section: "codeSlide", key: "explanationAlign", label: "Explanation alignment" },
  outro: { section: "outroSlide", key: "questionAlign", label: "Question alignment" },
  comparison: { section: "comparisonSlide", key: "titleAlign", label: "Title alignment" },
  stat: { section: "statSlide", key: "align", label: "Content alignment" },
  canvas: { section: "canvasSlide", key: "align", label: "Content alignment" },
};

const ALIGN_OPTIONS = ["right", "center", "left"] as const;

/** Normalize any CSS color to a 6-digit hex for the native color input. */
function toHexColor(c: string): string {
  return toHex(c) || "#000000";
}

function ScopeBadge({ overridden }: { overridden: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        fontFamily: "JetBrains Mono, monospace",
        letterSpacing: ".04em",
        color: overridden ? "#3D52D5" : "#6A7389",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: overridden ? "#3D52D5" : "#DDE0ED",
        }}
      />
      {overridden ? "Slide override" : "Theme default"}
    </span>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Use the theme default for this control"
      style={{
        border: "1px solid #DDE0ED",
        background: "transparent",
        color: "#6A7389",
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: 10,
        cursor: "pointer",
      }}
    >
      Clear
    </button>
  );
}

type Props = {
  slide: Slide;
  theme: Theme;
  onChange: (slide: Slide) => void;
};

export default function SlideStylePanel({ slide, theme, onChange }: Props) {
  const resolved = useMemo(() => resolveSlideStyle(theme, slide), [theme, slide]);

  const so = slide.styleOverrides ?? {};
  const layout = so.layout ?? {};

  const setColor = (key: string, value: string) => {
    onChange({
      ...slide,
      styleOverrides: pruneStyleOverride({
        ...so,
        colors: { ...(so.colors ?? {}), [key]: value },
      }),
    });
  };

  const clearColor = (key: string) => {
    if (!so.colors?.[key]) return;
    const colors = { ...so.colors };
    delete colors[key];
    onChange({ ...slide, styleOverrides: pruneStyleOverride({ ...so, colors }) });
  };

  const setLayout = (section: string, patch: Record<string, unknown>) => {
    onChange({
      ...slide,
      styleOverrides: pruneStyleOverride({
        ...so,
        layout: { ...layout, [section]: { ...(layout[section] ?? {}), ...patch } },
      }),
    });
  };

  const clearLayoutKey = (section: string, key: string) => {
    const sec = layout[section];
    if (!sec || sec[key] === undefined) return;
    const next = { ...sec };
    delete next[key];
    const nextLayout = { ...layout };
    if (Object.keys(next).length) nextLayout[section] = next;
    else delete nextLayout[section];
    onChange({ ...slide, styleOverrides: pruneStyleOverride({ ...so, layout: nextLayout }) });
  };

  const readLayout = (section: string, key: string): unknown => {
    const sec = (resolved.layout as unknown as Record<string, Record<string, unknown>>)[section];
    return sec?.[key];
  };

  const align = ALIGN_TARGET[slide.type];
  const alignVal = String(readLayout(align.section, align.key) ?? "") as (typeof ALIGN_OPTIONS)[number];
  const alignOverridden = layout[align.section]?.[align.key] !== undefined;

  const codeBlocks = slide.type === "code";
  const radiusRaw = readLayout("codeSlide", "codeBlockBorderRadius");
  const radiusVal = typeof radiusRaw === "number" ? radiusRaw : 16;
  const radiusOverridden = layout.codeSlide?.codeBlockBorderRadius !== undefined;
  const paddingRaw = readLayout("codeSlide", "codeBlockPadding");
  const paddingVal =
    typeof paddingRaw === "number" ? paddingRaw : parseFloat(String(paddingRaw ?? "")) || 24;
  const paddingOverridden = layout.codeSlide?.codeBlockPadding !== undefined;

  return (
    <div>
      <p className="muted" style={{ fontSize: 11, marginBottom: 16, lineHeight: 1.5 }}>
        Style overrides apply to <strong>this slide only</strong> — other slides keep the theme
        default. Clear an override to fall back to the theme.
      </p>

      <h3 style={{ fontSize: 12, marginBottom: 10, color: "var(--text-muted)" }}>COLORS</h3>
      {COLOR_CHOICES[slide.type].map(({ key, label }) => {
        const effective = resolved.colors[key] || "#000000";
        const overridden = so.colors?.[key] != null;
        return (
          <div key={key} className="color-row" style={{ marginBottom: 10 }}>
            <ColorPicker value={toHexColor(effective)} onChange={(v) => setColor(key, v)} />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 12,
                  marginBottom: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{label}</span>
                <ScopeBadge overridden={overridden} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  value={effective}
                  onChange={(e) => setColor(key, e.target.value)}
                />
                {overridden && <ClearButton onClick={() => clearColor(key)} />}
              </div>
            </div>
          </div>
        );
      })}

      <h3 style={{ fontSize: 12, margin: "18px 0 10px", color: "var(--text-muted)" }}>
        ALIGNMENT
      </h3>
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label>{align.label}</label>
          <ScopeBadge overridden={alignOverridden} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {ALIGN_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className="control"
              style={{
                textAlign: "center",
                cursor: "pointer",
                borderColor: alignVal === opt ? "#3D52D5" : "#DDE0ED",
                background: alignVal === opt ? "rgba(61,82,213,0.08)" : "#F0F1F7",
                color: alignVal === opt ? "#3D52D5" : "#6A7389",
                fontWeight: alignVal === opt ? 700 : 400,
              }}
              onClick={() => setLayout(align.section, { [align.key]: opt })}
            >
              {opt}
            </button>
          ))}
        </div>
        {alignOverridden && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <ClearButton onClick={() => clearLayoutKey(align.section, align.key)} />
          </div>
        )}
      </div>

      {codeBlocks && (
        <>
          <h3 style={{ fontSize: 12, margin: "18px 0 10px", color: "var(--text-muted)" }}>
            CODE BLOCK
          </h3>
          <div className="slider-row">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="meta" style={{ marginBottom: 0 }}>
                <span>Corner radius</span>
                <span>{radiusVal}px</span>
              </span>
              <ScopeBadge overridden={radiusOverridden} />
            </div>
            <input
              type="range"
              min={0}
              max={40}
              step={1}
              value={radiusVal}
              onChange={(e) => setLayout("codeSlide", { codeBlockBorderRadius: Number(e.target.value) })}
              aria-label="Code block corner radius"
            />
            {radiusOverridden && <ClearButton onClick={() => clearLayoutKey("codeSlide", "codeBlockBorderRadius")} />}
          </div>

          <div className="slider-row">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="meta" style={{ marginBottom: 0 }}>
                <span>Inner padding</span>
                <span>{paddingVal}px</span>
              </span>
              <ScopeBadge overridden={paddingOverridden} />
            </div>
            <input
              type="range"
              min={8}
              max={48}
              step={1}
              value={paddingVal}
              onChange={(e) => setLayout("codeSlide", { codeBlockPadding: `${Number(e.target.value)}px` })}
              aria-label="Code block inner padding"
            />
            {paddingOverridden && <ClearButton onClick={() => clearLayoutKey("codeSlide", "codeBlockPadding")} />}
          </div>
        </>
      )}
    </div>
  );
}
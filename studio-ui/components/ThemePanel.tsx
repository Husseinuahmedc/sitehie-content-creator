"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Theme } from "@sitehie/core/domain";
import { toHex } from "@/lib/colorVerify";
import { getLayoutBox, setLayoutBox } from "@/lib/layoutTargets";
import ColorPicker from "./ColorPicker";
import FontPicker, { type FontInfo } from "./FontPicker";

const COLOR_KEYS: { key: string; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "textPrimary", label: "Text primary" },
  { key: "textSecondary", label: "Text secondary" },
  { key: "codeBackground", label: "Code background" },
  { key: "highlightMarker", label: "Highlight marker" },
  { key: "cyanWord", label: "Cyan word" },
  { key: "badgeBackground", label: "Badge" },
  { key: "progressFill", label: "Progress fill" },
  { key: "annotationBg", label: "Annotation" },
  { key: "iconFrame", label: "Icon frame" },
];

const FONT_ROLES: { key: string; label: string; typographyKeys: string[] }[] = [
  {
    key: "arabicPrimary",
    label: "Arabic heading",
    typographyKeys: ["quoteSlide", "coverSlideTitle"],
  },
  {
    key: "arabicSecondary",
    label: "Arabic body",
    typographyKeys: ["codeSlideExplanation", "coverSlideHint", "codeSlideAnnotation"],
  },
  {
    key: "codeMono",
    label: "Code mono",
    typographyKeys: ["codeSlideCode"],
  },
  {
    key: "englishHeading",
    label: "English heading",
    typographyKeys: ["codeSlideTitle", "codeSlideSubtitle", "coverSlideSeries", "codeSlideNumber", "codeSlideFooter"],
  },
];

type LayoutSlider = {
  path: string[];
  label: string;
  min: number;
  max: number;
  unit?: string;
};

const LAYOUT_SLIDERS: (LayoutSlider & { targetId?: string })[] = [
  { path: ["quoteSlide", "textPosition", "top"], label: "Quote text top", min: 0, max: 80, targetId: "quote.text" },
  { path: ["quoteSlide", "textPosition", "left"], label: "Quote text left", min: 0, max: 40, targetId: "quote.text" },
  { path: ["quoteSlide", "textPosition", "width"], label: "Quote text width", min: 40, max: 100, targetId: "quote.text" },
  { path: ["quoteSlide", "paragraphSpacing"], label: "Paragraph spacing", min: 0, max: 120, unit: "px", targetId: "quote.text" },
  { path: ["codeSlide", "titlePosition", "top"], label: "Title top", min: 0, max: 40, targetId: "code.title" },
  { path: ["codeSlide", "titlePosition", "left"], label: "Title left", min: 0, max: 40, targetId: "code.title" },
  { path: ["codeSlide", "codeBlockPosition", "top"], label: "Code block top", min: 5, max: 50, targetId: "code.block" },
  { path: ["codeSlide", "codeBlockPosition", "left"], label: "Code block left", min: 0, max: 30, targetId: "code.block" },
  { path: ["codeSlide", "codeBlockPosition", "width"], label: "Code block width", min: 40, max: 100, targetId: "code.block" },
  { path: ["codeSlide", "explanationPosition", "top"], label: "Explanation top", min: 30, max: 85, targetId: "code.explanation" },
  { path: ["codeSlide", "explanationPosition", "left"], label: "Explanation left", min: 0, max: 30, targetId: "code.explanation" },
  { path: ["codeSlide", "progressBarPosition", "bottom"], label: "Progress bottom", min: 1, max: 20, targetId: "code.progress" },
  { path: ["codeSlide", "footerPosition", "bottom"], label: "Footer bottom", min: 0, max: 15, targetId: "code.footer" },
  { path: ["coverSlide", "iconPosition", "top"], label: "Cover icon top", min: 5, max: 50, targetId: "cover.icon" },
  { path: ["coverSlide", "titlePosition", "top"], label: "Cover title top", min: 40, max: 90, targetId: "cover.title" },
  { path: ["coverSlide", "iconSize"], label: "Cover icon size", min: 15, max: 70, targetId: "cover.icon" },
];

const LAYOUT_GROUPS: { label: string; prefix: string }[] = [
  { label: "Quote", prefix: "quoteSlide" },
  { label: "Code", prefix: "codeSlide" },
  { label: "Cover", prefix: "coverSlide" },
];

type Props = {
  theme: Theme;
  themeFile: string;
  onChange: (theme: Theme) => void;
  onSave: (mode: "update" | "new", newName?: string) => Promise<void>;
  saving?: boolean;
  selectedTargetId?: string | null;
  onSelectTarget?: (id: string | null) => void;
};

/** Normalize any CSS color to a 6-digit hex string for the color input. */
function toHexColor(c: string): string {
  return toHex(c) || "#000000";
}

type SectionProps = {
  id: string;
  title: string;
  count?: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

function Section({ id, title, count, hint, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="tp-section">
      <button
        type="button"
        className="tp-section-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="tp-section-title">{title}</span>
        {count && <span className="tp-section-count">{count}</span>}
        <span className={`tp-section-chevron${open ? " open" : ""}`} aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="tp-section-body" id={id}>
          {hint && (
            <p className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
              {hint}
            </p>
          )}
          {children}
        </div>
      )}
    </section>
  );
}

export default function ThemePanel({
  theme,
  themeFile,
  onChange,
  onSave,
  saving,
  selectedTargetId,
  onSelectTarget,
}: Props) {
  const [newThemeOpen, setNewThemeOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState(`${theme.name || "custom"}-copy`);
  const [familyOpen, setFamilyOpen] = useState(false);
  const familyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!familyOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (familyRef.current && !familyRef.current.contains(e.target as Node)) {
        setFamilyOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [familyOpen]);

  const setColor = (key: string, value: string) => {
    onChange({ ...theme, colors: { ...theme.colors, [key]: value } });
  };

  const setFontRole = (roleKey: string, font: FontInfo) => {
    const fontEntry = {
      family: font.family,
      path: font.path,
      weight: font.weight,
      format: font.format,
    };
    const fonts = { ...theme.fonts, [roleKey]: fontEntry };

    // Keep black/bold variants in sync if they share family naming conventions
    if (roleKey === "arabicPrimary" && theme.fonts.arabicPrimaryBlack) {
      fonts.arabicPrimaryBlack = {
        ...theme.fonts.arabicPrimaryBlack,
        family: font.family,
      };
    }

    const typography = { ...theme.typography };
    const role = FONT_ROLES.find((r) => r.key === roleKey);
    if (role) {
      for (const tk of role.typographyKeys) {
        if (typography[tk]) {
          typography[tk] = { ...typography[tk], fontFamily: roleKey };
        }
      }
    }

    onChange({ ...theme, fonts, typography });
  };

  const setLayoutPct = (pathParts: string[], pctValue: number) => {
    const isParagraphSpacing = pathParts[pathParts.length - 1] === "paragraphSpacing";
    const value = isParagraphSpacing ? `${pctValue}px` : `${pctValue}%`;
    const next = setLayoutBox(theme, pathParts, value);
    onChange(next);
  };

  const readPct = (pathParts: string[]): number => {
    const last = pathParts[pathParts.length - 1];
    const box = getLayoutBox(theme, pathParts.slice(0, -1));
    const val = box[last as keyof typeof box];
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseFloat(val) || 0;
    return 0;
  };

  return (
    <div className="panel-body scroll-y" style={{ flex: 1 }}>
      {/* New theme name modal */}
      {newThemeOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
          }}
        >
          <div
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: "90%",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              Save as new theme
            </div>
            <div className="field">
              <label>Theme file name (without extension)</label>
              <input
                autoFocus
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newThemeName.trim()) {
                    onSave("new", newThemeName.trim());
                    setNewThemeOpen(false);
                  }
                  if (e.key === "Escape") setNewThemeOpen(false);
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary"
                disabled={!newThemeName.trim() || saving}
                onClick={() => {
                  onSave("new", newThemeName.trim());
                  setNewThemeOpen(false);
                }}
              >
                Save
              </button>
              <button className="btn" onClick={() => setNewThemeOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Editing <strong style={{ color: "var(--text)" }}>{themeFile}</strong>
        {theme.description ? ` — ${theme.description}` : ""}
      </div>

      <Section id="tp-appearance" title="Appearance" defaultOpen>
        <div className="tp-sub">Brand</div>
        <div className="field-row">
          <div className="field">
            <label>Handle</label>
            <input
              dir="ltr"
              value={theme.brand?.handle || ""}
              onChange={(e) =>
                onChange({ ...theme, brand: { ...theme.brand, handle: e.target.value } })
              }
              placeholder="@sitehie"
            />
          </div>
          <div className="field">
            <label>Theme family</label>
            <div ref={familyRef} style={{ position: "relative" }}>
              <button
                className="control"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onClick={() => setFamilyOpen((v) => !v)}
                title="Stamped onto #slide[data-theme] for CSS refinements"
              >
                {theme.family || "dark"}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {familyOpen && (
                <div className="dropdown-menu" style={{ left: 0, right: 0 }}>
                  {(["dark", "light", "cyberpunk"] as const).map((f) => (
                    <button
                      key={f}
                      className="dropdown-item"
                      onClick={() => {
                        onChange({ ...theme, family: f });
                        setFamilyOpen(false);
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section id="tp-colors" title="Colors" count={`${COLOR_KEYS.length}`} defaultOpen>
        {COLOR_KEYS.map(({ key, label }) => {
          const val = theme.colors[key] || "#000000";
          return (
            <div className="color-row" key={key}>
              <ColorPicker value={toHexColor(val)} onChange={(v) => setColor(key, v)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
                <input
                  type="text"
                  value={val}
                  onChange={(e) => setColor(key, e.target.value)}
                />
              </div>
            </div>
          );
        })}
      </Section>

      <Section id="tp-typography" title="Typography" count={`${FONT_ROLES.length}`}>
        {FONT_ROLES.map((role) => {
          const f = theme.fonts[role.key];
          return (
            <FontPicker
              key={role.key}
              label={role.label}
              valuePath={f?.path}
              valueFamily={f?.family}
              onSelect={(font) => setFontRole(role.key, font)}
            />
          );
        })}
      </Section>

      <Section
        id="tp-layout"
        title="Layout"
        count={`${LAYOUT_SLIDERS.length}`}
        hint="Drag elements on the live preview, or use sliders for precise values."
      >
        {LAYOUT_GROUPS.map((group) => {
          const sliders = LAYOUT_SLIDERS.filter((s) => s.path[0] === group.prefix);
          if (sliders.length === 0) return null;
          return (
            <div key={group.prefix}>
              <div className="tp-sub">{group.label}</div>
              {sliders.map((s) => {
                const v = readPct(s.path);
                const focused = s.targetId && s.targetId === selectedTargetId;
                return (
                  <div
                    className={`slider-row layout-slider${focused ? " focused" : ""}`}
                    key={s.path.join(".")}
                    data-target={s.targetId || ""}
                    onClick={() => s.targetId && onSelectTarget?.(s.targetId)}
                  >
                    <div className="meta">
                      <span>{s.label}</span>
                      <span>{s.unit ? `${v}${s.unit}` : `${v}%`}</span>
                    </div>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={0.5}
                      value={Number.isFinite(v) ? v : s.min}
                      onChange={(e) => {
                        if (s.targetId) onSelectTarget?.(s.targetId);
                        setLayoutPct(s.path, Number(e.target.value));
                      }}
                      aria-label={s.label}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </Section>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button
          className="btn btn-primary"
          disabled={saving}
          onClick={() => onSave("update")}
        >
          {saving ? "Saving…" : "Update theme"}
        </button>
        <button
          className="btn"
          disabled={saving}
          onClick={() => {
            setNewThemeName(`${theme.name || "custom"}-copy`);
            setNewThemeOpen(true);
          }}
        >
          Save as new theme
        </button>
      </div>
    </div>
  );
}
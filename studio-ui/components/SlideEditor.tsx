"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ParagraphBlock, Slide, SlideImage, Theme } from "@sitehie/core/domain";
import { resolveSlideStyle } from "@sitehie/core/resolver";
import type { ResolvedStyle } from "@sitehie/core/resolver";

type CodeLanguage = (typeof import("@sitehie/render-engine").SUPPORTED_LANGUAGES)[number];
import ImageUploader from "./ImageUploader";
import AssetPicker from "./AssetPicker";
import TechIconPicker from "./TechIconPicker";
import CodeEditor from "./CodeEditor";
// Konva requires browser APIs — load the canvas editor client-side only.
const CanvasEditor = dynamic(() => import("./CanvasEditor"), { ssr: false });

type Props = {
  slide: Slide;
  index: number;
  onChange: (slide: Slide) => void;
  themeName?: string;
  themeFamily?: "dark" | "light" | "cyberpunk";
  /** Theme this slide belongs to — resolved per-slide for effective values. */
  theme: Theme;
};

const FONT_SIZE_KEYS: Record<string, string> = {
  quote: "quoteSlide",
  cover: "coverSlideTitle",
};

const CODE_FONT_SIZE_KEYS: Record<string, string> = {
  title: "codeSlideTitle",
  explanation: "codeSlideExplanation",
  code: "codeSlideCode",
};

export default function SlideEditor({ slide, index, onChange, themeName, themeFamily, theme }: Props) {
  // Single source of truth for every effective value shown in this editor:
  // theme defaults ← styleOverrides ← legacy fontSizes ← architecture defaults.
  // The slide ref is fresh on each updateSlide, so this recomputes per edit — the
  // sliders below are controlled by the resulting resolved value and keep their
  // on-screen value in sync without losing focus on keystroke.
  const resolved = useMemo(() => resolveSlideStyle(theme, slide), [theme, slide]);

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span className="badge">{slide.type}</span>
        <span style={{ color: "#6A7389", fontSize: 12 }}>Slide {String(index + 1).padStart(2, "0")}</span>
      </div>

      {slide.type === "cover" && (
        <CoverFields slide={slide} onChange={onChange} themeName={themeName} resolved={resolved} />
      )}
      {slide.type === "quote" && (
        <QuoteFields slide={slide} onChange={onChange} themeName={themeName} resolved={resolved} />
      )}
      {slide.type === "code" && (
        <CodeFields slide={slide} onChange={onChange} themeName={themeName} themeFamily={themeFamily} resolved={resolved} />
      )}
      {slide.type === "outro" && (
        <OutroFields slide={slide} onChange={onChange} themeName={themeName} resolved={resolved} />
      )}
      {slide.type === "comparison" && (
        <ComparisonFields slide={slide} onChange={onChange} themeName={themeName} resolved={resolved} />
      )}
      {slide.type === "stat" && (
        <StatFields slide={slide} onChange={onChange} themeName={themeName} resolved={resolved} />
      )}
      {slide.type === "canvas" && (
        <CanvasEditor slide={slide} onChange={onChange} />
      )}
    </div>
  );
}

/** Effective rendered font size for a typography token from the resolved style. */
function resolvedFontSize(resolved: ResolvedStyle, key: string): number | undefined {
  const t = resolved.typography[key];
  return t?.fontSizeMax ?? t?.fontSize;
}

function FontSizeSlider({
  label,
  value,
  defaultValue,
  min = 16,
  max = 200,
  onChange,
}: {
  label: string;
  value?: number;
  /** Resolved effective size shown when no explicit override exists. */
  defaultValue?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const raw = value ?? defaultValue;
  // The resolver fills fontSizeMax for every token the theme declares; `min` is
  // only a display guard so an entirely undeclared token never drives the input
  // uncontrolled (that surface would not render anyway).
  const v = typeof raw === "number" && Number.isFinite(raw) ? raw : min;
  return (
    <div className="field">
      <div className="slider-row">
        <div className="meta">
          <span>{label}</span>
          <span>{v}px</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={v}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={`${label} slider`}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={min}
            max={max}
            value={v}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= min && n <= max) onChange(n);
            }}
            aria-label={`${label} value`}
            style={{ width: 64, textAlign: "center" }}
          />
        </div>
      </div>
    </div>
  );
}

function ImageSection({
  images = [],
  onImagesChange,
  themeName,
}: {
  images?: SlideImage[];
  onImagesChange: (imgs: SlideImage[]) => void;
  themeName?: string;
}) {
  const addImage = () => {
    if (images.length >= 3) return;
    onImagesChange([
      ...images,
      { asset: "", top: "10%", left: "10%", width: "40%", height: "30%", scale: 1, zIndex: 0 },
    ]);
  };
  const removeImage = (i: number) => {
    onImagesChange(images.filter((_, j) => j !== i));
  };
  const updateImage = (i: number, img: SlideImage) => {
    const next = [...images];
    next[i] = img;
    onImagesChange(next);
  };

  return (
    <div className="field">
      <label>Images (max 3)</label>
      {images.map((img, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #DDE0ED",
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#6A7389" }}>Image {i + 1}</span>
            <button className="btn btn-sm btn-danger" onClick={() => removeImage(i)}>
              ×
            </button>
          </div>
          <ImageUploader
            value={img.asset}
            previewUrl={img.asset?.startsWith("assets/") ? undefined : img.asset}
            scale={img.scale ?? 1}
            offsetX={0}
            offsetY={0}
            hideTransform
            onUploaded={(path) => updateImage(i, { ...img, asset: path })}
            onTransform={(t) => updateImage(i, { ...img, scale: t.scale })}
          />
          {themeName && (
            <div style={{ marginTop: 6 }}>
              <AssetPicker
                themeName={themeName}
                currentPath={img.asset}
                onSelect={(path) => updateImage(i, { ...img, asset: path })}
              />
            </div>
          )}
        </div>
      ))}
      {images.length < 3 && (
        <button className="btn btn-sm" onClick={addImage}>
          + Add image
        </button>
      )}
    </div>
  );
}

function CoverFields({
  slide,
  onChange,
  themeName,
  resolved,
}: {
  slide: Extract<Slide, { type: "cover" }>;
  onChange: (s: Slide) => void;
  themeName?: string;
  resolved: ResolvedStyle;
}) {
  const fontSizes = slide.fontSizes ?? {};

  return (
    <>
      <FontSizeSlider
        label="Title font size"
        value={fontSizes.coverSlideTitle}
        defaultValue={resolvedFontSize(resolved, "coverSlideTitle")}
        onChange={(v) => onChange({ ...slide, fontSizes: { ...fontSizes, coverSlideTitle: v } })}
      />
      <div className="field">
        <label>Title (Arabic / mixed)</label>
        <textarea
          className="textarea headline"
          rows={3}
          dir="auto"
          value={slide.title || ""}
          onChange={(e) => onChange({ ...slide, title: e.target.value })}
          placeholder="JWT ببساطة"
        />
      </div>
      <div className="field">
        <label>Series override (optional)</label>
        <input
          className="control"
          value={slide.series || ""}
          onChange={(e) => onChange({ ...slide, series: e.target.value })}
          placeholder="Uses episode series if empty"
        />
      </div>
      <div className="field">
        <label>Cover icon / image</label>
        <ImageUploader
          value={slide.iconAsset}
          previewUrl={slide.iconAsset?.startsWith("assets/") ? undefined : slide.iconAsset}
          scale={slide.iconScale ?? 1}
          offsetX={slide.iconOffsetX ?? 0}
          offsetY={slide.iconOffsetY ?? 0}
          onUploaded={(path) => onChange({ ...slide, iconAsset: path })}
          onTransform={(t) =>
            onChange({
              ...slide,
              iconScale: t.scale,
              iconOffsetX: t.offsetX,
              iconOffsetY: t.offsetY,
            })
          }
        />
        {themeName && (
          <div style={{ marginTop: 6 }}>
            <AssetPicker
              themeName={themeName}
              currentPath={slide.iconAsset}
              onSelect={(path) => onChange({ ...slide, iconAsset: path })}
            />
          </div>
        )}
      </div>
      <TechIconPicker
        values={slide.techIcons || []}
        onChange={(techIcons) => onChange({ ...slide, techIcons })}
      />
      <ImageSection
        images={slide.images}
        onImagesChange={(images) => onChange({ ...slide, images })}
        themeName={themeName}
      />
    </>
  );
}

function QuoteFields({
  slide,
  onChange,
  themeName,
  resolved,
}: {
  slide: Extract<Slide, { type: "quote" }>;
  onChange: (s: Slide) => void;
  themeName?: string;
  resolved: ResolvedStyle;
}) {
  const paragraphs = slide.paragraphs ||
    (slide.text != null
      ? [{ text: slide.text, highlights: slide.highlights || [], cyanWords: slide.cyanWords || [] }]
      : []);
  const paraArray = [...paragraphs];

  const setParagraph = (i: number, p: ParagraphBlock) => {
    const next = [...paraArray];
    next[i] = p;
    onChange({ ...slide, paragraphs: next });
  };

  const addParagraph = () => {
    onChange({ ...slide, paragraphs: [...paraArray, { text: "", highlights: [], cyanWords: [] }] });
  };

  const removeParagraph = (i: number) => {
    if (paraArray.length <= 1) return;
    onChange({ ...slide, paragraphs: paraArray.filter((_, j) => j !== i) });
  };

  const fontSizes = slide.fontSizes ?? {};

  return (
    <>
      <FontSizeSlider
        label="Quote font size"
        value={fontSizes.quoteSlide}
        defaultValue={resolvedFontSize(resolved, "quoteSlide")}
        onChange={(v) => onChange({ ...slide, fontSizes: { ...fontSizes, quoteSlide: v } })}
      />
      {paraArray.map((p, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #DDE0ED",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#6A7389" }}>Paragraph {i + 1}</span>
            {paraArray.length > 1 && (
              <button className="btn btn-sm btn-danger" onClick={() => removeParagraph(i)}>
                ×
              </button>
            )}
          </div>
          <div className="field">
            <textarea
              className="control textarea"
              rows={3}
              dir="rtl"
              value={p.text || ""}
              onChange={(e) => setParagraph(i, { ...p, text: e.target.value })}
              placeholder="نص الفقرة…"
            />
          </div>
          <TagList
            label="Highlight words"
            values={p.highlights || []}
            onChange={(highlights) => setParagraph(i, { ...p, highlights })}
            placeholder="كلمة مميزة"
          />
          <TagList
            label="Cyan / accent words"
            values={p.cyanWords || []}
            onChange={(cyanWords) => setParagraph(i, { ...p, cyanWords })}
            placeholder="API"
          />
        </div>
      ))}
      <button className="btn btn-sm" onClick={addParagraph} style={{ marginBottom: 12 }}>
        + Add paragraph
      </button>
      <ImageSection
        images={slide.images}
        onImagesChange={(images) => onChange({ ...slide, images })}
        themeName={themeName}
      />
    </>
  );
}

function CodeFields({
  slide,
  onChange,
  themeName,
  themeFamily,
  resolved,
}: {
  slide: Extract<Slide, { type: "code" }>;
  onChange: (s: Slide) => void;
  themeName?: string;
  themeFamily?: "dark" | "light" | "cyberpunk";
  resolved: ResolvedStyle;
}) {
  const annotations = slide.annotations || [];
  const fontSizes = slide.fontSizes ?? {};

  return (
    <>
      <FontSizeSlider
        label="Title font size"
        value={fontSizes.codeSlideTitle}
        defaultValue={resolvedFontSize(resolved, "codeSlideTitle")}
        onChange={(v) => onChange({ ...slide, fontSizes: { ...fontSizes, codeSlideTitle: v } })}
      />
      <FontSizeSlider
        label="Code font size"
        value={fontSizes.codeSlideCode}
        defaultValue={resolvedFontSize(resolved, "codeSlideCode")}
        onChange={(v) => onChange({ ...slide, fontSizes: { ...fontSizes, codeSlideCode: v } })}
      />
      <FontSizeSlider
        label="Explanation font size"
        value={fontSizes.codeSlideExplanation}
        defaultValue={resolvedFontSize(resolved, "codeSlideExplanation")}
        onChange={(v) =>
          onChange({ ...slide, fontSizes: { ...fontSizes, codeSlideExplanation: v } })
        }
      />
      <div className="field-row">
        <div className="field">
          <label>Title (EN)</label>
          <input
            className="control"
            value={slide.titleEn || ""}
            onChange={(e) => onChange({ ...slide, titleEn: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Subtitle (EN)</label>
          <input
            className="control"
            value={slide.subtitleEn || ""}
            onChange={(e) => onChange({ ...slide, subtitleEn: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Code language</label>
        <LanguageSelect
          value={slide.language || "javascript"}
          onChange={(language) => onChange({ ...slide, language })}
        />
      </div>
      <div className="field">
        <label>Code</label>
        <CodeEditor
          value={slide.code || ""}
          language={slide.language || "javascript"}
          onChange={(code) => onChange({ ...slide, code })}
          theme={themeFamily}
        />
      </div>
      <div className="field">
        <label>Explanation (Arabic — English terms auto-isolated, `backticks` = inline code)</label>
        <textarea
          className="control textarea"
          rows={4}
          dir="rtl"
          value={slide.explanation || ""}
          onChange={(e) => onChange({ ...slide, explanation: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Annotations</label>
        {annotations.map((a, i) => (
          <div key={i} className="field-row" style={{ marginBottom: 8 }}>
            <input
              className="control"
              placeholder="target in code"
              value={a.target || ""}
              onChange={(e) => {
                const next = [...annotations];
                next[i] = { ...next[i], target: e.target.value };
                onChange({ ...slide, annotations: next });
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="control"
                placeholder="label"
                dir="rtl"
                value={a.text || ""}
                onChange={(e) => {
                  const next = [...annotations];
                  next[i] = { ...next[i], text: e.target.value };
                  onChange({ ...slide, annotations: next });
                }}
              />
              <button
                className="btn btn-sm btn-danger"
                onClick={() =>
                  onChange({
                    ...slide,
                    annotations: annotations.filter((_, j) => j !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn btn-sm"
          onClick={() =>
            onChange({
              ...slide,
              annotations: [...annotations, { text: "", target: "" }],
            })
          }
        >
          + Annotation
        </button>
      </div>
      <ImageSection
        images={slide.images}
        onImagesChange={(images) => onChange({ ...slide, images })}
        themeName={themeName}
      />
    </>
  );
}

function TagList({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="chip-row" style={{ marginBottom: 8 }}>
        {values.map((v, i) => (
          <span className="chip" key={`${v}-${i}`}>
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        className="control"
        placeholder={`${placeholder} — press Enter`}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const val = e.currentTarget.value.trim();
            if (val && !values.includes(val)) onChange([...values, val]);
            e.currentTarget.value = "";
          }
        }}
      />
    </div>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [languages, setLanguages] = useState<CodeLanguage[]>([]);

  useEffect(() => {
    fetch("/api/tech-icons")
      .then((r) => r.json())
      .then((d) => setLanguages(d.languages || []))
      .catch(() => {});
  }, []);

  return (
    <select className="control" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)}>
      {!languages.length && <option value={value}>{value}</option>}
      {languages.map((l) => (
        <option key={l.id} value={l.id}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

function OutroFields({
  slide,
  onChange,
  themeName,
  resolved,
}: {
  slide: Extract<Slide, { type: "outro" }>;
  onChange: (s: Slide) => void;
  themeName?: string;
  resolved: ResolvedStyle;
}) {
  const fontSizes = slide.fontSizes ?? {};

  return (
    <>
      <FontSizeSlider
        label="Question font size"
        value={fontSizes.outroSlideQuestion}
        defaultValue={resolvedFontSize(resolved, "outroSlideQuestion")}
        onChange={(v) => onChange({ ...slide, fontSizes: { ...fontSizes, outroSlideQuestion: v } })}
      />
      <div className="field">
        <label>Closing question (Arabic / mixed)</label>
        <textarea
          className="control textarea"
          rows={3}
          dir="rtl"
          value={slide.question || ""}
          onChange={(e) => onChange({ ...slide, question: e.target.value })}
          placeholder="ما التقنية التي تريد شرحها القادمة؟"
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Handle override</label>
          <input
            className="control"
            dir="ltr"
            value={slide.handle || ""}
            onChange={(e) => onChange({ ...slide, handle: e.target.value })}
            placeholder="@sitehie (theme default)"
          />
        </div>
        <div className="field">
          <label>CTA pill text</label>
          <input
            className="control"
            dir="rtl"
            value={slide.cta || ""}
            onChange={(e) => onChange({ ...slide, cta: e.target.value })}
            placeholder="احفظ • شارك • تابع"
          />
        </div>
      </div>
      <div className="field">
        <label>Profile avatar</label>
        <ImageUploader
          value={slide.imageAsset}
          previewUrl={slide.imageAsset?.startsWith("assets/") ? undefined : slide.imageAsset}
          scale={1}
          offsetX={0}
          offsetY={0}
          hideTransform
          onUploaded={(path) => onChange({ ...slide, imageAsset: path })}
          onTransform={() => {}}
        />
        {themeName && (
          <div style={{ marginTop: 6 }}>
            <AssetPicker
              themeName={themeName}
              currentPath={slide.imageAsset}
              onSelect={(path) => onChange({ ...slide, imageAsset: path })}
            />
          </div>
        )}
      </div>
      <TechIconPicker
        values={slide.techIcons || []}
        onChange={(techIcons) => onChange({ ...slide, techIcons })}
      />
      <ImageSection
        images={slide.images}
        onImagesChange={(images) => onChange({ ...slide, images })}
        themeName={themeName}
      />
    </>
  );
}

function ComparisonFields({
  slide,
  onChange,
  themeName,
  resolved,
}: {
  slide: Extract<Slide, { type: "comparison" }>;
  onChange: (s: Slide) => void;
  themeName?: string;
  resolved: ResolvedStyle;
}) {
  const fontSizes = slide.fontSizes ?? {};

  const setSide = (
    side: "sideA" | "sideB",
    patch: { label?: string; points?: string[] }
  ) => {
    onChange({ ...slide, [side]: { ...(slide[side] || {}), ...patch } });
  };

  const sideEditor = (side: "sideA" | "sideB", title: string) => {
    const data = slide[side] || {};
    const points = data.points || [];
    return (
      <div
        style={{
          border: "1px solid #DDE0ED",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "#6A7389", marginBottom: 8 }}>{title}</div>
        <div className="field">
          <label>Side label</label>
          <input
            className="control"
            dir="auto"
            value={data.label || ""}
            onChange={(e) => setSide(side, { label: e.target.value })}
            placeholder="Docker"
          />
        </div>
        <div className="field">
          <label>Points (one per line)</label>
          <textarea
            className="control textarea"
            rows={4}
            dir="rtl"
            value={points.join("\n")}
            onChange={(e) =>
              setSide(side, {
                points: e.target.value.split("\n").filter((p) => p.trim().length > 0),
              })
            }
            placeholder={"تشغيل الحاويات على جهاز واحد\nمثالي للتطوير المحلي"}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <FontSizeSlider
        label="Title font size"
        value={fontSizes.comparisonSlideTitle}
        defaultValue={resolvedFontSize(resolved, "comparisonSlideTitle")}
        onChange={(v) =>
          onChange({ ...slide, fontSizes: { ...fontSizes, comparisonSlideTitle: v } })
        }
      />
      <FontSizeSlider
        label="Body font size"
        value={fontSizes.comparisonSlideBody}
        defaultValue={resolvedFontSize(resolved, "comparisonSlideBody")}
        onChange={(v) =>
          onChange({ ...slide, fontSizes: { ...fontSizes, comparisonSlideBody: v } })
        }
      />
      <div className="field">
        <label>Comparison title (Arabic / mixed)</label>
        <textarea
          className="control textarea"
          rows={2}
          dir="rtl"
          value={slide.title || ""}
          onChange={(e) => onChange({ ...slide, title: e.target.value })}
          placeholder="Docker مقابل Kubernetes"
        />
      </div>
      {sideEditor("sideA", "Side A (right panel in RTL)")}
      {sideEditor("sideB", "Side B (left panel in RTL)")}
      <div className="field">
        <label>Verdict strip (optional)</label>
        <input
          className="control"
          dir="rtl"
          value={slide.verdict || ""}
          onChange={(e) => onChange({ ...slide, verdict: e.target.value })}
          placeholder="ابدأ بـ Docker وانتقل إلى Kubernetes عند الحاجة"
        />
      </div>
      <TechIconPicker
        values={slide.techIcons || []}
        onChange={(techIcons) => onChange({ ...slide, techIcons })}
      />
      <ImageSection
        images={slide.images}
        onImagesChange={(images) => onChange({ ...slide, images })}
        themeName={themeName}
      />
    </>
  );
}

function StatFields({
  slide,
  onChange,
  themeName,
  resolved,
}: {
  slide: Extract<Slide, { type: "stat" }>;
  onChange: (s: Slide) => void;
  themeName?: string;
  resolved: ResolvedStyle;
}) {
  const fontSizes = slide.fontSizes ?? {};

  return (
    <>
      <FontSizeSlider
        label="Value font size"
        value={fontSizes.statSlideValue}
        defaultValue={resolvedFontSize(resolved, "statSlideValue")}
        min={40}
        max={220}
        onChange={(v) => onChange({ ...slide, fontSizes: { ...fontSizes, statSlideValue: v } })}
      />
      <div className="field">
        <label>Metric value</label>
        <input
          className="control"
          dir="ltr"
          value={slide.value || ""}
          onChange={(e) => onChange({ ...slide, value: e.target.value })}
          placeholder="10x · 99.9% · 1M+"
          style={{ fontSize: 18, fontWeight: 700 }}
        />
      </div>
      <div className="field">
        <label>Label (Arabic / mixed)</label>
        <input
          className="control"
          dir="rtl"
          value={slide.label || ""}
          onChange={(e) => onChange({ ...slide, label: e.target.value })}
          placeholder="تقليل حجم الصورة"
        />
      </div>
      <div className="field">
        <label>Supporting subtext (optional)</label>
        <textarea
          className="control textarea"
          rows={3}
          dir="rtl"
          value={slide.subtext || ""}
          onChange={(e) => onChange({ ...slide, subtext: e.target.value })}
          placeholder="متوسط التوفير عند استخدام Multi-Stage Builds"
        />
      </div>
      <TechIconPicker
        values={slide.techIcons || []}
        onChange={(techIcons) => onChange({ ...slide, techIcons })}
      />
      <ImageSection
        images={slide.images}
        onImagesChange={(images) => onChange({ ...slide, images })}
        themeName={themeName}
      />
    </>
  );
}

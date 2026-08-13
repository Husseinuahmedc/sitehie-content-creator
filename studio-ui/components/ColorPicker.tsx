"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { swatch } from "./swatch";

type Props = {
  value: string;
  onChange: (change: string) => void;
};

const POPUP_WIDTH = 216;
const POPUP_HEIGHT = 130;
const EDGE_PAD = 8;
const GAP = 6;

const PRESETS = [
  "#0d1b2a",
  "#111416",
  "#16161A",
  "#2E3440",
  "#3D52D5",
  "#D94040",
  "#F0F1F7",
  "#ffffff",
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normaliseHex(input: string): string | null {
  const trimmed = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed[0]}${trimmed[0]}${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return null;
}

function parseHexColor(value: string): [number, number, number] | null {
  const normalized = normaliseHex(value);
  if (!normalized) return null;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  if ([r, g, b].some((c) => Number.isNaN(c))) return null;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Color picker trigger + popover. The trigger is an ordinary swatch button;
 * the popover is rendered through a portal to <body> so no ancestor's
 * overflow (panel scroll containers, the theme manager's clipped aside)
 * can ever cut it off. It is positioned in fixed viewport coordinates and
 * clamped to the viewport edges, so it stays fully visible at any panel
 * or browser width. Color entry uses a small in-page picker built from
 * hex input and RGB sliders to avoid the browser-native color popup.
 */
export default function ColorPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const computePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popRect = popRef.current?.getBoundingClientRect();
    const popWidth = popRect?.width ?? POPUP_WIDTH;
    const popHeight = popRect?.height ?? POPUP_HEIGHT;

    let left = r.left;
    if (left + popWidth > window.innerWidth - EDGE_PAD) {
      left = Math.max(EDGE_PAD, window.innerWidth - popWidth - EDGE_PAD);
    }
    let top = r.bottom + GAP;
    if (top + popHeight > window.innerHeight - EDGE_PAD) {
      top = Math.max(EDGE_PAD, r.top - popHeight - GAP);
    }
    setPos({ top, left });
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const [draft, setDraft] = useState(value);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const setRgbValue = useCallback(
    (r: number, g: number, b: number) => {
      const hex = rgbToHex(r, g, b);
      setDraft(hex);
      onChange(hex);
    },
    [onChange]
  );

  const handleHexChange = useCallback(
    (next: string) => {
      setDraft(next);
      const normalized = normaliseHex(next);
      if (normalized) onChange(normalized);
    },
    [onChange]
  );

  const handleSliderChange = useCallback(
    (component: "r" | "g" | "b") => (event: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseInt(event.target.value, 10);
      const rgb = parseHexColor(draft) ?? parseHexColor(value) ?? [0, 0, 0];
      const [r, g, b] = rgb;
      const nextRgb = {
        r: component === "r" ? clamp(parsed, 0, 255) : r,
        g: component === "g" ? clamp(parsed, 0, 255) : g,
        b: component === "b" ? clamp(parsed, 0, 255) : b,
      };
      setRgbValue(nextRgb.r, nextRgb.g, nextRgb.b);
    },
    [draft, value, setRgbValue]
  );

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(computePos);
    const onMouseDown = (e: globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => computePos();
    const onResize = () => computePos();
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close, computePos]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="color-picker"
        onClick={toggle}
        aria-label="Pick color"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-color-picker
        style={swatch(value)}
      >
        <i className="color-picker-fill" />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            className="color-pop"
            style={{ ["--pop-top"]: `${pos.top}px`, ["--pop-left"]: `${pos.left}px` } as CSSProperties}
            role="dialog"
            aria-label="Color picker"
          >
            <div className="color-pop-head">
              <span className="color-pop-title">Color</span>
              <button
                type="button"
                className="color-pop-close"
                onClick={close}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="color-pop-row">
              <i className="color-pop-swatch" style={swatch(value)} />
              <span className="color-pop-value">{value}</span>
            </div>

            <div className="color-pop-row" style={{ flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <label style={{ flex: 1, fontSize: "11px", color: "var(--text-muted)" }}>
                  Hex
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => handleHexChange(e.target.value)}
                    aria-label="Hex color value"
                    style={{
                      width: "100%",
                      marginTop: "4px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                    }}
                  />
                </label>
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {(["r", "g", "b"] as const).map((component) => {
                  const rgb = parseHexColor(draft) ?? parseHexColor(value) ?? [0, 0, 0];
                  const valueMap = { r: rgb[0], g: rgb[1], b: rgb[2] };
                  return (
                    <label
                      key={component}
                      style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text-muted)" }}
                    >
                      <span style={{ width: "16px", textTransform: "uppercase" }}>{component}</span>
                      <input
                        type="range"
                        min="0"
                        max="255"
                        value={valueMap[component]}
                        onChange={handleSliderChange(component)}
                        aria-label={`${component.toUpperCase()} channel`}
                        style={{ flex: 1, accentColor: value }}
                      />
                      <span style={{ width: "32px", textAlign: "right", color: "var(--text)" }}>
                        {valueMap[component]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="color-pop-presets" role="listbox" aria-label="Preset colors">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="option"
                  aria-selected={c === value}
                  className={`color-pop-preset${c === value ? " selected" : ""}`}
                  style={swatch(c)}
                  onClick={() => onChange(c)}
                  title={c}
                  aria-label={`Set color ${c}`}
                />
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
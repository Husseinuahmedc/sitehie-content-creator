"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Slide } from "@sitehie/core/domain";

type SlideType = Slide["type"];

type SlideTypeOption = {
  type: SlideType;
  label: string;
  icon: string;
  color: string;
};

const SLIDE_TYPES: SlideTypeOption[] = [
  { type: "cover", label: "Cover", icon: "◎", color: "#3D52D5" },
  { type: "quote", label: "Quote", icon: "❝", color: "#a78bfa" },
  { type: "code", label: "Code", icon: "⟨⟩", color: "#34d399" },
  { type: "comparison", label: "Compare", icon: "⟺", color: "#f59e0b" },
  { type: "stat", label: "Stat", icon: "#", color: "#f472b6" },
  { type: "outro", label: "Outro", icon: "→", color: "#94a3b8" },
  { type: "canvas", label: "Canvas", icon: "✎", color: "#3D52D5" },
];

type Props = {
  slides: Slide[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: (type: SlideType) => void;
  onRemove: (index: number) => void;
};

export default function SlideList({
  slides,
  activeIndex,
  onSelect,
  onReorder,
  onAdd,
  onRemove,
}: Props) {
  const dragFrom = useRef<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const handleAdd = useCallback(
    (type: SlideType) => {
      onAdd(type);
      setDropdownOpen(false);
    },
    [onAdd]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="sidebar-header slides-label">
        <span>SLIDES ({slides.length})</span>
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            className="mini-add"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            title="Add slide"
            aria-label="Add slide"
            aria-expanded={dropdownOpen}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" /><path d="M5 12h14" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="dropdown-menu" style={{ right: 0, left: "auto" }}>
              {SLIDE_TYPES.map((opt) => (
                <button
                  key={opt.type}
                  className="dropdown-item"
                  onClick={() => handleAdd(opt.type)}
                >
                  <span
                    className="dropdown-item-icon"
                    style={{
                      background: `${opt.color}18`,
                      color: opt.color,
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {opt.icon}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="slide-list scroll-y" style={{ flex: 1, padding: "0 4px" }}>
        {slides.map((slide, i) => {
          const isActive = i === activeIndex;

          return (
            <div
              key={i}
              className={`slide-item ${isActive ? "selected" : ""}`}
              draggable
              onDragStart={() => { dragFrom.current = i; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current != null && dragFrom.current !== i) {
                  onReorder(dragFrom.current, i);
                }
                dragFrom.current = null;
              }}
              onClick={() => onSelect(i)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                position: "relative"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", flex: 1 }}>
                <span className="slide-number">{String(i + 1).padStart(2, "0")}</span>
                <span className="mini-preview">
                  <span className={`mini-line ${i === 0 ? "wide" : ""}`} />
                  <span className="mini-line short" />
                </span>
                <span className="slide-name" style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                  {previewText(slide)}
                </span>
              </div>

              {/* زر حذف السلايد */}
              <button
                className="more"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                title="Delete slide"
                aria-label={`Delete slide ${i + 1}`}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6A7389",
                  cursor: "pointer",
                  padding: "4px 6px",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          );
        })}

        {slides.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#6A7389", fontSize: 12 }}>
            No slides yet.
            <br />
            <span style={{ color: "#6A7389" }}>
              Click <strong>+</strong> to get started.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function previewText(slide: Slide): string {
  switch (slide.type) {
    case "cover":
      return slide.title || "Untitled cover";
    case "quote":
      return slide.paragraphs?.[0]?.text || slide.text || "Empty quote";
    case "outro":
      return slide.question || "Outro";
    case "comparison":
      return slide.title || `${slide.sideA?.label || "A"} vs ${slide.sideB?.label || "B"}`;
    case "stat":
      return `${slide.value || "…"} — ${slide.label || "stat"}`;
    case "canvas":
      return `Canvas (${slide.objects.length} objects)`;
    default:
      return slide.titleEn || slide.title || "Code slide";
  }
}
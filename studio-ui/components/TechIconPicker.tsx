"use client";

import { useEffect, useMemo, useState } from "react";
import type { TechIconEntry } from "@/lib/adapters";
import { sanitizeSvg } from "@/lib/sanitize-svg";

type Props = {
  values: string[];
  onChange: (v: string[]) => void;
};

/** Multi-select chip grid for slide.techIcons backed by the engine's SVG icon library. */
export default function TechIconPicker({ values, onChange }: Props) {
  const [icons, setIcons] = useState<Record<string, TechIconEntry>>({});

  useEffect(() => {
    fetch("/api/tech-icons")
      .then((r) => r.json())
      .then((d) => setIcons(d.icons || {}))
      .catch(() => {});
  }, []);

  const toggle = (key: string) => {
    if (values.includes(key)) onChange(values.filter((v) => v !== key));
    else onChange([...values, key]);
  };

  const keys = Object.keys(icons);
  // Selected values that aren't in the library (custom text chips)
  const custom = values.filter((v) => !icons[v]);

  return (
    <div className="field">
      <label>Tech badges</label>
      <div dir="ltr" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {keys.map((key) => {
          const selected = values.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              title={key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                background: selected ? "var(--accent-dim)" : "var(--bg)",
                color: selected ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <span
                style={{ width: 16, height: 16, display: "inline-flex" }}
                dangerouslySetInnerHTML={{ __html: sanitizeSvg(icons[key].svg) }}
              />
              {icons[key].label}
            </button>
          );
        })}
        {custom.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            title={`Remove "${v}"`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid var(--accent)",
              background: "var(--accent-dim)",
              color: "var(--accent)",
            }}
          >
            {v} ×
          </button>
        ))}
        {keys.length === 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            Loading icon library…
          </span>
        )}
      </div>
    </div>
  );
}

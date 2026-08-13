"use client";

import { useEffect, useMemo, useState } from "react";

export type FontInfo = {
  id: string;
  fileName: string;
  family: string;
  weight: number;
  format: string;
  path: string;
  absolutePath: string;
  ext: string;
};

type Props = {
  label: string;
  valuePath?: string;
  valueFamily?: string;
  onSelect: (font: FontInfo) => void;
};

export default function FontPicker({ label, valuePath, valueFamily, onSelect }: Props) {
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/fonts")
      .then((r) => r.json())
      .then((data) => setFonts(data.fonts || []))
      .catch(console.error);
  }, []);

  // Inject @font-face for visible options
  useEffect(() => {
    if (!open || !fonts.length) return;
    const style = document.getElementById("studio-font-faces") || document.createElement("style");
    style.id = "studio-font-faces";
    const faces = fonts
      .map((f) => {
        const fam = typeof CSS.escape === "function" ? CSS.escape(f.family) : f.family;
        return `@font-face{font-family:${JSON.stringify(`studio-${f.id}`)};src:url(${JSON.stringify(`/api/fonts?file=${encodeURIComponent(f.id)}`)}) format(${JSON.stringify(f.format)});font-weight:${f.weight};font-display:swap;}`;
      })
      .join("\n");
    style.textContent = faces;
    if (!style.parentElement) document.head.appendChild(style);
    setLoaded(new Set(fonts.map((f) => f.id)));
  }, [open, fonts]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return fonts;
    return fonts.filter(
      (f) =>
        f.family.toLowerCase().includes(query) ||
        f.fileName.toLowerCase().includes(query)
    );
  }, [fonts, q]);

  const current =
    fonts.find((f) => f.path === valuePath) ||
    fonts.find((f) => f.family === valueFamily) ||
    null;

  return (
    <div className="field" style={{ position: "relative" }}>
      <label>{label}</label>
      <button
        type="button"
        className="btn"
        style={{ width: "100%", justifyContent: "space-between" }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current ? `${current.family} · ${current.weight}` : valueFamily || "Select font…"}
        </span>
        <span className="muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          className="panel"
          style={{
            position: "absolute",
            zIndex: 40,
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 6,
            maxHeight: 320,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
            <input
              autoFocus
              placeholder="Search fonts…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="scroll-y" style={{ flex: 1, padding: 6 }}>
            {filtered.length === 0 && (
              <div className="muted" style={{ padding: 12, textAlign: "center" }}>
                No fonts found
              </div>
            )}
            {filtered.map((f) => {
              const selected = f.path === valuePath || (f.family === valueFamily && f.path === valuePath);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`font-option ${selected ? "selected" : ""}`}
                  onClick={() => {
                    onSelect(f);
                    setOpen(false);
                  }}
                >
                  <span
                    className="sample"
                    style={{
                      fontFamily: loaded.has(f.id) ? `studio-${f.id}` : "sans-serif",
                      fontWeight: f.weight,
                    }}
                  >
                    مرحبا — Hello 123
                  </span>
                  <span className="meta">
                    {f.family} · w{f.weight} · {f.fileName}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-sm" style={{ width: "100%" }} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

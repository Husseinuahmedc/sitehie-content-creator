"use client";

import { useCallback, useEffect, useState } from "react";
import FileInputButton from "./FileInputButton";

type Asset = {
  name: string;
  path: string;
  url: string;
  source: "theme" | "shared";
};

type Props = {
  themeName: string;
  onSelect: (path: string, url: string) => void;
  currentPath?: string;
};

export default function AssetPicker({ themeName, onSelect, currentPath }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<"all" | "theme" | "shared">("all");

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assets?theme=${encodeURIComponent(themeName)}`);
      const data = await res.json();
      setAssets(data.assets || []);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [themeName]);

  useEffect(() => {
    if (open) fetchAssets();
  }, [open, fetchAssets]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("theme", themeName);
        fd.append("subfolder", "icons");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        // Refresh list and auto-select
        await fetchAssets();
        onSelect(data.path, data.url);
        setOpen(false);
      } catch (err) {
        console.warn("[AssetPicker] Upload failed:", err);
      } finally {
        setUploading(false);
      }
    },
    [themeName, fetchAssets, onSelect]
  );

  const filtered = filter === "all" ? assets : assets.filter((a) => a.source === filter);

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-sm"
        onClick={() => setOpen(!open)}
        title="Browse available assets"
        style={{ display: "flex", alignItems: "center", gap: 4 }}
      >
        {open ? "Close" : `Browse assets (${assets.length})`}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            width: 340,
            maxHeight: 400,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            zIndex: 20,
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="panel-header" style={{ flexShrink: 0 }}>
            <span style={{ fontSize: 12 }}>Assets</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className={`btn btn-sm ${filter === "all" ? "btn-primary" : ""}`}
                onClick={() => setFilter("all")}
                style={{ fontSize: 10, padding: "2px 6px" }}
              >
                All
              </button>
              <button
                className={`btn btn-sm ${filter === "theme" ? "btn-primary" : ""}`}
                onClick={() => setFilter("theme")}
                style={{ fontSize: 10, padding: "2px 6px" }}
              >
                Theme
              </button>
              <button
                className={`btn btn-sm ${filter === "shared" ? "btn-primary" : ""}`}
                onClick={() => setFilter("shared")}
                style={{ fontSize: 10, padding: "2px 6px" }}
              >
                Shared
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px",
            }}
          >
            {loading && (
              <div className="muted" style={{ padding: 16, fontSize: 12, textAlign: "center" }}>
                Loading…
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="muted" style={{ padding: 16, fontSize: 12, textAlign: "center" }}>
                No assets found. Upload one below.
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                gap: 6,
              }}
            >
              {filtered.map((asset) => {
                const isActive = currentPath === asset.path;
                return (
                  <button
                    key={asset.path}
                    onClick={() => {
                      onSelect(asset.path, asset.url);
                      setOpen(false);
                    }}
                    title={`${asset.name}\n${asset.path}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: 6,
                      borderRadius: 6,
                      border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                      background: isActive ? "var(--accent-dim)" : "var(--bg)",
                      cursor: "pointer",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt={asset.name}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "contain",
                        borderRadius: 4,
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <span
                      style={{
                        fontSize: 9,
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        width: "100%",
                        textAlign: "center",
                      }}
                    >
                      {asset.source === "theme" ? "● " : ""}
                      {asset.name.length > 12 ? asset.name.slice(0, 12) + "…" : asset.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: "8px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
            <FileInputButton
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onFile={handleUpload}
              className="dropzone"
              style={{ padding: "10px 12px", fontSize: 11 }}
            >
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) await handleUpload(file);
                }}
              >
                {uploading ? "Uploading…" : `Drop or click to upload to ${themeName || "shared"}`}
              </div>
            </FileInputButton>
          </div>
        </div>
      )}
    </div>
  );
}

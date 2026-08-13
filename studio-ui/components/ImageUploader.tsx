"use client";

import { useCallback, useState } from "react";
import FileInputButton from "./FileInputButton";

type Props = {
  value?: string;
  previewUrl?: string;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  onUploaded: (path: string, url: string) => void;
  onTransform: (t: { scale: number; offsetX: number; offsetY: number }) => void;
  hideTransform?: boolean;
};

export default function ImageUploader({
  value,
  previewUrl,
  scale = 1,
  offsetX = 0,
  offsetY = 0,
  onUploaded,
  onTransform,
  hideTransform = false,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setLocalUrl(data.url);
        onUploaded(data.path, data.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
      }
    },
    [onUploaded]
  );

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await upload(file);
  };

  const imgSrc =
    localUrl ||
    previewUrl ||
    (value?.startsWith("assets/") ? null : value) ||
    null;

  // For assets/ paths, try public uploads mirror by basename
  const fallbackSrc =
    !imgSrc && value
      ? `/uploads/${value.split("/").pop()}`
      : imgSrc;

  return (
    <div>
      <FileInputButton
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onFile={upload}
        className={`dropzone ${dragging ? "active" : ""}`}
        style={{ cursor: "pointer" }}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {fallbackSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fallbackSrc}
              alt="cover icon"
              style={{
                transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : null}
          <div>{uploading ? "Uploading…" : "Drop image or click to upload"}</div>
          {value && (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              {value}
            </div>
          )}
        </div>
      </FileInputButton>

      {error && (
        <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>{error}</div>
      )}

      {(value || localUrl) && !hideTransform && (
        <div style={{ marginTop: 14 }}>
          <div className="slider-row">
            <div className="meta">
              <span>Scale</span>
              <span>{scale.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0.4}
              max={2}
              step={0.01}
              value={scale}
              onChange={(e) =>
                onTransform({ scale: Number(e.target.value), offsetX, offsetY })
              }
              aria-label="Image scale"
            />
          </div>
          <div className="slider-row">
            <div className="meta">
              <span>Offset X</span>
              <span>{offsetX}%</span>
            </div>
            <input
              type="range"
              min={-40}
              max={40}
              step={1}
              value={offsetX}
              onChange={(e) =>
                onTransform({ scale, offsetX: Number(e.target.value), offsetY })
              }
              aria-label="Image offset X"
            />
          </div>
          <div className="slider-row">
            <div className="meta">
              <span>Offset Y</span>
              <span>{offsetY}%</span>
            </div>
            <input
              type="range"
              min={-40}
              max={40}
              step={1}
              value={offsetY}
              onChange={(e) =>
                onTransform({ scale, offsetX, offsetY: Number(e.target.value) })
              }
              aria-label="Image offset Y"
            />
          </div>
        </div>
      )}
    </div>
  );
}

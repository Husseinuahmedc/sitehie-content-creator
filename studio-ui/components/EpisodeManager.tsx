"use client";

import { useCallback, useState } from "react";

type EpisodeMeta = {
  file: string;
  path: string;
  episode: string;
  series: string;
  slideCount: number;
};

type Props = {
  episodes: EpisodeMeta[];
  activeFile: string;
  onSelect: (file: string) => void;
  onDeleted: (deletedFile: string) => void;
  onNew: () => void;
};

type ConfirmState =
  | null
  | { type: "episode"; file: string; label: string }
  | { type: "series"; series: string; files: string[]; label: string };

export default function EpisodeManager({ episodes, activeFile, onSelect, onDeleted, onNew }: Props) {
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = episodes.reduce<Record<string, EpisodeMeta[]>>((acc, ep) => {
    const key = ep.series || "(No series)";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ep);
    return acc;
  }, {});

  const handleDeleteEpisode = useCallback(async (file: string) => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/episodes?name=${encodeURIComponent(file)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      onDeleted(file);
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }, [onDeleted]);

  const handleDeleteSeries = useCallback(async (files: string[]) => {
    setDeleting(true);
    setError(null);
    try {
      for (const file of files) {
        const res = await fetch(`/api/episodes?name=${encodeURIComponent(file)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to delete ${file}`);
        }
      }
      for (const file of files) {
        onDeleted(file);
      }
      setConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }, [onDeleted]);

  return (
    <div>
      <div className="sidebar-header">
        <span>EPISODES</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#6A7389", fontWeight: 400 }}>{episodes.length}</span>
          <button
            className="btn btn-sm"
            onClick={onNew}
            title="Create new episode"
            style={{ fontSize: 11, padding: "2px 8px", lineHeight: "18px" }}
          >
            + New
          </button>
        </div>
      </div>

      <div style={{ maxHeight: 200, overflowY: "auto", padding: "0 4px" }}>
        {Object.entries(grouped).map(([series, eps]) => (
          <div key={series} style={{ marginBottom: 8 }}>
            {series !== "(No series)" && (
              <div style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, color: "#6A7389", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {series}
              </div>
            )}
            {eps.map((ep) => {
              const isActive = ep.file === activeFile;
              return (
                <div
                  key={ep.file}
                  className={`episode ${isActive ? "active" : ""}`}
                  onClick={() => onSelect(ep.file)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="episode-index">{String(episodes.indexOf(ep) + 1).padStart(2, "0")}</div>
                  <div className={`episode-name ${!isActive ? "muted" : ""}`}>
                    <strong>{ep.episode}</strong>
                    <small>{ep.slideCount} slides</small>
                  </div>
                  <button
                    className="more"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirm({
                        type: "episode",
                        file: ep.file,
                        label: `"${ep.episode}" (${ep.file})`,
                      });
                    }}
                    title={`Delete ${ep.episode}`}
                    aria-label={`Delete episode ${ep.episode}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Confirmation modal */}
      {confirm && (
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
              background: "#FFFFFF",
              border: "1px solid #DDE0ED",
              borderRadius: 12,
              padding: 24,
              maxWidth: 380,
              width: "90%",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "#16161A" }}>
              Delete {confirm.type === "series" ? "series" : "episode"}
            </div>
            <div style={{ fontSize: 13, color: "#6A7389", marginBottom: 16, lineHeight: 1.5 }}>
              Are you sure you want to delete <strong style={{ color: "#16161A" }}>{confirm.label}</strong>?
              {confirm.type === "series" && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#D94040" }}>
                  This will delete all episodes in this series.
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 11 }}>
                This action cannot be undone.
              </div>
            </div>

            {error && (
              <div style={{ color: "#D94040", fontSize: 12, marginBottom: 12 }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn btn-sm"
                disabled={deleting}
                onClick={() => {
                  setConfirm(null);
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-danger"
                disabled={deleting}
                onClick={() => {
                  if (confirm.type === "episode") {
                    handleDeleteEpisode(confirm.file);
                  } else {
                    handleDeleteSeries(confirm.files);
                  }
                }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

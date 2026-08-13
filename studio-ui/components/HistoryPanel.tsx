"use client";

import { useCallback, useEffect, useState } from "react";
import type { Episode as EpisodeContent, Theme } from "@sitehie/core/domain";

type Snapshot = {
  file: string;
  timestamp: string | null;
  episodeFile: string;
};

type SnapshotData = {
  _snapshot: boolean;
  _timestamp: string;
  _episodeFile: string;
  content: EpisodeContent;
  theme: Theme | null;
};

type Props = {
  episodeFile: string;
  onRestore: (content: EpisodeContent, theme: Theme | null) => void;
};

export default function HistoryPanel({ episodeFile, onRestore }: Props) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?episode=${encodeURIComponent(episodeFile)}`);
      const data = await res.json();
      setSnapshots(data.snapshots || []);
    } catch {
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [episodeFile]);

  useEffect(() => {
    if (open) fetchSnapshots();
  }, [open, fetchSnapshots]);

  const handleRestore = useCallback(
    async (snap: Snapshot) => {
      setRestoring(snap.file);
      try {
        const res = await fetch(
          `/api/history?episode=${encodeURIComponent(episodeFile)}&snapshot=${encodeURIComponent(snap.file)}`
        );
        if (!res.ok) throw new Error("Failed to load snapshot");
        const data: SnapshotData = await res.json();
        onRestore(data.content, data.theme);
        setOpen(false);
      } catch (err) {
        console.warn("[HistoryPanel] Failed to load snapshot:", err);
      } finally {
        setRestoring(null);
      }
    },
    [episodeFile, onRestore]
  );

  const handleDelete = useCallback(
    async (snap: Snapshot) => {
      try {
        await fetch(
          `/api/history?episode=${encodeURIComponent(episodeFile)}&snapshot=${encodeURIComponent(snap.file)}`,
          { method: "DELETE" }
        );
        setSnapshots((prev) => prev.filter((s) => s.file !== snap.file));
      } catch (err) {
        console.warn("[HistoryPanel] Failed to delete snapshot:", err);
      }
    },
    [episodeFile]
  );

  const formatTime = (ts: string | null): string => {
    if (!ts) return "Unknown time";
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="secondary-button"
        onClick={() => setOpen(!open)}
        title="Version history"
      >
        History ({snapshots.length})
      </button>

      {open && (
        <div
          className="dropdown-menu"
          style={{ right: 0, left: "auto", width: 300, maxHeight: 360, overflowY: "auto" }}
        >
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #DDE0ED", fontWeight: 600, fontSize: 12, color: "#16161A" }}>
            Snapshots
            {loading && <span style={{ fontWeight: 400, color: "#6A7389", fontSize: 11, marginLeft: 8 }}>Loading…</span>}
          </div>

          {snapshots.length === 0 && !loading && (
            <div style={{ padding: 16, fontSize: 12, textAlign: "center", color: "#6A7389" }}>
              No snapshots yet. Save a snapshot from the header.
            </div>
          )}

          {snapshots.map((snap) => (
            <div
              key={snap.file}
              className="dropdown-item"
              style={{ justifyContent: "space-between" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {formatTime(snap.timestamp)}
                </div>
                <div style={{ fontSize: 10, color: "#6A7389", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {snap.file}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={restoring === snap.file}
                  onClick={(e) => { e.stopPropagation(); handleRestore(snap); }}
                  title="Restore this snapshot"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                >
                  {restoring === snap.file ? "…" : "Restore"}
                </button>
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={(e) => { e.stopPropagation(); handleDelete(snap); }}
                  title="Delete snapshot"
                  style={{ fontSize: 10, padding: "2px 6px" }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

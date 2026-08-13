"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";
import SlideList from "@/components/SlideList";
import EpisodeManager from "@/components/EpisodeManager";
import AiArranger from "@/components/AiArranger";
import AiGenerator from "@/components/AiGenerator";
import Icon from "@/components/Icon";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import EditorPanel from "./editor-panel";
import PreviewPanel from "../preview/preview-panel";
import ThemePanel from "../theme/theme-panel";
import type { Episode as EpisodeContent, Slide, Theme } from "@sitehie/core/domain";
import {
  store,
  useEpisodes,
  useEpisodeFile,
  useContent,
  useDraftContent,
  useActiveIndex,
  useDirty,
  useThemeFile,
  useTheme,
  useThemeDirty,
  useSaving,
  useStatus,
  usePendingRestore,
  useNewEpisodeOpen,
  useNewEpisodeName,
  useNewEpisodeSeries,
  useBootstrapped,
  setEpisodes,
  setEpisodeFile,
  setContent,
  setDraftContent,
  setActiveIndex,
  setDirty,
  setThemes,
  setTheme,
  setThemeDirty,
  setStatus,
  setAutosaveStatus,
  setPendingRestore,
  setNewEpisodeOpen,
  setNewEpisodeName,
  setNewEpisodeSeries,
  setBootstrapped,
  setSelectedTargetId,
  saveEpisode,
  saveTheme,
  addSlide,
  removeSlide,
  reorderSlides,
  undo,
  redo,
  useCanUndo,
  useCanRedo,
  recordEpisodeEdit,
  recordThemeEdit,
  clearEditHistory,
} from "@/state";
import type { EpisodeMeta } from "@/state";

export default function StudioPage() {
  const episodes = useEpisodes();
  const episodeFile = useEpisodeFile();
  const content = useContent();
  const draftContent = useDraftContent();
  const activeIndex = useActiveIndex();
  const dirty = useDirty();

  const themeFile = useThemeFile();
  const theme = useTheme();
  const themeDirty = useThemeDirty();

  const saving = useSaving();
  const status = useStatus();
  const pendingRestore = usePendingRestore();
  const newEpisodeOpen = useNewEpisodeOpen();
  const newEpisodeName = useNewEpisodeName();
  const newEpisodeSeries = useNewEpisodeSeries();
  const bootstrapped = useBootstrapped();

  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  useEffect(() => {
    Promise.all([
      fetch("/api/episodes").then((r) => {
        if (!r.ok) throw new Error(`Episodes fetch failed (${r.status})`);
        return r.json();
      }),
      fetch("/api/themes").then((r) => {
        if (!r.ok) throw new Error(`Themes fetch failed (${r.status})`);
        return r.json();
      }),
    ])
      .then(([ep, th]) => {
        const eps = ep.episodes || [];
        setEpisodes(eps);
        setThemes(th.themes || []);
        if (eps.length > 0 && !eps.some((e: EpisodeMeta) => e.file === store.getState().episode.episodeFile)) {
          setEpisodeFile(eps[0].file);
        }
        setBootstrapped(true);
      })
      .catch((err) => {
        console.error("[Studio] Bootstrap failed:", err);
        setStatus("Failed to load data — check server");
        setBootstrapped(true);
      });
  }, []);

  const migrateSlide = useCallback((s: Slide): Slide => {
    if (s.type === "quote" && !s.paragraphs && s.text != null) {
      return {
        ...s,
        paragraphs: [{
          text: s.text || "",
          highlights: s.highlights || [],
          cyanWords: s.cyanWords || [],
        }],
      };
    }
    return s;
  }, []);

  const migrateContent = useCallback(
    (c: EpisodeContent): EpisodeContent => ({
      ...c,
      slides: c.slides.map(migrateSlide),
    }),
    [migrateSlide]
  );

  useEffect(() => {
    if (!episodeFile) return;
    fetch(`/api/episodes?name=${encodeURIComponent(episodeFile)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Episode load failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (data.content) {
          setContent(migrateContent(data.content));
          setActiveIndex(0);
          setDirty(false);
          fetch(`/api/autosave?type=episode&name=${encodeURIComponent(episodeFile)}`)
            .then((r) => r.json())
            .then((asData) => {
              if (asData.info?.isStale) {
                setPendingRestore({
                  type: "episode",
                  fileName: episodeFile,
                  autosaveTime: asData.info.autosaveTime,
                  data: asData.info.data as EpisodeContent,
                });
              }
            })
            .catch(() => {});
        } else {
          setContent(null);
          setStatus(`Episode "${episodeFile}" has no content`);
        }
      })
      .catch((err) => {
        console.error("[Studio] Episode load failed:", err);
        setContent(null);
        setStatus(`Could not load ${episodeFile} — pick another episode`);
      });
  }, [episodeFile, migrateContent]);

  useEffect(() => {
    if (!themeFile) return;
    fetch(`/api/themes?name=${encodeURIComponent(themeFile)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Theme load failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (data.theme) {
          setTheme(data.theme);
          setThemeDirty(false);
          setSelectedTargetId(null);
          fetch(`/api/autosave?type=theme&name=${encodeURIComponent(themeFile)}`)
            .then((r) => r.json())
            .then((asData) => {
              if (asData.info?.isStale) {
                setPendingRestore({
                  type: "theme",
                  fileName: themeFile,
                  autosaveTime: asData.info.autosaveTime,
                  data: asData.info.data as Theme,
                });
              }
            })
            .catch(() => {});
        } else {
          setStatus(`Theme "${themeFile}" could not be loaded`);
        }
      })
      .catch((err) => {
        console.error("[Studio] Theme load failed:", err);
        setStatus(`Could not load theme ${themeFile}`);
      });
  }, [themeFile]);

  // Undo/redo history is scoped to the current editing session: navigating to a
  // different episode or theme discards the in-memory stacks (an Undo must never
  // reach back into a different episode's content).
  useEffect(() => {
    clearEditHistory();
  }, [episodeFile, themeFile]);

  // 1.2s debounced autosave. Reads current episode/theme state from the store
  // at fire time (the store replaces the old contentRef/themeRef/episodeFileRef/
  // themeFileRef pattern) so the timer never carries stale data, while the
  // dirty/themeDirty split and the explicit-save cleanup below are preserved:
  // an explicit save flips dirty/themeDirty false, which re-runs this effect
  // and clears the pending timer, so the deleted autosave is never re-created.
  useEffect(() => {
    if (!content || !theme || (!dirty && !themeDirty)) return;
    setAutosaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        // Only autosave what is actually dirty — writing the theme autosave
        // on an episode-only edit makes it newer than the explicit save,
        // which then triggers a spurious "unsaved changes" restore modal.
        const s = store.getState();
        const writes: Promise<Response>[] = [];
        if (s.episode.dirty) {
          writes.push(
            fetch("/api/autosave", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "episode", fileName: s.episode.episodeFile, data: s.episode.content }),
            })
          );
        }
        if (s.theme.themeDirty) {
          writes.push(
            fetch("/api/autosave", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "theme", fileName: s.theme.themeFile, data: s.theme.theme }),
            })
          );
        }
        const results = await Promise.all(writes);
        if (results.some((r) => !r.ok)) throw new Error("Autosave write failed");
        setAutosaveStatus("synced");
      } catch {
        setAutosaveStatus("error");
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [content, theme, dirty, themeDirty]);

  // Keyboard shortcuts (Cmd/Ctrl+S = save episode, Cmd/Ctrl+Shift+S = save
  // theme, Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y = redo).
  // saveEpisode / saveTheme / undo / redo are shared state actions — their
  // identity is stable (they read fresh state via store.getState()), so they
  // live outside the dep array and the listener re-attaches only when
  // dirty/themeDirty/saving change (identical lifetime to before — no listener
  // hammering).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key === "s") {
        e.preventDefault();
        if (dirty && !saving) saveEpisode();
      }
      if (e.shiftKey && e.key === "S") {
        e.preventDefault();
        if (themeDirty && !saving) saveTheme("update").then(() => setThemeDirty(false));
      }
      // Don't steal the browser's native field-level undo/redo when a text
      // input, textarea, select, or contentEditable (CodeMirror) has focus.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const isZKey = e.key === "z" || e.key === "Z";
      const isUndo = isZKey && !e.shiftKey;
      const isRedo = (isZKey && e.shiftKey) || e.key === "y" || e.key === "Y";
      if (isUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirty, themeDirty, saving]);

  // Auto-dismiss status toast after 3 seconds (skip errors)
  useEffect(() => {
    if (!status || status.includes("Error") || status.includes("failed")) return;
    const t = setTimeout(() => setStatus(""), 3000);
    return () => clearTimeout(t);
  }, [status]);

  const handleRestoreAutosave = useCallback(() => {
    if (!pendingRestore) return;
    if (pendingRestore.type === "episode") {
      const { episode } = store.getState();
      const before = episode.content;
      if (before) recordEpisodeEdit(before, pendingRestore.data as EpisodeContent, episode.activeIndex, episode.activeIndex);
      setContent(pendingRestore.data as EpisodeContent);
      setDirty(true);
    } else {
      const before = store.getState().theme.theme;
      if (before) recordThemeEdit(before, pendingRestore.data as Theme);
      setTheme(pendingRestore.data as Theme);
      setThemeDirty(true);
    }
    setPendingRestore(null);
  }, [pendingRestore]);

  const handleDiscardAutosave = useCallback(async () => {
    if (!pendingRestore) return;
    try {
      await fetch(`/api/autosave?type=${pendingRestore.type}&name=${encodeURIComponent(pendingRestore.fileName)}`, {
        method: "DELETE",
      });
    } catch {}
    setPendingRestore(null);
  }, [pendingRestore]);

  const handleHistoryRestore = useCallback(
    (restoredContent: EpisodeContent, restoredTheme: Theme | null) => {
      const { episode, theme } = store.getState();
      if (episode.content) recordEpisodeEdit(episode.content, restoredContent, episode.activeIndex, episode.activeIndex);
      setContent(restoredContent);
      setDirty(true);
      if (restoredTheme) {
        if (theme.theme) recordThemeEdit(theme.theme, restoredTheme);
        setTheme(restoredTheme);
        setThemeDirty(true);
      }
      setStatus("Restored from snapshot");
    },
    []
  );

  const handleEpisodeDeleted = useCallback((deletedFile: string) => {
    const { episode } = store.getState();
    const remaining = episode.episodes.filter((e) => e.file !== deletedFile);
    setEpisodes(remaining);
    if (episode.episodeFile === deletedFile) {
      if (remaining.length > 0) {
        setEpisodeFile(remaining[0].file);
      } else {
        setEpisodeFile("");
        setContent(null);
      }
    }
    setStatus(`Deleted ${deletedFile}`);
  }, []);

  const handleCreateEpisode = useCallback(async () => {
    const name = newEpisodeName.trim();
    if (!name) return;
    const safeName = name.endsWith(".json") ? name : `${name}.json`;
    const defaultContent: EpisodeContent = {
      episode: name.replace(/\.json$/, ""),
      series: newEpisodeSeries.trim() || undefined,
      slides: [{ type: "cover", title: name.replace(/\.json$/, "") }],
    };
    try {
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: safeName, content: defaultContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      const listRes = await fetch("/api/episodes");
      const listData = await listRes.json();
      setEpisodes(listData.episodes || []);
      setEpisodeFile(safeName);
      setNewEpisodeOpen(false);
      setNewEpisodeName("");
      setNewEpisodeSeries("");
      setStatus(`Created ${safeName}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  }, [newEpisodeName, newEpisodeSeries]);

  const handleApplyDraft = useCallback(
    (appliedContent: EpisodeContent) => {
      const { episode } = store.getState();
      const before = episode.content;
      if (before) recordEpisodeEdit(before, appliedContent, episode.activeIndex, 0);
      setContent(appliedContent);
      setDraftContent(null);
      setDirty(true);
      setActiveIndex(0);
      setStatus("Draft applied — review and save");
    },
    []
  );

  const handleDiscardDraft = useCallback(() => {
    setDraftContent(null);
    setStatus("Draft discarded");
  }, []);

  const slides = (draftContent || content)?.slides || [];
  const currentEpisode = episodes.find((e) => e.file === episodeFile);

  const newEpisodeModal = newEpisodeOpen && (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
      <div style={{ background: "#FFFFFF", border: "1px solid #DDE0ED", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%" }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#16161A" }}>New episode</div>
        <div className="field">
          <label>Episode name</label>
          <input
            autoFocus
            value={newEpisodeName}
            onChange={(e) => setNewEpisodeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newEpisodeName.trim()) handleCreateEpisode();
              if (e.key === "Escape") setNewEpisodeOpen(false);
            }}
            placeholder="e.g. jwt, cookie-auth"
          />
        </div>
        <div className="field">
          <label>Series (optional)</label>
          <input
            value={newEpisodeSeries}
            onChange={(e) => setNewEpisodeSeries(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newEpisodeName.trim()) handleCreateEpisode();
              if (e.key === "Escape") setNewEpisodeOpen(false);
            }}
            placeholder="e.g. Backend Basics"
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" disabled={!newEpisodeName.trim()} onClick={handleCreateEpisode}>Create</button>
          <button className="btn" onClick={() => setNewEpisodeOpen(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );

  if (!content || !theme) {
    const noEpisodes = bootstrapped && episodes.length === 0;
    const episodeLoadFailed = bootstrapped && !noEpisodes && !content;
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", color: "#6A7389" }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          {noEpisodes ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#16161A", marginBottom: 8 }}>No episodes yet</div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>Create your first episode to get started.</div>
              <button className="btn btn-primary" onClick={() => setNewEpisodeOpen(true)}>New episode</button>
            </>
          ) : episodeLoadFailed ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#D94040", marginBottom: 8 }}>Episode failed to load</div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>{status || `Could not load ${episodeFile}`}</div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setStatus("");
                  setEpisodeFile(episodes[0].file);
                }}
              >
                Open {episodes[0].episode || episodes[0].file}
              </button>
            </>
          ) : (
            <>
              <div className="status-dot saving" style={{ width: 10, height: 10, margin: "0 auto 10px" }} />
              <div>Loading studio…</div>
              {status && <div style={{ fontSize: 12, marginTop: 8, color: "#D94040" }}>{status}</div>}
            </>
          )}
        </div>
        {newEpisodeModal}
      </div>
    );
  }

  return (
    <main className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <Link href="/home" className="brand" aria-label="Home" title="Home">
          <div className="brand-mark"><span /></div>
          <span>sitehie</span>
          <span className="version">STUDIO</span>
        </Link>
        <div className="toolbar">
          <button className="project-switcher">
            <span className="project-dot">S</span>
            <span>{currentEpisode?.episode || episodeFile}</span>
            <Icon name="chevronDown" size={14} />
          </button>
          <i className="toolbar-divider" />
          <ThemeSwitcher />
          <i className="toolbar-divider" />
          <div className="history">
            <button
              className={`icon-button${canUndo ? "" : " disabled"}`}
              aria-label="Undo"
              onClick={undo}
              disabled={!canUndo}
            >
              <Icon name="undo" />
            </button>
            <button
              className={`icon-button${canRedo ? "" : " disabled"}`}
              aria-label="Redo"
              onClick={redo}
              disabled={!canRedo}
            >
              <Icon name="redo" />
            </button>
          </div>
        </div>
      </header>

      {/* Workspace */}
      <section className="workspace">
        {/* Sidebar */}
        <aside className="sidebar">
          <EpisodeManager
            episodes={episodes}
            activeFile={episodeFile}
            onSelect={setEpisodeFile}
            onDeleted={handleEpisodeDeleted}
            onNew={() => setNewEpisodeOpen(true)}
          />
          <div className="sidebar-rule" />
          <SlideList
            slides={slides}
            activeIndex={activeIndex}
            onSelect={setActiveIndex}
            onReorder={reorderSlides}
            onAdd={addSlide}
            onRemove={removeSlide}
          />
          <div style={{ padding: "8px 4px", borderTop: "1px solid #DDE0ED" }}>
            <AiArranger
              theme={theme}
              themeFile={themeFile}
              onApply={handleApplyDraft}
              episodeName={content.episode}
              seriesName={content.series || ""}
            />
            <AiGenerator
              theme={theme}
              themeFile={themeFile}
              onApply={handleApplyDraft}
              episodeName={content.episode}
              seriesName={content.series || ""}
            />
          </div>
        </aside>

        {/* Panels */}
        <EditorPanel
          themeForm={<ThemePanel />}
          onHistoryRestore={handleHistoryRestore}
        />
        <PreviewPanel />
      </section>

      {/* Modals */}
      {pendingRestore && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
          <div style={{ background: "#FFFFFF", border: "1px solid #DDE0ED", borderRadius: 12, padding: 24, maxWidth: 420, width: "90%" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: "#16161A" }}>Unsaved changes found</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              {pendingRestore.type === "episode" ? "Episode" : "Theme"} autosave from{" "}
              {new Date(pendingRestore.autosaveTime).toLocaleString()}.
              <br />Restore it or discard and keep the explicit save?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={handleRestoreAutosave}>Restore</button>
              <button className="btn btn-danger" onClick={handleDiscardAutosave}>Discard</button>
            </div>
          </div>
        </div>
      )}

      {newEpisodeModal}

      {status && !pendingRestore && (
        <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: "#FFFFFF", border: "1px solid #DDE0ED", borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "#6A7389", zIndex: 50 }}>
          {status}
        </div>
      )}
    </main>
  );
}
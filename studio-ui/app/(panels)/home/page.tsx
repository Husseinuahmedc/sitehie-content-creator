"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import EpisodeCard from "@/components/EpisodeCard";
import EmptyState from "@/components/EmptyState";
import {
  useEpisodes,
  useThemes,
  useThemeFile,
  useTheme,
  setEpisodes,
  setThemes,
  setEpisodeFile,
  setNewEpisodeOpen,
} from "@/state";
import type { Theme } from "@sitehie/core/domain";

/**
 * Home screen ("/") of the new Arabic shell: real episode grid + search +
 * create. Read-only against the theme slice — browsing never touches
 * store.theme.theme / themeDirty. Episodes carry no theme of their own, so
 * card previews render with the currently active theme (real themes only).
 */
export default function HomePage() {
  const router = useRouter();
  const episodes = useEpisodes();
  const themes = useThemes();
  const activeThemeFile = useThemeFile();
  const storeTheme = useTheme();

  const [bootstrapped, setBootstrapped] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(storeTheme);
  const [query, setQuery] = useState("");

  // Bootstrap the episode + theme lists (mirrors the studio shell).
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
        setEpisodes(ep.episodes || []);
        setThemes(th.themes || []);
      })
      .catch((err) => console.error("[Home] Bootstrap failed:", err))
      .finally(() => setBootstrapped(true));
  }, []);

  // Ensure a usable Theme object for the proof frames. Prefer the in-memory
  // active theme; otherwise load the active theme file (default first).
  useEffect(() => {
    if (previewTheme) return;
    const storeReady = storeTheme && storeTheme.colors && storeTheme.name;
    if (storeReady) {
      setPreviewTheme(storeTheme);
      return;
    }
    const file =
      themes.find((t) => t.file === activeThemeFile)?.file ||
      themes[0]?.file;
    if (!file) return;
    let cancelled = false;
    fetch(`/api/themes?name=${encodeURIComponent(file)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Theme load failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled && data.theme) setPreviewTheme(data.theme);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [previewTheme, storeTheme, themes, activeThemeFile]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return episodes;
    return episodes.filter((ep) => {
      const title = (ep.episode || ep.file).toLowerCase();
      const series = (ep.series || "").toLowerCase();
      return title.includes(q) || series.includes(q);
    });
  }, [episodes, query]);

  const handleOpenEpisode = (file: string) => {
    setEpisodeFile(file);
    router.push("/editor");
  };

  const handleCreate = () => {
    // Reuse the studio shell's real new-episode modal (name + series).
    setNewEpisodeOpen(true);
    router.push("/editor");
  };

  return (
    <div className="home-shell">
      <header className="home-topbar">
        <div className="home-wordmark">
          <span className="mark">sitehie</span>
          <span className="studio">studio</span>
        </div>
        <span className="home-topbar-spacer" />
        <button className="btn-ghost-sm" onClick={() => router.push("/themes")}>
          <Icon name="palette" size={14} />
          المظاهر
        </button>
        <button className="btn-primary-sm" onClick={handleCreate}>
          <Icon name="plus" size={14} />
          حلقة جديدة
        </button>
      </header>

      <main className="home-main">
        <div className="home-heading">
          <h1 className="home-h1">حلقاتك</h1>
          <p className="home-subtitle">
            {episodes.length} {episodes.length === 1 ? "حلقة" : "حلقات"} · كاروسيل تقني عربي
          </p>
        </div>

        <div className="home-search">
          <span className="home-search-icon">
            <Icon name="search" size={14} />
          </span>
          <input
            className="home-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالعنوان أو المظهر..."
            aria-label="بحث"
          />
        </div>

        {!bootstrapped && previewTheme === null ? (
          <div className="home-loading">جارٍ التحميل…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasEpisodes={episodes.length > 0}
            theme={previewTheme}
            onAction={handleCreate}
          />
        ) : (
          <div className="home-grid">
            {filtered.map((ep) => (
              <EpisodeCard
                key={ep.file}
                meta={ep}
                theme={previewTheme}
                onOpen={() => handleOpenEpisode(ep.file)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
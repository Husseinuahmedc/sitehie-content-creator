"use client";

import type { ReactNode } from "react";
import SlideEditor from "@/components/SlideEditor";
import SlideStylePanel from "@/components/SlideStylePanel";
import HistoryPanel from "@/components/HistoryPanel";
import Icon from "@/components/Icon";
import type { Episode as EpisodeContent, Theme } from "@sitehie/core/domain";
import {
  store,
  useContent,
  useDraftContent,
  useActiveIndex,
  useEpisodeFile,
  useTheme,
  useThemeFile,
  useTab,
  updateSlide,
  addSlide,
  setTab,
  setStatus,
} from "@/state";

type Props = {
  themeForm?: ReactNode;
  onHistoryRestore: (content: EpisodeContent, theme: Theme | null) => void;
};

export default function EditorPanel({ themeForm, onHistoryRestore }: Props) {
  const content = useContent();
  const draftContent = useDraftContent();
  const activeIndex = useActiveIndex();
  const episodeFile = useEpisodeFile();
  const theme = useTheme();
  const themeFile = useThemeFile();
  const tab = useTab();

  const slides = (draftContent || content)?.slides || [];
  const activeSlide = slides[activeIndex] || null;

  const handleSaveSnapshot = async () => {
    const { episode, theme: currentTheme } = store.getState();
    if (!episode.content) return;
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeFile: episode.episodeFile,
          content: episode.content,
          theme: currentTheme.theme,
        }),
      });
      setStatus("Snapshot saved");
    } catch {
      setStatus("Snapshot failed");
    }
  };

  return (
    <section className="editor-panel">
      <div className="editor-top">
        <div>
          <p className="crumb">
            EPISODE {String(activeIndex + 1).padStart(2, "0")}
            <span>/</span>
            SLIDE {String(activeIndex + 1).padStart(2, "0")}
          </p>
          <h1>{activeSlide?.type === "cover" ? "Cover" : `Slide ${activeIndex + 1}`}</h1>
        </div>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === "content" ? "active" : ""}`} onClick={() => setTab("content")}>Content</button>
        <button className={`tab ${tab === "style" ? "active" : ""}`} onClick={() => setTab("style")}>Style</button>
        <button className={`tab ${tab === "theme" ? "active" : ""}`} onClick={() => setTab("theme")}>Theme</button>
      </div>
      <div className="form-area">
        {tab === "content" && activeSlide && theme && (
          <SlideEditor
            slide={activeSlide}
            index={activeIndex}
            onChange={updateSlide}
            themeName={theme?.name || themeFile.replace(/\.theme\.json$/, "")}
            themeFamily={theme?.family}
            theme={theme}
          />
        )}
        {tab === "style" && activeSlide && theme && (
          <SlideStylePanel slide={activeSlide} theme={theme} onChange={updateSlide} />
        )}
        {tab === "theme" && themeForm}
      </div>
      <div className="editor-bottom">
        <button className="secondary-button" onClick={handleSaveSnapshot}>
          <Icon name="copy" size={15} /> Snapshot
        </button>
        <HistoryPanel episodeFile={episodeFile} onRestore={onHistoryRestore} />
        <button className="add-slide" onClick={() => addSlide("cover")}>
          <Icon name="plus" size={16} /> Add slide
        </button>
      </div>
    </section>
  );
}
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import SlidePreview from "@/components/SlidePreview";
import {
  useContent,
  useDraftContent,
  useActiveIndex,
  useTheme,
  useSelectedTargetId,
  useAutosaveStatus,
  updateSlide,
  applyThemeChange,
  setActiveIndex,
  setSelectedTargetId,
  setTab,
  saveEpisode,
  store,
} from "@/state";

export default function PreviewPanel() {
  const content = useContent();
  const draftContent = useDraftContent();
  const activeIndex = useActiveIndex();
  const theme = useTheme();
  const selectedTargetId = useSelectedTargetId();
  const autosaveStatus = useAutosaveStatus();
  const router = useRouter();

  const handleSelectTarget = useCallback((id: string | null) => {
    setSelectedTargetId(id);
    if (id) setTab("theme");
  }, []);

  const handlePresent = useCallback(async () => {
    // Step 1: flush any pending save before navigating (§7 snapshot semantics)
    await saveEpisode();
    // Step 2: read the latest state after save completes
    const state = store.getState();
    const epFile = state.episode.episodeFile;
    const tFile = state.theme.themeFile;
    const safeName = epFile.replace(/\.json$/, "");
    router.push(
      `/present/${encodeURIComponent(safeName)}?theme=${encodeURIComponent(tFile)}&slide=${activeIndex}`,
    );
  }, [activeIndex, router]);

  if (!content || !theme) return null;

  return (
    <section className="preview-panel">
      <SlidePreview
        content={draftContent || content}
        theme={theme}
        slideIndex={activeIndex}
        selectedTargetId={selectedTargetId}
        onSelectTarget={handleSelectTarget}
        onSelectSlide={setActiveIndex}
        onThemeChange={applyThemeChange}
        onUpdateSlide={updateSlide}
        saveStatus={autosaveStatus}
        onPresent={handlePresent}
      />
    </section>
  );
}
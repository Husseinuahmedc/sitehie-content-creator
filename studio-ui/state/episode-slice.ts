"use client";

import type { Episode as EpisodeContent, Slide } from "@sitehie/core/domain";
import { store } from "./index";
import { resolveValue } from "./store";
import { setSaving, setStatus, setTab } from "./ui-slice";
import { recordEpisodeEdit } from "./edit-history-slice";

/** Episode list-metadata DTO (matches GET /api/episodes responses). */
export type EpisodeMeta = {
  file: string;
  path: string;
  episode: string;
  series: string;
  slideCount: number;
};

/**
 * Episode domain slice. Owner: editor panel (writes via the setters below;
 * other panels read read-only via the `use*` hooks).
 */
export type EpisodeSlice = {
  episodes: EpisodeMeta[];
  episodeFile: string;
  content: EpisodeContent | null;
  draftContent: EpisodeContent | null;
  activeIndex: number;
  dirty: boolean;
};

export function createInitialEpisodeSlice(): EpisodeSlice {
  return {
    episodes: [],
    episodeFile: "",
    content: null,
    draftContent: null,
    activeIndex: 0,
    dirty: false,
  };
}

export const useEpisodeSlice = () => store.useStore((s) => s.episode);
export const useEpisodes = () => store.useStore((s) => s.episode.episodes);
export const useEpisodeFile = () => store.useStore((s) => s.episode.episodeFile);
export const useContent = () => store.useStore((s) => s.episode.content);
export const useDraftContent = () => store.useStore((s) => s.episode.draftContent);
export const useActiveIndex = () => store.useStore((s) => s.episode.activeIndex);
export const useDirty = () => store.useStore((s) => s.episode.dirty);

export const setEpisodes = (next: EpisodeMeta[] | ((prev: EpisodeMeta[]) => EpisodeMeta[])) =>
  store.setState((s) => ({
    ...s,
    episode: { ...s.episode, episodes: resolveValue(next, s.episode.episodes) },
  }));
export const setEpisodeFile = (episodeFile: string) =>
  store.setState((s) => ({ ...s, episode: { ...s.episode, episodeFile } }));
export const setContent = (content: EpisodeContent | null) =>
  store.setState((s) => ({ ...s, episode: { ...s.episode, content } }));
export const setDraftContent = (draftContent: EpisodeContent | null) =>
  store.setState((s) => ({ ...s, episode: { ...s.episode, draftContent } }));
export const setActiveIndex = (activeIndex: number) =>
  store.setState((s) => ({ ...s, episode: { ...s.episode, activeIndex } }));
export const setDirty = (dirty: boolean) =>
  store.setState((s) => ({ ...s, episode: { ...s.episode, dirty } }));

// --- Shared episode actions (used by the editor panel, preview panel, and the
// --- shell's sidebar chrome). They read the current slice via store.getState()
// --- at call time so their identity stays stable across renders.
//
// --- Undo-history note: these actions record a {before, after} entry when the
// --- edit commits to the real `content` (no draft staged). Edits made while a
// --- draft is staged target `draftContent` and are NOT recorded — a draft is a
// --- staging buffer applied-or-discarded atomically, and the apply is the single
// --- undoable step (see page.tsx handleApplyDraft).

export const updateSlide = (slide: Slide) => {
  const { episode } = store.getState();
  const target = episode.draftContent || episode.content;
  if (!target) return;
  const idx = episode.activeIndex;
  const next = [...target.slides];
  next[episode.activeIndex] = slide;
  const updated = { ...target, slides: next };
  if (episode.draftContent) setDraftContent(updated);
  else {
    recordEpisodeEdit(target, updated, idx, idx);
    setContent(updated);
  }
  setDirty(true);
};

export const reorderSlides = (from: number, to: number) => {
  const { episode } = store.getState();
  const target = episode.draftContent || episode.content;
  if (!target) return;
  const beforeIdx = episode.activeIndex;
  const next = [...target.slides];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  const updated = { ...target, slides: next };
  if (episode.draftContent) setDraftContent(updated);
  else {
    recordEpisodeEdit(target, updated, beforeIdx, to);
    setContent(updated);
  }
  setActiveIndex(to);
  setDirty(true);
};

export const addSlide = (type: Slide["type"]) => {
  const { episode } = store.getState();
  const target = episode.draftContent || episode.content;
  if (!target) return;
  const blank: Slide =
    type === "cover"
      ? { type: "cover", title: "عنوان جديد" }
      : type === "quote"
        ? { type: "quote", paragraphs: [{ text: "نص الاقتباس…", highlights: [], cyanWords: [] }] }
        : type === "comparison"
          ? {
              type: "comparison",
              title: "مقارنة جديدة",
              sideA: { label: "Option A", points: ["نقطة أولى", "نقطة ثانية"] },
              sideB: { label: "Option B", points: ["نقطة أولى", "نقطة ثانية"] },
            }
          : type === "stat"
            ? { type: "stat", value: "10x", label: "عنوان المقياس", subtext: "" }
            : type === "outro"
              ? { type: "outro", question: "ما رأيك؟ اكتب في التعليقات", cta: "احفظ • شارك • تابع" }
              : type === "canvas"
                ? {
                    type: "canvas",
                    frame: {
                      width: 1080,
                      height: 1350,
                      background: "#0D1117",
                      backgroundType: "solid",
                      borderRadius: 0,
                    },
                    objects: [],
                  }
                : {
                    type: "code",
                    titleEn: "Title",
                    subtitleEn: "section",
                    code: "// code",
                    language: "javascript",
                    explanation: "شرح…",
                    annotations: [],
                  };
  const updated = { ...target, slides: [...target.slides, blank] };
  const beforeIdx = episode.activeIndex;
  const afterIdx = target.slides.length;
  if (episode.draftContent) setDraftContent(updated);
  else {
    recordEpisodeEdit(target, updated, beforeIdx, afterIdx);
    setContent(updated);
  }
  setActiveIndex(afterIdx);
  setDirty(true);
  setTab("content");
};

export const removeSlide = (index: number) => {
  const { episode } = store.getState();
  const target = episode.draftContent || episode.content;
  if (!target || target.slides.length <= 1) return;
  const beforeIdx = episode.activeIndex;
  const next = target.slides.filter((_, i) => i !== index);
  const updated = { ...target, slides: next };
  const afterIdx = Math.max(0, Math.min(beforeIdx, next.length - 1));
  if (episode.draftContent) setDraftContent(updated);
  else {
    recordEpisodeEdit(target, updated, beforeIdx, afterIdx);
    setContent(updated);
  }
  setActiveIndex(afterIdx);
  setDirty(true);
};

export const saveEpisode = async () => {
  const { episode } = store.getState();
  if (!episode.content) return;
  setSaving(true);
  setStatus("Saving episode…");
  try {
    const res = await fetch("/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: episode.episodeFile, content: episode.content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    setDirty(false);
    setStatus(`Saved ${episode.episodeFile}`);
    await fetch(`/api/autosave?type=episode&name=${encodeURIComponent(episode.episodeFile)}`, { method: "DELETE" }).catch(() => {});
    const afterSave = store.getState();
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episodeFile: episode.episodeFile,
        content: episode.content,
        theme: afterSave.theme.theme,
      }),
    }).catch(() => {});
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  } finally {
    setSaving(false);
  }
};
"use client";

import type { Episode as EpisodeContent, Theme } from "@sitehie/core/domain";
import { store } from "./index";

export type Tab = "content" | "theme" | "style";
export type AutosaveStatus = "idle" | "saving" | "synced" | "error";

export type PendingRestore = {
  type: "episode" | "theme";
  fileName: string;
  autosaveTime: number;
  data: EpisodeContent | Theme;
} | null;

/**
 * UI chrome / orchestration slice. Owner: the shell (reads/writes freely);
 * panels read it read-only.
 */
export type UiSlice = {
  tab: Tab;
  saving: boolean;
  status: string;
  autosaveStatus: AutosaveStatus;
  pendingRestore: PendingRestore;
  newEpisodeOpen: boolean;
  newEpisodeName: string;
  newEpisodeSeries: string;
  bootstrapped: boolean;
  selectedTargetId: string | null;
};

export function createInitialUiSlice(): UiSlice {
  return {
    tab: "content",
    saving: false,
    status: "",
    autosaveStatus: "idle",
    pendingRestore: null,
    newEpisodeOpen: false,
    newEpisodeName: "",
    newEpisodeSeries: "",
    bootstrapped: false,
    selectedTargetId: null,
  };
}

export const useUiSlice = () => store.useStore((s) => s.ui);
export const useTab = () => store.useStore((s) => s.ui.tab);
export const useSaving = () => store.useStore((s) => s.ui.saving);
export const useStatus = () => store.useStore((s) => s.ui.status);
export const useAutosaveStatus = () => store.useStore((s) => s.ui.autosaveStatus);
export const usePendingRestore = () => store.useStore((s) => s.ui.pendingRestore);
export const useNewEpisodeOpen = () => store.useStore((s) => s.ui.newEpisodeOpen);
export const useNewEpisodeName = () => store.useStore((s) => s.ui.newEpisodeName);
export const useNewEpisodeSeries = () => store.useStore((s) => s.ui.newEpisodeSeries);
export const useBootstrapped = () => store.useStore((s) => s.ui.bootstrapped);
export const useSelectedTargetId = () => store.useStore((s) => s.ui.selectedTargetId);

export const setTab = (tab: Tab) => store.setState((s) => ({ ...s, ui: { ...s.ui, tab } }));
export const setSaving = (saving: boolean) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, saving } }));
export const setStatus = (status: string) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, status } }));
export const setAutosaveStatus = (autosaveStatus: AutosaveStatus) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, autosaveStatus } }));
export const setPendingRestore = (pendingRestore: PendingRestore) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, pendingRestore } }));
export const setNewEpisodeOpen = (newEpisodeOpen: boolean) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, newEpisodeOpen } }));
export const setNewEpisodeName = (newEpisodeName: string) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, newEpisodeName } }));
export const setNewEpisodeSeries = (newEpisodeSeries: string) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, newEpisodeSeries } }));
export const setBootstrapped = (bootstrapped: boolean) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, bootstrapped } }));
export const setSelectedTargetId = (selectedTargetId: string | null) =>
  store.setState((s) => ({ ...s, ui: { ...s.ui, selectedTargetId } }));
"use client";

import type { Theme } from "@sitehie/core/domain";
import { store } from "./index";
import { resolveValue } from "./store";
import { setSaving, setStatus } from "./ui-slice";
import { recordThemeEdit } from "./edit-history-slice";

/** Theme list-metadata DTO (matches GET /api/themes responses). */
export type ThemeMeta = {
  file: string;
  name: string;
  description: string;
};

/**
 * Theme domain slice. Owner: theme panel (writes via the setters below; other
 * panels read read-only via the `use*` hooks).
 */
export type ThemeSlice = {
  themes: ThemeMeta[];
  themeFile: string;
  theme: Theme | null;
  themeDirty: boolean;
};

export function createInitialThemeSlice(): ThemeSlice {
  return {
    themes: [],
    themeFile: "default.theme.json",
    theme: null,
    themeDirty: false,
  };
}

export const useThemeSlice = () => store.useStore((s) => s.theme);
export const useThemes = () => store.useStore((s) => s.theme.themes);
export const useThemeFile = () => store.useStore((s) => s.theme.themeFile);
export const useTheme = () => store.useStore((s) => s.theme.theme);
export const useThemeDirty = () => store.useStore((s) => s.theme.themeDirty);

export const setThemes = (next: ThemeMeta[] | ((prev: ThemeMeta[]) => ThemeMeta[])) =>
  store.setState((s) => ({
    ...s,
    theme: { ...s.theme, themes: resolveValue(next, s.theme.themes) },
  }));
export const setThemeFile = (themeFile: string) =>
  store.setState((s) => ({ ...s, theme: { ...s.theme, themeFile } }));
export const setTheme = (theme: Theme | null) =>
  store.setState((s) => ({ ...s, theme: { ...s.theme, theme } }));
export const setThemeDirty = (themeDirty: boolean) =>
  store.setState((s) => ({ ...s, theme: { ...s.theme, themeDirty } }));

// --- Shared theme actions. `applyThemeChange` is the sanctioned route through
// --- which SlidePreview's live layout-drag edits (preview panel) and the theme
// --- form (theme panel) apply theme edits; `saveTheme` is shared by the theme
// --- form and the shell's Cmd/Ctrl+Shift+S shortcut.

export const applyThemeChange = (next: Theme) => {
  const currentTheme = store.getState().theme.theme;
  if (currentTheme && next !== currentTheme) {
    recordThemeEdit(currentTheme, next);
  }
  setTheme(next);
  setThemeDirty(true);
};

export const saveTheme = async (mode: "update" | "new", newName?: string) => {
  const themeSlice = store.getState().theme;
  const currentTheme = themeSlice.theme;
  if (!currentTheme) return;
  setSaving(true);
  setStatus("Saving theme…");
  try {
    const fileName =
      mode === "new" && newName
        ? newName.endsWith(".theme.json")
          ? newName
          : `${newName}.theme.json`
        : themeSlice.themeFile;
    const themeToSave =
      mode === "new" && newName
        ? { ...currentTheme, name: newName.replace(/\.theme\.json$/, "") }
        : currentTheme;
    const res = await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, theme: themeToSave }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.errors?.join("\n") || "Save failed");
    if (mode === "new") {
      setThemeFile(fileName);
      setThemes((t) => [
        ...t,
        { file: fileName, name: themeToSave.name, description: themeToSave.description || "" },
      ]);
    }
    setTheme(themeToSave);
    setStatus(`Theme saved → ${fileName}`);
    await fetch(`/api/autosave?type=theme&name=${encodeURIComponent(fileName)}`, { method: "DELETE" }).catch(() => {});
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err));
  } finally {
    setSaving(false);
  }
};
"use client";

import ThemeForm from "@/components/ThemePanel";
import {
  useTheme,
  useThemeFile,
  useSaving,
  useSelectedTargetId,
  applyThemeChange,
  saveTheme,
  setThemeDirty,
  setSelectedTargetId,
} from "@/state";

export default function ThemePanel() {
  const theme = useTheme();
  const themeFile = useThemeFile();
  const saving = useSaving();
  const selectedTargetId = useSelectedTargetId();

  if (!theme) return null;

  return (
    <ThemeForm
      theme={theme}
      themeFile={themeFile}
      onChange={applyThemeChange}
      onSave={async (mode, newName) => {
        await saveTheme(mode, newName);
        setThemeDirty(false);
      }}
      saving={saving}
      selectedTargetId={selectedTargetId}
      onSelectTarget={setSelectedTargetId}
    />
  );
}
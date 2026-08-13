"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { useThemes, useThemeFile, setThemeFile } from "@/state";

export default function ThemeSwitcher() {
  const themes = useThemes();
  const themeFile = useThemeFile();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = themes.find((t) => t.file === themeFile);

  const select = (file: string) => {
    setOpen(false);
    if (file === themeFile) return;
    setThemeFile(file);
  };

  return (
    <div className="dropdown theme-switcher" ref={rootRef}>
      <button
        className="theme-switcher-trigger"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch theme"
      >
        <Icon name="palette" size={14} />
        <span className="theme-switcher-name">
          {current?.name || themeFile.replace(/\.theme\.json$/, "")}
        </span>
        <Icon name="chevronDown" size={13} />
      </button>

      {open && (
        <div className="dropdown-menu theme-switcher-menu" role="listbox" aria-label="Theme">
          <p className="theme-switcher-label">Slide theme</p>
          {themes.map((t) => {
            const active = t.file === themeFile;
            return (
              <button
                key={t.file}
                type="button"
                className={`dropdown-item theme-switcher-item${active ? " active" : ""}`}
                role="option"
                aria-selected={active}
                onClick={() => select(t.file)}
              >
                <span className="dropdown-item-icon theme-switcher-icon">
                  <Icon name="palette" size={13} />
                </span>
                <span className="theme-switcher-item-name">{t.name}</span>
                {active && (
                  <span className="theme-switcher-check">
                    <Icon name="chevronRight" size={13} />
                  </span>
                )}
              </button>
            );
          })}
          {themes.length === 0 && <p className="theme-switcher-empty">No themes found</p>}
        </div>
      )}
    </div>
  );
}
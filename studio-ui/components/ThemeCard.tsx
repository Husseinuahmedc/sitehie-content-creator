"use client";

import type { Episode as EpisodeContent, Theme } from "@sitehie/core/domain";
import ProofFrame from "./ProofFrame";
import { swatch } from "./swatch";

type Props = {
  theme: Theme | null;
  /** Real episode content when one is open in the studio; null otherwise. */
  specimen: EpisodeContent | null;
  isSelected: boolean;
  onClick: () => void;
};

/**
 * Theme row in the Theme manager list: mini proof frame + real swatches.
 * When no real episode content is loaded, the mini preview falls back to a
 * cover proof built strictly from the theme's own real name — never a
 * fabricated slide title.
 */
export default function ThemeCard({ theme, specimen, isSelected, onClick }: Props) {
  const swatches = theme
    ? [theme.colors?.background, theme.colors?.textPrimary, theme.colors?.primary].filter(
        Boolean
      ) as string[]
    : [];

  const proofContent: EpisodeContent | null =
    specimen && specimen.slides.length > 0
      ? specimen
      : theme
        ? { episode: theme.name, series: theme.description, slides: [{ type: "cover", title: theme.name }] }
        : null;

  return (
    <button
      className={`theme-card${isSelected ? " selected" : ""}`}
      onClick={onClick}
      aria-label={theme ? `المظهر ${theme.name}` : "المظهر"}
    >
      {theme && proofContent ? (
        <ProofFrame content={proofContent} theme={theme} slideIndex={0} size="mini" />
      ) : (
        <span className="pf-frame pf-mini pf-empty">
          <span className="pf-skeleton">
            <i />
            <i />
            <i />
          </span>
        </span>
      )}
      <span className="theme-card-main">
        <span className="theme-card-name">{theme?.name ?? "…"}</span>
        <span className="theme-card-swatches">
          {swatches.map((c, i) => (
            <i key={i} style={swatch(c)} />
          ))}
        </span>
      </span>
      {isSelected && <i className="theme-card-check" />}
    </button>
  );
}
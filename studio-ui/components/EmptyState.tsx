"use client";

import type { Theme } from "@sitehie/core/domain";
import Icon from "./Icon";
import { swatch } from "./swatch";

type Props = {
  hasEpisodes: boolean;
  theme: Theme | null;
  onAction: () => void;
};

/**
 * Empty state for the Home screen: no-results vs first-episode variants.
 * Card backgrounds/accents come from the real active theme when available
 * (bound via the single `--swatch` custom property); otherwise the visual
 * degrades to CSS-only neutral classes in globals.css — no hex literals.
 */
export default function EmptyState({ hasEpisodes, theme, onAction }: Props) {
  const themed = theme !== null;
  const cards = [
    { color: theme?.colors?.background, accent: theme?.colors?.primary },
    { color: theme?.colors?.codeBackground, accent: theme?.colors?.secondary },
    { color: theme?.colors?.surface, accent: theme?.colors?.highlightMarker },
  ];

  return (
    <div className="empty-state">
      <div className="empty-visual">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`empty-card c${i + 1}${themed ? "" : " neutral"}`}
            style={swatch(card.color)}
          >
            <span className="bar lg" style={swatch(card.accent)} />
            <span className="bar md" style={swatch(card.accent)} />
            <span className="bar sm" style={swatch(card.accent)} />
          </div>
        ))}
      </div>

      <h2 className="empty-title">{hasEpisodes ? "لا توجد نتائج" : "ابدأ أول حلقة"}</h2>
      <p className="empty-help">
        {hasEpisodes
          ? "لم تتطابق الحلقات مع بحثك. حاول بكلمة مختلفة."
          : "أنشئ كاروسيل تقني لجمهورك العربي — كل حلقة عبارة عن سلسلة شرائح تعليمية جاهزة للنشر."}
      </p>
      {!hasEpisodes && (
        <button className="btn-primary-md" onClick={onAction} aria-label="ابدأ حلقة جديدة">
          <Icon name="plus" size={14} />
          ابدأ حلقة جديدة
        </button>
      )}
    </div>
  );
}
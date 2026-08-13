"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import ThemeCard from "@/components/ThemeCard";
import ThemeColorField from "@/components/ThemeColorField";
import ProofFrame from "@/components/ProofFrame";
import { swatch } from "@/components/swatch";
import { useThemes, useContent, useActiveIndex, setThemes } from "@/state";
import type { Episode as EpisodeContent, Theme } from "@sitehie/core/domain";

/**
 * Cover-style proof built strictly from the theme's own real fields (name +
 * description) — used only when no real episode content is open in the studio,
 * so the preview never fabricates episode/slide copy.
 */
function coverProof(theme: Theme): EpisodeContent {
  return {
    episode: theme.name,
    series: theme.description,
    slides: [{ type: "cover", title: theme.name }],
  };
}

/**
 * Theme manager ("themes"): browse themes against the real preview contract,
 * edit a draft copy of one theme, and persist through the real /api/themes
 * route. Browsing/selection is local state only — it never writes
 * store.theme.theme / themeDirty.
 */
export default function ThemesPage() {
  const router = useRouter();
  const themes = useThemes();
  const liveContent = useContent();
  const liveIndex = useActiveIndex();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [objects, setObjects] = useState<Record<string, Theme>>({});
  const [draft, setDraft] = useState<Theme | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bootstrap the theme list.
  useEffect(() => {
    fetch("/api/themes")
      .then(async (r) => {
        if (!r.ok) throw new Error(`Themes fetch failed (${r.status})`);
        return r.json();
      })
      .then((data) => setThemes(data.themes || []))
      .catch((err) => console.error("[Themes] Bootstrap failed:", err));
  }, []);

  // Default-select the first theme once the list is loaded.
  useEffect(() => {
    if (!selectedId && themes.length > 0) setSelectedId(themes[0].file);
  }, [selectedId, themes]);

  // Load every theme's full object (the list only carries file/name/desc).
  useEffect(() => {
    if (themes.length === 0) return;
    let cancelled = false;
    Promise.all(
      themes.map((t) =>
        fetch(`/api/themes?name=${encodeURIComponent(t.file)}`)
          .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`Theme ${t.file} failed`))))
          .then((d) => (d.theme as Theme) || null)
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, Theme> = {};
      themes.forEach((t, i) => {
        if (results[i]) map[t.file] = results[i] as Theme;
      });
      setObjects(map);
    });
    return () => {
      cancelled = true;
    };
  }, [themes]);

  const selectedTheme = draft ?? objects[selectedId ?? ""] ?? null;

  const selectTheme = (file: string) => {
    setSelectedId(file);
    setDraft(null);
    setSaveError(null);
  };

  const startEditing = () => {
    const base = objects[selectedId ?? ""];
    if (!base) return;
    setDraft(structuredClone(base));
    setSaveError(null);
  };

  const cancelEditing = () => {
    setDraft(null);
    setSaveError(null);
  };

  const updateDraftName = (name: string) => setDraft((d) => (d ? { ...d, name } : d));
  const updateDraftColor = useCallback(
    (key: string) =>
      (value: string) =>
        setDraft((d) => (d ? { ...d, colors: { ...d.colors, [key]: value } } : d)),
    []
  );
  const updateDraftHandle = (handle: string) =>
    setDraft((d) => (d ? { ...d, brand: { ...(d.brand || {}), handle } } : d));

  const saveEdit = async () => {
    if (!draft || !selectedId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: selectedId, theme: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      // Reflect the saved object locally + refresh the list metadata.
      setObjects((prev) => ({ ...prev, [selectedId]: draft }));
      const listRes = await fetch("/api/themes");
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.themes) setThemes(listData.themes);
      }
      setDraft(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const isEditing = draft !== null;
  const editingFile = selectedId;
  const stageSwatches =
    selectedTheme === null
      ? []
      : [selectedTheme.colors?.background, selectedTheme.colors?.textPrimary, selectedTheme.colors?.primary, selectedTheme.colors?.secondary].filter(
          Boolean
        ) as string[];

  // Preview source: prefer the real open episode (its active/first slide),
  // otherwise fall back to the real theme's own fields — never mock copy.
  const hasLiveContent = liveContent !== null && liveContent.slides.length > 0;
  const previewContent: EpisodeContent | null = hasLiveContent
    ? liveContent
    : selectedTheme
      ? coverProof(selectedTheme)
      : null;
  const previewIndex = hasLiveContent
    ? Math.min(Math.max(liveIndex, 0), (liveContent as EpisodeContent).slides.length - 1)
    : 0;

  return (
    <div className="tm-screen">
      <header className="tm-topbar">
        <button className="tm-back" onClick={() => router.push("/home")} aria-label="الرجوع" title="الرجوع">
          <Icon name="back" size={16} />
        </button>
        <span className="tm-divider" />
        <div className="tm-crumb">
          <span className="sitehie">sitehie</span>
          <span className="sep">/</span>
          <span className="cur">المظاهر</span>
        </div>
        <span className="tm-topbar-spacer" />
        <div className="tm-actions">
          {isEditing ? (
            <>
              <button className="btn-ghost-sm" onClick={cancelEditing} disabled={saving}>
                إلغاء
              </button>
              <button className="btn-primary-sm" onClick={saveEdit} disabled={saving}>
                {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
              </button>
            </>
          ) : (
            <button className="btn-ghost-sm" onClick={startEditing} disabled={!selectedTheme}>
              تعديل المظهر
            </button>
          )}
        </div>
      </header>

      <div className="tm-body">
        <aside className="tm-list scroll-thin">
          <p className="tm-count">{themes.length} مظاهر</p>
          {themes.map((t) => (
            <ThemeCard
              key={t.file}
              theme={objects[t.file] ?? null}
              specimen={liveContent}
              isSelected={t.file === selectedId}
              onClick={() => selectTheme(t.file)}
            />
          ))}
        </aside>

        <section className="tm-stage">
          <span className="tm-stage-dots-bg" />
          <div className="tm-stage-proof">
            {selectedTheme && previewContent ? (
              <ProofFrame content={previewContent} theme={selectedTheme} slideIndex={previewIndex} size="lg" />
            ) : (
              <span className="pf-frame pf-lg pf-empty">
                <span className="pf-skeleton">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            )}
          </div>
          <div className="tm-stage-caption">
            <h2 className="tm-stage-name">{selectedTheme?.name ?? ""}</h2>
            <div className="tm-stage-swatches">
              {stageSwatches.map((c, i) => (
                <i key={i} style={swatch(c)} />
              ))}
            </div>
          </div>
        </section>

        {isEditing && draft && editingFile ? (
          <aside className="tm-aside scroll-thin">
            <div className="tm-editor">
              <h3 className="tm-edit-title">تعديل: {draft.name}</h3>

              <div className="tm-field">
                <label className="tm-field-label">اسم المظهر</label>
                <input
                  className="tm-input"
                  value={draft.name}
                  dir="rtl"
                  onChange={(e) => updateDraftName(e.target.value)}
                />
              </div>

              <div className="tm-colors">
                <p className="tm-section-label">الألوان</p>
                <ThemeColorField
                  label="لون الخلفية"
                  value={draft.colors?.background || ""}
                  onChange={updateDraftColor("background")}
                />
                <ThemeColorField
                  label="لون النص"
                  value={draft.colors?.textPrimary || ""}
                  onChange={updateDraftColor("textPrimary")}
                />
                <ThemeColorField
                  label="اللون المميّز"
                  value={draft.colors?.primary || ""}
                  onChange={updateDraftColor("primary")}
                />
                <ThemeColorField
                  label="لون الخلفية الثانوية"
                  value={draft.colors?.secondary || ""}
                  onChange={updateDraftColor("secondary")}
                />
              </div>

              <div className="tm-field">
                <label className="tm-field-label">الهاندل</label>
                <input
                  className="tm-input"
                  value={draft.brand?.handle ?? ""}
                  placeholder="@sitehie"
                  onChange={(e) => updateDraftHandle(e.target.value)}
                />
              </div>

              {saveError && <p className="tm-save-error">{saveError}</p>}
            </div>
          </aside>
        ) : (
          <aside className="tm-aside">
            <div className="tm-info">
              <div className="tm-info-swatches">
                {stageSwatches.map((c, i) => (
                  <i key={i} style={swatch(c)} />
                ))}
              </div>
              <p className="tm-info-text">
                هذا هو مظهر <strong>{selectedTheme?.name ?? ""}</strong>. يمكنك تعديله أو تطبيقه على
                حلقاتك من لوحة المساحة.
              </p>
              <button
                className="btn-primary-sm tm-edit-cta"
                onClick={startEditing}
                disabled={!selectedTheme}
              >
                تعديل هذا المظهر
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
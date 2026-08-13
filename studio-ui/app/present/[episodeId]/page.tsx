import { PresentPlayer } from "./present-player";
import type { Metadata } from "next";
import type { PresentationPreset } from "@sitehie/core/presentation";

type Props = {
  params: Promise<{ episodeId: string }>;
  searchParams: Promise<{ theme?: string; slide?: string; preset?: string }>;
};

export const metadata: Metadata = {
  title: "Present Mode — sitehie Studio",
};

const VALID_PRESETS = new Set<PresentationPreset>(["cinematic", "minimal", "energetic", "editorial"]);

export default async function PresentPage({ params, searchParams }: Props) {
  const { episodeId } = await params;
  const sp = await searchParams;
  const themeName = sp.theme ?? "default.theme.json";
  const initialSlide = Number(sp.slide ?? 0);
  const initialPreset: PresentationPreset = VALID_PRESETS.has(sp.preset as PresentationPreset)
    ? (sp.preset as PresentationPreset)
    : "cinematic";

  return (
    <PresentPlayer
      episodeId={episodeId}
      themeName={themeName}
      initialSlide={initialSlide}
      initialPreset={initialPreset}
    />
  );
}

import { NextRequest, NextResponse } from "next/server";
import { getAiAdapter, CAROUSEL_ROOT } from "@/lib/adapters";
import { resolveAssetsForSlides } from "@/lib/ai-arranger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/ai-arrange  — run the AI slide arranger */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rawText, targetCount, themeName, themeColors, modelName, provider } = body;

    if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
      return NextResponse.json({ error: "rawText is required" }, { status: 400 });
    }
    if (typeof targetCount !== "number" || targetCount < 1 || targetCount > 30) {
      return NextResponse.json({ error: "targetCount must be 1-30" }, { status: 400 });
    }

    const resolvedThemeName = themeName || "default";
    const result = await getAiAdapter(provider).arrange({
      rawText: rawText.trim(),
      targetCount,
      themeName: resolvedThemeName,
      themeColors: themeColors || {},
      modelName,
    });

    // The port's sketched adapters never read the filesystem — enrich covers
    // and body slides with theme-icon assets as the legacy arranger did.
    result.slides = await resolveAssetsForSlides(result.slides, resolvedThemeName, CAROUSEL_ROOT);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
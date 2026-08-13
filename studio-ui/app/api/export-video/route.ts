import { NextRequest, NextResponse } from "next/server";
import { exportPresentationVideo, type ExportFormat, type ExportTarget } from "@/lib/presentation-exporter";
import { buildPreviewSlideHtml, storage } from "@/lib/adapters";
import type { Episode, Theme } from "@sitehie/core/domain";
import type { PresentationPreset } from "@sitehie/core/presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

type ExportRequest = {
  episodeId: string;
  themeName: string;
  preset?: PresentationPreset;
  target?: {
    canvas?: { width?: number; height?: number };
    fit?: "contain" | "cover";
    anchor?: "center" | "top" | "bottom";
  };
  format?: "mp4" | "webm";
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ExportRequest;
    const safe = sanitizeRequest(body);

    // Load episode
    let episode: Episode;
    try {
      episode = (await storage.loadEpisode(safe.episodeName)) as Episode;
    } catch {
      return NextResponse.json({ error: `Episode "${safe.episodeName}" not found` }, { status: 404 });
    }

    // Load theme
    let theme: Theme;
    try {
      theme = (await storage.loadTheme(safe.themeName)) as Theme;
    } catch {
      return NextResponse.json({ error: `Theme "${safe.themeName}" not found` }, { status: 404 });
    }

    // Pre-render all slide HTMLs
    const slideHtmls: string[] = [];
    for (let i = 0; i < episode.slides.length; i++) {
      const html = await buildPreviewSlideHtml(episode, theme, i);
      slideHtmls.push(html);
    }

    const safeName = episode.episode.replace(/[^\w.-]+/g, "-");
    const outputName = `${safeName}-present-${safe.preset}.${safe.format}`;

    const videoBuffer = await exportPresentationVideo({
      episode,
      theme,
      slideHtmls,
      preset: safe.preset,
      canvas: safe.target.canvas,
      fit: safe.target.fit,
      anchor: safe.target.anchor,
      format: safe.format,
      outputPath: outputName,
    });

    const contentType = safe.format === "mp4" ? "video/mp4" : "video/webm";

    return new NextResponse(new Uint8Array(videoBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Content-Length": String(videoBuffer.length),
        "Cache-Control": "no-store",
        "X-Preset": safe.preset,
        "X-Slide-Count": String(episode.slides.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[export-video] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type SafeRequest = {
  episodeName: string;
  themeName: string;
  preset: PresentationPreset;
  format: ExportFormat;
  target: ExportTarget;
};

function sanitizeRequest(body: ExportRequest): SafeRequest {
  const episodeName = ((body.episodeId || "").endsWith(".json")
    ? body.episodeId
    : `${body.episodeId}.json`) || "test.json";
  const themeName = body.themeName || "default.theme.json";
  const preset: PresentationPreset = body.preset || "cinematic";
  const format: ExportFormat = body.format || "mp4";

  const w = body.target?.canvas?.width || 1080;
  const h = body.target?.canvas?.height || 1350;

  if (format !== "mp4" && format !== "webm") {
    throw new Error("format must be mp4 or webm");
  }

  return {
    episodeName,
    themeName,
    preset,
    format,
    target: {
      canvas: { width: w, height: h },
      fit: body.target?.fit || "contain",
      anchor: body.target?.anchor || "center",
    },
  };
}

import { NextRequest, NextResponse } from "next/server";
import { buildPreviewSlideHtml } from "@/lib/adapters";
import type { Episode, Theme } from "@sitehie/core/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/preview — render a single slide's HTML for live preview in the editor. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      content?: Episode;
      theme?: Theme;
      slideIndex?: number;
    };
    const content = body.content;
    const theme = body.theme;
    const slideIndex = Number(body.slideIndex ?? 0);

    if (!content?.slides?.length || !theme) {
      return NextResponse.json({ error: "content and theme required" }, { status: 400 });
    }

    const html = await buildPreviewSlideHtml(content, theme, slideIndex);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

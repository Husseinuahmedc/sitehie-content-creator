import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/assets?theme=default — list assets available for a theme (theme-specific + shared). */
export async function GET(req: NextRequest) {
  try {
    const themeName = req.nextUrl.searchParams.get("theme") || "";
    const assets = await storage.listAssetsForTheme(themeName);
    return NextResponse.json({ assets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

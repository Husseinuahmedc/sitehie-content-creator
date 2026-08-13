import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { storage, validateTheme, CAROUSEL_ROOT } from "@/lib/adapters";
import type { Theme } from "@sitehie/core/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/themes           — list all themes
 *  GET /api/themes?name=...  — load one theme by file name */
export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name");
    if (name) {
      const theme = (await storage.loadTheme(name)) as Theme;
      return NextResponse.json({ theme, path: resolveThemePath(name) });
    }
    const themes = await storage.listThemes();
    return NextResponse.json({ themes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** POST /api/themes — validate and optionally save a theme. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      fileName?: string;
      theme?: Theme;
      validateOnly?: boolean;
    };
    if (!body.theme) {
      return NextResponse.json({ error: "theme required" }, { status: 400 });
    }
    const validation = await validateTheme(body.theme);
    if (body.validateOnly) {
      return NextResponse.json(validation);
    }
    if (!validation.ok) {
      return NextResponse.json({ error: "Invalid theme", ...validation }, { status: 400 });
    }
    if (!body.fileName) {
      return NextResponse.json({ error: "fileName required" }, { status: 400 });
    }
    const result = await storage.saveTheme(body.fileName, body.theme, { mode: "explicit" });
    return NextResponse.json({ ok: true, path: result.filePath, validation });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

function resolveThemePath(name: string): string {
  const base = path.basename(name);
  const safe = base.endsWith(".theme.json")
    ? base
    : `${path.basename(base, ".json")}.theme.json`;
  return path.join(CAROUSEL_ROOT, "themes", safe);
}

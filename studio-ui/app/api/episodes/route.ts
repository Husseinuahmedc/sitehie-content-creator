import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { storage, CAROUSEL_ROOT } from "@/lib/adapters";
import type { Episode } from "@sitehie/core/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/episodes            — list all episodes
 *  GET /api/episodes?name=...   — load one episode by file name */
export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name");
    if (name) {
      try {
        const content = (await storage.loadEpisode(name)) as Episode;
        const safe = name.endsWith(".json") ? path.basename(name) : `${path.basename(name)}.json`;
        return NextResponse.json({ content, path: path.join(CAROUSEL_ROOT, "content", safe) });
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code?: string }).code === "ENOENT"
        ) {
          return NextResponse.json({ error: `Episode "${name}" not found` }, { status: 404 });
        }
        throw err;
      }
    }
    const episodes = await storage.listEpisodes();
    return NextResponse.json({ episodes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** POST /api/episodes — explicit save (clears any matching autosave). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, content } = body as { fileName?: string; content?: Episode };
    if (!fileName || !content) {
      return NextResponse.json({ error: "fileName and content required" }, { status: 400 });
    }
    const result = await storage.saveEpisode(fileName, content, { mode: "explicit" });
    return NextResponse.json({ ok: true, path: result.filePath });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** DELETE /api/episodes?name=jwt.json — delete an episode (clears its autosave too). */
export async function DELETE(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name");
    if (!name) {
      return NextResponse.json({ error: "name param required" }, { status: 400 });
    }
    await storage.deleteEpisode(name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

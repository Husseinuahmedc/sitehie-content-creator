import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/adapters";
import type { Episode, Theme } from "@sitehie/core/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/history?episode=...                       — list snapshots
 *  GET /api/history?episode=...&snapshot=...          — load one snapshot */
export async function GET(req: NextRequest) {
  try {
    const episode = req.nextUrl.searchParams.get("episode");
    const snapshot = req.nextUrl.searchParams.get("snapshot");
    if (!episode) {
      return NextResponse.json({ error: "episode param required" }, { status: 400 });
    }
    if (snapshot) {
      const data = await storage.loadHistorySnapshot(episode, snapshot);
      if (!data) {
        return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
      }
      return NextResponse.json(data);
    }
    const snapshots = await storage.listHistorySnapshots(episode);
    return NextResponse.json({ snapshots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** POST /api/history — save a new snapshot. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      episodeFile?: string;
      content?: Episode;
      theme?: Theme | null;
    };
    if (!body.episodeFile || !body.content) {
      return NextResponse.json({ error: "episodeFile and content required" }, { status: 400 });
    }
    const snapshot = await storage.saveHistorySnapshot(
      body.episodeFile,
      body.content,
      body.theme ?? null
    );
    return NextResponse.json({ ok: true, path: snapshot._episodeFile, snapshot });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** DELETE /api/history?episode=...&snapshot=... — delete one snapshot. */
export async function DELETE(req: NextRequest) {
  try {
    const episode = req.nextUrl.searchParams.get("episode");
    const snapshot = req.nextUrl.searchParams.get("snapshot");
    if (!episode || !snapshot) {
      return NextResponse.json({ error: "episode and snapshot params required" }, { status: 400 });
    }
    await storage.deleteHistorySnapshot(episode, snapshot);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

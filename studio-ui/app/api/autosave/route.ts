import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/adapters";
import type { Episode, Theme } from "@sitehie/core/domain";
import type { StoredEntityType as PortEntityType } from "@sitehie/core/ports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidType(t: string | null | undefined): t is "episode" | "theme" {
  return t === "episode" || t === "theme";
}

function toPortType(t: "episode" | "theme"): PortEntityType {
  return t as PortEntityType;
}

/** GET /api/autosave?type=episode|theme&name=... — read autosave info. */
export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type");
    const name = req.nextUrl.searchParams.get("name");
    if (!isValidType(type) || !name) {
      return NextResponse.json(
        { error: "type (episode|theme) and name required" },
        { status: 400 }
      );
    }
    const info = await storage.readAutosave(toPortType(type), name);
    return NextResponse.json({ info });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** POST /api/autosave — write an autosave (type: episode|theme, fileName, data). */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      type?: string;
      fileName?: string;
      data?: unknown;
    };
    if (!isValidType(body.type) || !body.fileName || body.data === undefined) {
      return NextResponse.json(
        { error: "type (episode|theme), fileName, and data required" },
        { status: 400 }
      );
    }
    const fileName: string = body.fileName;
    const data = body.data;
    let result: { filePath: string };
    if (body.type === "episode") {
      result = await storage.saveEpisode(fileName, data as Episode, { mode: "autosave" });
    } else {
      result = await storage.saveTheme(fileName, data as Theme, { mode: "autosave" });
    }
    return NextResponse.json({ ok: true, path: result.filePath });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** DELETE /api/autosave?type=episode|theme&name=... — clear autosave. */
export async function DELETE(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type");
    const name = req.nextUrl.searchParams.get("name");
    if (!isValidType(type) || !name) {
      return NextResponse.json(
        { error: "type (episode|theme) and name required" },
        { status: 400 }
      );
    }
    await storage.clearAutosave(toPortType(type), name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

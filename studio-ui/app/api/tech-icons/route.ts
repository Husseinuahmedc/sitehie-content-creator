import { NextResponse } from "next/server";
import { loadTechIcons, listCodeLanguages } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/tech-icons → { icons, languages } for the Studio pickers. */
export async function GET() {
  try {
    const [icons, languages] = await Promise.all([loadTechIcons(), Promise.resolve(listCodeLanguages())]);
    return NextResponse.json({ icons, languages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

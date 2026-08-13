import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { scanFonts } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const file = req.nextUrl.searchParams.get("file");
    if (file) {
      // Serve a font file for @font-face preview in the browser.
      const fonts = await scanFonts();
      const match = fonts.find(
        (f) => f.id === file || f.absolutePath === file || f.fileName === file
      );
      if (!match) {
        return NextResponse.json({ error: "Font not found" }, { status: 404 });
      }
      const buf = await fs.readFile(match.absolutePath);
      const ext = path.extname(match.absolutePath).toLowerCase();
      const mime =
        ext === ".woff2"
          ? "font/woff2"
          : ext === ".woff"
            ? "font/woff"
            : ext === ".ttf"
              ? "font/ttf"
              : ext === ".otf"
                ? "font/otf"
                : "application/octet-stream";
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    const fonts = await scanFonts();
    const byFamily = new Map<string, typeof fonts>();
    for (const f of fonts) {
      const list = byFamily.get(f.family) || [];
      list.push(f);
      byFamily.set(f.family, list);
    }
    return NextResponse.json({
      fonts,
      families: [...byFamily.entries()].map(([family, variants]) => ({
        family,
        variants,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

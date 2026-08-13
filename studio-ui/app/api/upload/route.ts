import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { CAROUSEL_ROOT, PUBLIC_UPLOADS_DIR, resolveUploadTarget } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/upload — upload an image asset
 *  FormData: file (required), theme (optional — uploads to theme-specific dir), subfolder (optional — "icons"|"mockups") */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];
    if (!allowed.includes(file.type) && !/\.(png|jpe?g|webp|svg|gif)$/i.test(file.name)) {
      return NextResponse.json({ error: "unsupported image type" }, { status: 400 });
    }

    const themeName = form.get("theme")?.toString() || "";
    const subfolder = form.get("subfolder")?.toString() || "icons";
    const { targetDir, relativePrefix } = resolveUploadTarget(themeName, subfolder);

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name) || ".png";
    const base = path
      .basename(file.name, ext)
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 48);
    const name = `${base || "icon"}-${Date.now()}${ext.toLowerCase()}`;

    await fs.mkdir(targetDir, { recursive: true });
    const abs = path.join(targetDir, name);
    await fs.writeFile(abs, buf);

    // Also copy into studio public for browser <img> preview.
    await fs.mkdir(PUBLIC_UPLOADS_DIR, { recursive: true });
    await fs.writeFile(path.join(PUBLIC_UPLOADS_DIR, name), buf);

    const relativePath = `${relativePrefix}/${name}`;

    return NextResponse.json({
      ok: true,
      path: relativePath,
      absolutePath: abs,
      url: `/uploads/${name}`,
      name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

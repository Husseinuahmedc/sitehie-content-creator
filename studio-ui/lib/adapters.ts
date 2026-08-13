/**
 * Dependency wiring for studio-ui API routes.
 *
 * This is the one file in the UI that is allowed to reference concrete adapter
 * packages. Every route imports adapters (and core types/functions) from here
 * instead of reaching into adapter internals directly.
 *
 * What lives here:
 *  - Construction of the concrete StorageAdapter, RenderAdapter, AiAdapter
 *    instances (routes get the port interface, not the concrete class).
 *  - Small helpers that wrap one or two adapter calls plus minimal I/O so
 *    routes can stay "parse → call helper → return JSON" without duplicating
 *    the same plumbing. Helpers that need their own substantial logic (e.g.
 *    font directory walking) live here rather than in routes.
 *
 * What does NOT live here:
 *  - UI concerns, panel state, DTO shapes. Those are panel/route concerns.
 *  - Anything that would belong in `core/` (pure logic with no I/O).
 */
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { FileStorageAdapter } from "@sitehie/storage-file";
import { PlaywrightRenderAdapter, AssetLoader, SUPPORTED_LANGUAGES } from "@sitehie/render-engine";
import { OllamaAdapter, OpenCodeAdapter } from "@sitehie/ai-tools";
import { resolveSlideStyle } from "@sitehie/core/resolver";
import { validateTheme as coreValidateTheme } from "@sitehie/core/validation";
import type {
  StorageAdapter,
  RenderAdapter,
  AiAdapter,
} from "@sitehie/core/ports";
import type { Episode, Theme, Slide } from "@sitehie/core/domain";

// ── Runtime config ────────────────────────────────────────────────────────

// Ensure Playwright can find its browser in CI/dev environments where the
// system browsers are not installed. Matches the render-engine tests.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

/** Absolute path to the carousel-tool package (templates, assets, themes, output). */
export const CAROUSEL_ROOT = path.resolve(process.cwd(), "..", "carousel-tool");

/** Directory under studio-ui where uploaded assets are mirrored for browser preview. */
export const PUBLIC_UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads");

// ── Adapter instances ─────────────────────────────────────────────────────

/** Filesystem-backed storage adapter. All file CRUD goes through this. */
export const storage: StorageAdapter = new FileStorageAdapter({ rootDir: CAROUSEL_ROOT });

/** Playwright-backed render adapter. Consumes resolved styles only. */
export const renderAdapter: RenderAdapter = new PlaywrightRenderAdapter({
  carouselRoot: CAROUSEL_ROOT,
});

/** Return the AI adapter requested by the caller (ollama is the default). */
export function getAiAdapter(provider: "ollama" | "opencode" = "ollama"): AiAdapter {
  if (provider === "opencode") {
    return new OpenCodeAdapter({
      baseUrl: process.env.OPENCODE_SERVER_URL,
    });
  }
  return new OllamaAdapter({
    baseUrl: process.env.OLLAMA_HOST,
  });
}

// ── Tech-icon + language helpers (read from carousel-tool templates) ──────

/** UI-facing tech-icon metadata returned by the theme's icon library. */
export type TechIconEntry = { label: string; svg: string };

/** Tech-icon library used by the slide templates. */
export async function loadTechIcons(): Promise<Record<string, TechIconEntry>> {
  const loader = new AssetLoader(CAROUSEL_ROOT);
  const icons = await loader.loadTechIcons();
  return icons as Record<string, TechIconEntry>;
}

/** Languages offered by the code-slide highlighter / editor pickers. */
export function listCodeLanguages() {
  return SUPPORTED_LANGUAGES;
}

// ── Theme validation (schema + font magic bytes + required colors) ────────

let _themeSchemaCache: object | null = null;
async function loadThemeSchema(): Promise<object> {
  if (_themeSchemaCache) return _themeSchemaCache;
  const schemaPath = path.join(CAROUSEL_ROOT, "themes", "theme.schema.json");
  const raw = await fs.readFile(schemaPath, "utf8");
  _themeSchemaCache = JSON.parse(raw) as object;
  return _themeSchemaCache;
}

const FONT_MAGIC = ["wOF2", "wOFF", "OTTO", "true", "ttcf"];

async function sniffFontFormat(absPath: string): Promise<string | null> {
  try {
    const fd = await fs.open(absPath, "r");
    try {
      const buf = Buffer.alloc(4);
      await fd.read(buf, 0, 4, 0);
      const ascii = buf.toString("latin1");
      if (FONT_MAGIC.includes(ascii)) return ascii;
      if (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00) return "ttf";
      return null;
    } finally {
      await fd.close();
    }
  } catch {
    return null;
  }
}

function resolveFontPath(fontPath: string): string {
  const loader = new AssetLoader(CAROUSEL_ROOT);
  return loader.resolveFontPath(fontPath);
}

/**
 * Validate a theme object. Wraps core's schema-only validator with the
 * font-existence / magic-byte and required-color checks that engine.js
 * previously owned. Returns the same `{ ok, errors }` shape the API used
 * to return so the route's response contract is unchanged.
 */
export async function validateTheme(theme: Theme): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];

  const schema = await loadThemeSchema();
  const schemaResult = coreValidateTheme(theme, schema);
  if (!schemaResult.ok) {
    for (const err of schemaResult.errors) errors.push(err);
  }

  for (const [key, font] of Object.entries(theme.fonts || {})) {
    if (!font.path) {
      errors.push(`  • fonts.${key}: missing path`);
      continue;
    }
    const abs = resolveFontPath(font.path);
    if (!existsSync(abs)) {
      errors.push(`  • fonts.${key}: file not found at ${font.path}`);
      continue;
    }
    const sniff = await sniffFontFormat(abs);
    if (!sniff) {
      errors.push(
        `  • fonts.${key}: ${font.path} is not a valid font file (bad magic bytes — is it an HTML error page?)`
      );
    }
  }

  for (const [typeKey, t] of Object.entries(theme.typography || {})) {
    if (t.fontFamily && !theme.fonts?.[t.fontFamily]) {
      errors.push(`  • typography.${typeKey}.fontFamily "${t.fontFamily}" not defined in fonts`);
    }
  }

  const requiredColors = [
    "background",
    "primary",
    "secondary",
    "textPrimary",
    "textSecondary",
    "codeBackground",
    "highlightMarker",
  ];
  for (const c of requiredColors) {
    if (!theme.colors?.[c]) errors.push(`  • colors.${c}: required`);
  }

  return { ok: errors.length === 0, errors };
}

// ── Font directory scanner (used by the font picker UI) ───────────────────

const FONT_EXTS = new Set([".woff2", ".woff", ".ttf", ".otf"]);

export type ScannedFont = {
  id: string;
  fileName: string;
  family: string;
  weight: number;
  format: string;
  path: string;
  absolutePath: string;
  ext: string;
};

function guessFormat(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".woff2") return "woff2";
  if (ext === ".woff") return "woff";
  if (ext === ".ttf") return "truetype";
  if (ext === ".otf") return "opentype";
  return "woff2";
}

function guessFamilyName(fileName: string): string {
  let base = fileName.replace(/\.(woff2?|ttf|otf)$/i, "");
  base = base
    .replace(/[-_]?(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black|Variable|VF|Salt).*$/i, "")
    .replace(/[-_]+$/g, "")
    .replace(/[-_]/g, " ")
    .trim();
  base = base
    .replace(/thmanyahsans/i, "Thmanyah Sans")
    .replace(/thmanyahserifdisplay/i, "Thmanyah Serif Display")
    .replace(/thmanyahseriftext/i, "Thmanyah Serif Text")
    .replace(/jetbrainsmono/i, "JetBrains Mono")
    .replace(/spacegrotesk/i, "Space Grotesk")
    .replace(/al[- ]?awwal/i, "Al Awwal")
    .replace(/qahwa arabic/i, "Qahwa Arabic")
    .replace(/sahazm/i, "SA Hazm")
    .replace(/foundingday/i, "Founding Day")
    .replace(/jarood/i, "Jarood");
  return base || fileName;
}

function guessWeight(fileName: string): number {
  const n = fileName.toLowerCase();
  if (/black|heavy/.test(n)) return 900;
  if (/extrabold|extra-bold/.test(n)) return 800;
  if (/bold/.test(n)) return 700;
  if (/semibold|semi-bold|demibold/.test(n)) return 600;
  if (/medium/.test(n)) return 500;
  if (/regular|normal/.test(n)) return 400;
  if (/light/.test(n)) return 300;
  if (/thin|hairline/.test(n)) return 100;
  return 400;
}

/**
 * Walk project + carousel font directories for available font files.
 * Output shape is identical to engine.js's old scanFonts so the route
 * can return it without reshaping.
 */
export async function scanFonts(): Promise<ScannedFont[]> {
  const projectRoot = path.resolve(CAROUSEL_ROOT, "..");
  const roots = [
    path.join(CAROUSEL_ROOT, "templates", "shared", "fonts"),
    projectRoot,
    path.join(projectRoot, "assets", "fonts", "thmanyahsans"),
    path.join(projectRoot, "assets", "fonts", "thmanyahserifdisplay"),
    path.join(projectRoot, "assets", "fonts", "thmanyahseriftext"),
  ];

  const found = new Map<string, ScannedFont>();

  async function walk(dir: string, depth = 0) {
    if (depth > 4 || !existsSync(dir)) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (["node_modules", "output", "studio-ui", ".git"].includes(ent.name)) continue;
        await walk(full, depth + 1);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!FONT_EXTS.has(ext)) continue;
        const id = full;
        if (found.has(id)) continue;
        const family = guessFamilyName(ent.name);
        const weight = guessWeight(ent.name);
        const format = guessFormat(full);
        let relPath = full;
        const sharedFonts = path.join(CAROUSEL_ROOT, "templates", "shared", "fonts");
        if (full.startsWith(sharedFonts)) {
          relPath = path.join("shared/fonts", path.relative(sharedFonts, full)).replace(/\\/g, "/");
        } else if (full.startsWith(CAROUSEL_ROOT)) {
          relPath = path.relative(path.join(CAROUSEL_ROOT, "templates"), full).replace(/\\/g, "/");
        }
        found.set(id, {
          id: Buffer.from(full).toString("base64url"),
          fileName: ent.name,
          family,
          weight,
          format,
          path: relPath,
          absolutePath: full,
          ext,
        });
      }
    }
  }

  for (const r of roots) await walk(r);

  const list = [...found.values()];
  list.sort((a, b) => {
    const score = (f: ScannedFont) =>
      (f.ext === ".woff2" ? 0 : 1) + (String(f.path).includes("shared/fonts") ? 0 : 10);
    const s = score(a) - score(b);
    if (s !== 0) return s;
    return a.family.localeCompare(b.family) || a.fileName.localeCompare(b.fileName);
  });

  return list;
}

// ── Preview HTML (used by /api/preview and /api/export-video) ─────────────

/** Build the preview HTML for a single slide. */
export async function buildPreviewSlideHtml(
  content: Episode,
  theme: Theme,
  slideIndex: number
): Promise<string> {
  const slide = content.slides[slideIndex];
  if (!slide) {
    const max = content.slides.length - 1;
    throw new Error(`slideIndex ${slideIndex} out of range (0..${max})`);
  }
  const style = resolveSlideStyle(theme, slide);
  const total = content.slides.length;
  const readingTime = content.readingTime ?? Math.max(1, Math.ceil(total * 0.4));
  const meta = {
    slideIndex: slideIndex + 1,
    totalSlides: total,
    progressPct: Math.round(((slideIndex + 1) / total) * 100),
    series: content.series || "",
    episode: content.episode || "episode",
    readingTime,
    handle: style.brand?.handle || "@sitehie",
  };
  // buildSlideHtml is a public method on PlaywrightRenderAdapter but not part
  // of the RenderAdapter port. The concrete class is what we constructed, so
  // the cast is safe at this wiring boundary.
  const concrete = renderAdapter as unknown as {
    buildSlideHtml: (slide: Slide, style: import("@sitehie/core/resolver").ResolvedStyle, meta: unknown) => Promise<string>;
  };
  return concrete.buildSlideHtml(slide, style, meta);
}

// ── Asset upload helpers (used by /api/upload) ────────────────────────────

export type UploadTarget = {
  /** Absolute directory to write the file into. */
  targetDir: string;
  /** Path prefix stored in episode/theme JSON, e.g. `assets/shared/icons`. */
  relativePrefix: string;
};

export function resolveUploadTarget(themeName: string, subfolder: string): UploadTarget {
  const validSubfolders = ["icons", "mockups"];
  const safeSubfolder = validSubfolders.includes(subfolder) ? subfolder : "icons";
  if (themeName) {
    return {
      targetDir: path.join(CAROUSEL_ROOT, "assets", "themes", themeName, safeSubfolder),
      relativePrefix: `assets/themes/${themeName}/${safeSubfolder}`,
    };
  }
  return {
    targetDir: path.join(CAROUSEL_ROOT, "assets", "shared", safeSubfolder),
    relativePrefix: `assets/shared/${safeSubfolder}`,
  };
}

// ── Re-exports ────────────────────────────────────────────────────────────

export { resolveSlideStyle };

// Re-export helpers from render-engine so the wiring module is the single
// import path for everything render-related.
export { loadThemeFromCarousel } from "@sitehie/render-engine";

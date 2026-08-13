import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Slide, SlideImage, SlideType } from "@sitehie/core/domain";
import type { FontFace, Theme } from "@sitehie/core/domain";

const TEMPLATE_MAP: Record<SlideType, string> = {
  quote: "quote-slide.html",
  code: "code-slide.html",
  cover: "cover-slide.html",
  outro: "outro-slide.html",
  comparison: "comparison-slide.html",
  stat: "stat-slide.html",
  canvas: "canvas-slide.html",
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

export type RenderConfig = {
  width: number;
  height: number;
  scale: number;
  readabilityFloor: number;
  fontFitStep: number;
  safeZones: { top: number; bottom: number; x: number };
};

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  width: 1080,
  height: 1350,
  scale: 3,
  readabilityFloor: 28,
  fontFitStep: 1,
  safeZones: { top: 120, bottom: 100, x: 80 },
};

export type ResolvedAssetSlide = Slide & {
  codeHtml?: string;
};

/**
 * Narrow, explicit dependency for loading templates, fonts, CSS, runtime JS,
 * tech icons, and slide image assets. No rendering logic lives here — it just
 * reads and inlines the static files the renderer needs.
 */
export class AssetLoader {
  readonly carouselRoot: string;
  readonly templatesDir: string;
  private fontCssCache: string | null = null;
  private techIconsCache: Record<string, unknown> | null = null;

  constructor(carouselRoot?: string) {
    this.carouselRoot =
      carouselRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "carousel-tool");
    this.templatesDir = path.join(this.carouselRoot, "templates");
  }

  get sharedDir(): string {
    return path.join(this.templatesDir, "shared");
  }

  get assetsDir(): string {
    return path.join(this.carouselRoot, "assets");
  }

  /** Load a slide template by its domain type. */
  async loadTemplate(type: SlideType): Promise<string> {
    const file = TEMPLATE_MAP[type];
    if (!file) throw new Error(`Unknown slide type: ${type}`);
    return fs.readFile(path.join(this.templatesDir, file), "utf8");
  }

  /** Load the shared base stylesheet. */
  async loadBaseCss(): Promise<string> {
    return fs.readFile(path.join(this.sharedDir, "base.css"), "utf8");
  }

  /** Load the in-page runtime script. */
  async loadRuntime(): Promise<string> {
    return fs.readFile(path.join(this.sharedDir, "slide-runtime.js"), "utf8");
  }

  /** Load the tech-icon library (name → { label, svg }). */
  async loadTechIcons(): Promise<Record<string, unknown>> {
    if (this.techIconsCache) return this.techIconsCache;
    try {
      const raw = await fs.readFile(path.join(this.sharedDir, "tech-icons.json"), "utf8");
      this.techIconsCache = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.techIconsCache = {};
    }
    return this.techIconsCache;
  }

  /**
   * Build `@font-face` CSS for the theme's fonts, inlining local files as
   * base64 data URIs so rendered slides are self-contained.
   */
  async buildFontFaceCss(fonts: Record<string, FontFace> = {}): Promise<string> {
    if (this.fontCssCache) return this.fontCssCache;

    const blocks: string[] = [];
    for (const [, font] of Object.entries(fonts)) {
      if (!font?.family || !font?.path) continue;
      const abs = this.resolveFontPath(font.path);
      const format = font.format || guessFormat(abs);
      const weight = font.weight != null ? font.weight : "normal";
      const style = font.style || "normal";
      let url: string;
      if (existsSync(abs)) {
        const buf = await fs.readFile(abs);
        const mime =
          format === "woff2"
            ? "font/woff2"
            : format === "woff"
              ? "font/woff"
              : format === "truetype"
                ? "font/ttf"
                : format === "opentype"
                  ? "font/otf"
                  : "application/octet-stream";
        url = `data:${mime};base64,${buf.toString("base64")}`;
      } else {
        url = pathToFileURL(abs).href;
      }
      blocks.push(`@font-face {
  font-family: ${JSON.stringify(font.family)};
  src: url(${JSON.stringify(url)}) format(${JSON.stringify(format)});
  font-weight: ${weight};
  font-style: ${style};
  font-display: block;
}`);
    }
    this.fontCssCache = blocks.join("\n");
    return this.fontCssCache;
  }

  /** Resolve a font path against the carousel/project font search paths. */
  resolveFontPath(fontPath: string): string {
    if (path.isAbsolute(fontPath) && existsSync(fontPath)) return fontPath;
    const candidates = [
      path.resolve(this.templatesDir, fontPath),
      path.resolve(this.carouselRoot, fontPath),
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", fontPath),
      path.resolve(fontPath),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return candidates[0];
  }

  /**
   * Resolve an asset path to an absolute file path.
   * Checks theme-specific dir, shared dir, and legacy flat dir (in that order).
   */
  resolveAssetPath(assetPath: string, themeName?: string): string {
    if (!assetPath) return assetPath;
    if (assetPath.startsWith("data:")) return assetPath;
    if (path.isAbsolute(assetPath) && existsSync(assetPath)) return assetPath;

    // Normalise: strip leading "assets/" if present so we can rebuild
    const stripped = assetPath.replace(/^assets\//, "");

    const candidates: string[] = [];

    // 1. Theme-specific: assets/themes/{theme}/{stripped}
    if (themeName) {
      candidates.push(path.resolve(this.assetsDir, "themes", themeName, stripped));
    }

    // 2. Shared: assets/shared/{stripped}
    candidates.push(path.resolve(this.assetsDir, "shared", stripped));

    // 3. Legacy flat: assets/{stripped}
    candidates.push(path.resolve(this.assetsDir, stripped));

    // 4. Legacy flat with full original path
    candidates.push(path.resolve(this.carouselRoot, assetPath));

    // 5. Project root candidates
    const projectRoot = path.resolve(this.carouselRoot, "..");
    candidates.push(path.resolve(projectRoot, assetPath));
    candidates.push(path.resolve(projectRoot, "studio-ui", "public", assetPath.replace(/^\/+/, "")));
    candidates.push(path.resolve(assetPath));
    candidates.push(path.resolve(process.cwd(), assetPath));

    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return candidates[0];
  }

  /**
   * Inline any image/icon assets referenced by a slide as base64 data URIs.
   * Returns a shallow clone so the original slide object is untouched.
   */
  async inlineSlideAssets(slide: Slide, themeName?: string): Promise<ResolvedAssetSlide> {
    const clone: ResolvedAssetSlide = { ...slide };
    const record = clone as unknown as Record<string, unknown>;

    const iconAsset = record.iconAsset;
    if (iconAsset && typeof iconAsset === "string" && !iconAsset.startsWith("data:")) {
      record.iconAsset = await this.inlineAsset(iconAsset, themeName);
    }

    const imageAsset = record.imageAsset;
    if (imageAsset && typeof imageAsset === "string" && !imageAsset.startsWith("data:")) {
      record.imageAsset = await this.inlineAsset(imageAsset, themeName);
    }

    if (clone.images && Array.isArray(clone.images)) {
      clone.images = await Promise.all(
        clone.images.map(async (img) => {
          const resolved: SlideImage = { ...img };
          if (img.asset && !String(img.asset).startsWith("data:")) {
            resolved.asset = await this.inlineAsset(img.asset, themeName);
          }
          return resolved;
        })
      );
    }

    return clone;
  }

  private async inlineAsset(assetPath: string, themeName?: string): Promise<string> {
    const abs = this.resolveAssetPath(assetPath, themeName);
    if (!existsSync(abs)) return assetPath;
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME[ext] || "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
}

function guessFormat(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".woff2") return "woff2";
  if (ext === ".woff") return "woff";
  if (ext === ".ttf") return "truetype";
  if (ext === ".otf") return "opentype";
  return "woff2";
}

/**
 * Merge user render overrides onto the default config. Explicit `undefined`
 * entries are ignored so a sparse override object (e.g. `{ scale: 2 }`) keeps
 * the default config authoritative for every field the caller didn't set.
 */
export function mergeRenderConfig(overrides?: Partial<RenderConfig>): RenderConfig {
  const cleanOverrides: Partial<RenderConfig> | undefined = overrides
    ? Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined))
    : undefined;
  return {
    ...DEFAULT_RENDER_CONFIG,
    ...cleanOverrides,
    safeZones: { ...DEFAULT_RENDER_CONFIG.safeZones, ...cleanOverrides?.safeZones },
  };
}

/** Load a theme object from the carousel themes directory by name/path. */
export async function loadThemeFromCarousel(loader: AssetLoader, fileOrName: string): Promise<Theme> {
  const dir = path.join(loader.carouselRoot, "themes");
  let filePath = fileOrName;
  if (!path.isAbsolute(fileOrName)) {
    if (fileOrName.endsWith(".json")) {
      filePath = path.join(dir, path.basename(fileOrName));
    } else {
      const candidate = path.join(dir, `${fileOrName}.theme.json`);
      filePath = existsSync(candidate) ? candidate : path.join(dir, fileOrName);
    }
  }
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as Theme;
}

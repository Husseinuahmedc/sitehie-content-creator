/**
 * Programmatic API for the sitehie carousel renderer.
 * Used by render.js (CLI) and studio-ui (Next.js).
 */
import { chromium } from "playwright";
import Ajv from "ajv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { highlightCodeToHtml, SUPPORTED_LANGUAGES } from "./highlight.js";
import { escapeHtml, replaceOnce } from "./lib/html-utils.js";

const __filename = fileURLToPath(import.meta.url);
export const CAROUSEL_ROOT = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(CAROUSEL_ROOT, "..");

export const TEMPLATE_MAP = {
  quote: "quote-slide.html",
  code: "code-slide.html",
  cover: "cover-slide.html",
  outro: "outro-slide.html",
  comparison: "comparison-slide.html",
  stat: "stat-slide.html",
  canvas: "canvas-slide.html",
};

const MIME = {
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

const FONT_EXTS = new Set([".woff2", ".woff", ".ttf", ".otf"]);

export async function loadConfig() {
  return readJson(path.join(CAROUSEL_ROOT, "config.json"));
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function resolveFromCarousel(...parts) {
  return path.resolve(CAROUSEL_ROOT, ...parts);
}

/** Build fully inlined HTML for one slide (same as Playwright uses). */
export async function buildSlideHtml({ type, slide, theme, config, meta, fontCssCache }) {
  const templateFile = TEMPLATE_MAP[type];
  if (!templateFile) throw new Error(`Unknown slide type: ${type}`);

  const templatePath = path.join(CAROUSEL_ROOT, config.templatesDir || "templates", templateFile);
  let html = await fs.readFile(templatePath, "utf8");

  const fontCss = fontCssCache || (await buildFontFaceCss(theme.fonts));
  const varsCss = buildCssVariables(theme, config);
  const resolvedSlide = await resolveSlideAssets(slide, theme.name);

  // Build-time syntax highlighting (Prism) — slides stay fully self-contained.
  if (type === "code" && resolvedSlide.code) {
    resolvedSlide.codeHtml = highlightCodeToHtml(resolvedSlide.code, resolvedSlide.language);
  }

  const payload = {
    slide: resolvedSlide,
    meta,
    theme: {
      layout: theme.layout,
      typography: theme.typography,
      brand: theme.brand || {},
      colors: theme.colors,
    },
  };

  html = replaceOnce(html, '<style id="theme-fonts"></style>', `<style id="theme-fonts">${fontCss}</style>`);
  html = replaceOnce(html, '<style id="theme-vars"></style>', `<style id="theme-vars">${varsCss}</style>`);
  html = replaceOnce(
    html,
    '<script type="application/json" id="slide-data"></script>',
    `<script type="application/json" id="slide-data">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`
  );

  // Theme family hook for data-theme CSS refinements (dark | light | cyberpunk)
  const family = theme.family || "dark";
  html = replaceOnce(
    html,
    '<div class="slide" id="slide">',
    `<div class="slide" id="slide" data-theme="${family}">`
  );

  const baseCssPath = path.join(CAROUSEL_ROOT, config.templatesDir || "templates", "shared", "base.css");
  const runtimePath = path.join(CAROUSEL_ROOT, config.templatesDir || "templates", "shared", "slide-runtime.js");
  const baseCss = await fs.readFile(baseCssPath, "utf8");
  const runtime = await fs.readFile(runtimePath, "utf8");
  const techIcons = await loadTechIcons();

  html = replaceOnce(html, '<link rel="stylesheet" href="shared/base.css" />', `<style id="base-css">${baseCss}</style>`);
  html = replaceOnce(
    html,
    '<script id="tech-icons-data"></script>',
    `<script id="tech-icons-data">window.TECH_ICONS=${JSON.stringify(techIcons).replace(/</g, "\\u003c")};</script>`
  );
  html = html.replace('<script src="shared/slide-runtime.js"></script>', () => {
    return `<script>${runtime.replace(/<\/script/gi, "<\\/script")}</script>`;
  });

  return html;
}

/** Tech icon library (name → { label, svg }) from templates/shared/tech-icons.json. */
let techIconsCache = null;
export async function listTechIcons() {
  return loadTechIcons();
}

async function loadTechIcons() {
  if (techIconsCache) return techIconsCache;
  try {
    techIconsCache = await readJson(
      path.join(CAROUSEL_ROOT, "templates", "shared", "tech-icons.json")
    );
  } catch {
    techIconsCache = {};
  }
  return techIconsCache;
}

/** Languages supported by the build-time highlighter (for Studio UI pickers). */
export function listCodeLanguages() {
  return SUPPORTED_LANGUAGES;
}

/** Prepare all slide HTML documents for an episode. */
export async function prepareEpisode(content, theme, config) {
  const slides = content.slides || [];
  const total = slides.length;
  const episodeName = content.episode || "episode";
  const readingTime = content.readingTime || Math.max(1, Math.ceil(total * 0.4));
  const fontCssCache = await buildFontFaceCss(theme.fonts);
  const prepared = [];

  for (let i = 0; i < total; i++) {
    const slide = slides[i];
    const type = slide.type;
    if (!TEMPLATE_MAP[type]) {
      throw new Error(`Unknown slide type "${type}" at index ${i}`);
    }
    const html = await buildSlideHtml({
      type,
      slide,
      theme,
      config,
      meta: {
        slideIndex: i + 1,
        totalSlides: total,
        progressPct: Math.round(((i + 1) / total) * 100),
        series: content.series || "",
        episode: episodeName,
        readingTime,
        handle: theme.brand?.handle || "@sitehie",
      },
      fontCssCache,
    });
    prepared.push({ index: i + 1, type, html, slide });
  }
  return prepared;
}

/**
 * Render episode to PNG files.
 * @param {object} opts
 * @param {object} opts.content
 * @param {object} opts.theme
 * @param {string} [opts.outputDir]
 * @param {object} [opts.config]
 * @param {(info:{index:number,total:number,name:string,path:string})=>void} [opts.onProgress]
 */
export async function renderEpisode({ content, theme, outputDir, config, onProgress }) {
  const cfg = config || (await loadConfig());
  const episodeName = content.episode || "episode";
  const outDir = outputDir || path.join(CAROUSEL_ROOT, cfg.outputDir || "output", episodeName);
  await fs.mkdir(outDir, { recursive: true });

  const validation = await validateTheme(theme);
  if (!validation.ok) {
    const err = new Error(`Theme validation failed:\n${validation.errors.join("\n")}`);
    err.validation = validation;
    throw err;
  }

  const prepared = await prepareEpisode(content, theme, cfg);
  const warnings = [];
  const generated = [];

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: cfg.scale,
    });
    const page = await context.newPage();

    for (const item of prepared) {
      const name = `slide_${String(item.index).padStart(2, "0")}.png`;
      const outPath = path.join(outDir, name);

      await page.setContent(item.html, { waitUntil: "networkidle" });
      await page.evaluate(
        ({ floor, fitStep }) => {
          window.__readabilityFloor = floor;
          window.__fontFitStep = fitStep;
        },
        { floor: cfg.readabilityFloor ?? 28, fitStep: cfg.fontFitStep ?? 1 }
      );

      await page.waitForFunction(() => document.documentElement.getAttribute("data-ready") === "true", {
        timeout: 15000,
      });

      const fitWarnings = await page.evaluate(async () => {
        if (window.__slideReady) await window.__slideReady;
        return window.__fitWarnings || [];
      });

      for (const w of fitWarnings) {
        warnings.push({ slide: item.index, ...w });
      }

      await page.locator("#slide").screenshot({ path: outPath, type: "png" });
      generated.push(outPath);
      if (onProgress) {
        onProgress({
          index: item.index,
          total: prepared.length,
          name,
          path: outPath,
          type: item.type,
        });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return {
    count: generated.length,
    outputDir: outDir,
    files: generated,
    warnings,
    themeName: theme.name,
    readabilityFloor: cfg.readabilityFloor ?? 28,
  };
}

/**
 * Render episode to a single multi-page PDF (LinkedIn document format).
 * Each slide is printed as one vector page at exactly width×height px.
 *
 * @param {object} opts
 * @param {object} opts.content
 * @param {object} opts.theme
 * @param {string} [opts.outputPath] - when given, the PDF is written to disk
 * @param {object} [opts.config]
 * @param {(info:{index:number,total:number,type:string})=>void} [opts.onProgress]
 * @returns {Promise<{count:number, pdfPath:string|null, buffer:Buffer, warnings:object[]}>}
 */
export async function renderEpisodePdf({ content, theme, outputPath, config, onProgress }) {
  const cfg = config || (await loadConfig());
  const episodeName = content.episode || "episode";

  const validation = await validateTheme(theme);
  if (!validation.ok) {
    const err = new Error(`Theme validation failed:\n${validation.errors.join("\n")}`);
    err.validation = validation;
    throw err;
  }

  const prepared = await prepareEpisode(content, theme, cfg);
  const warnings = [];
  const pageBuffers = [];

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
    });
    const page = await context.newPage();

    for (const item of prepared) {
      await page.setContent(item.html, { waitUntil: "networkidle" });
      await page.evaluate(
        ({ floor, fitStep }) => {
          window.__readabilityFloor = floor;
          window.__fontFitStep = fitStep;
        },
        { floor: cfg.readabilityFloor ?? 28, fitStep: cfg.fontFitStep ?? 1 }
      );

      await page.waitForFunction(() => document.documentElement.getAttribute("data-ready") === "true", {
        timeout: 15000,
      });
      // Ensure every font/SVG has fully settled before printing.
      await page.evaluate(async () => {
        if (window.__slideReady) await window.__slideReady;
        await document.fonts.ready;
      });

      const fitWarnings = await page.evaluate(() => window.__fitWarnings || []);
      for (const w of fitWarnings) {
        warnings.push({ slide: item.index, ...w });
      }

      const buf = await page.pdf({
        width: `${cfg.width}px`,
        height: `${cfg.height}px`,
        printBackground: true,
        pageRanges: "1",
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      pageBuffers.push(buf);

      if (onProgress) {
        onProgress({ index: item.index, total: prepared.length, type: item.type });
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  // Merge single-page PDFs into one multi-page document.
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  for (const buf of pageBuffers) {
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
  merged.setTitle(`${episodeName} — sitehie carousel`);
  merged.setProducer("sitehie-carousel-tool");
  const pdfBytes = await merged.save();
  const buffer = Buffer.from(pdfBytes);

  let pdfPath = null;
  if (outputPath) {
    pdfPath = outputPath;
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });
    await fs.writeFile(pdfPath, buffer);
  }

  return { count: pageBuffers.length, pdfPath, buffer, warnings };
}

/**
 * Create a zip archive (as a Buffer) from absolute file paths.
 * Files are stored flat under their basename.
 */
export async function createZipBuffer(files) {
  // archiver v8 is ESM-only and has no default export — use the ZipArchive class.
  const { ZipArchive } = await import("archiver");
  const { PassThrough } = await import("node:stream");

  const chunks = [];
  const stream = new PassThrough();
  stream.on("data", (c) => chunks.push(c));

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const done = new Promise((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
    stream.on("error", reject);
  });
  archive.pipe(stream);

  for (const f of files) {
    archive.file(f, { name: path.basename(f) });
  }
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

/** HTML preview for a single slide index (0-based). */
export async function previewSlideHtml({ content, theme, slideIndex = 0, config }) {
  const cfg = config || (await loadConfig());
  const prepared = await prepareEpisode(content, theme, cfg);
  if (slideIndex < 0 || slideIndex >= prepared.length) {
    throw new Error(`slideIndex ${slideIndex} out of range (0..${prepared.length - 1})`);
  }
  return prepared[slideIndex].html;
}

export async function validateTheme(theme) {
  const errors = [];
  const schemaPath = path.join(CAROUSEL_ROOT, "themes", "theme.schema.json");
  const schema = await readJson(schemaPath);
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(theme);
  if (!ok) {
    for (const err of validate.errors || []) {
      errors.push(`  • ${err.instancePath || "/"} ${err.message}`);
    }
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

export async function listThemes() {
  const dir = path.join(CAROUSEL_ROOT, "themes");
  const files = await fs.readdir(dir);
  const themes = [];
  for (const f of files.filter((x) => x.endsWith(".theme.json"))) {
    try {
      const t = await readJson(path.join(dir, f));
      themes.push({
        file: f,
        path: path.join(dir, f),
        name: t.name || f.replace(/\.theme\.json$/, ""),
        description: t.description || "",
      });
    } catch {
      themes.push({ file: f, path: path.join(dir, f), name: f, description: "(unreadable)" });
    }
  }
  return themes;
}

export async function loadTheme(fileOrName) {
  const dir = path.join(CAROUSEL_ROOT, "themes");
  let filePath = fileOrName;
  if (!path.isAbsolute(fileOrName)) {
    if (fileOrName.endsWith(".json")) {
      filePath = path.join(dir, path.basename(fileOrName));
    } else {
      const candidate = path.join(dir, `${fileOrName}.theme.json`);
      filePath = existsSync(candidate) ? candidate : path.join(dir, fileOrName);
    }
  }
  return { theme: await readJson(filePath), path: filePath };
}

export async function saveTheme(fileName, theme) {
  const safe = path.basename(fileName).endsWith(".theme.json")
    ? path.basename(fileName)
    : `${path.basename(fileName, ".json")}.theme.json`;
  const filePath = path.join(CAROUSEL_ROOT, "themes", safe);
  await writeJson(filePath, theme);
  return filePath;
}

export async function listEpisodes() {
  const dir = path.join(CAROUSEL_ROOT, "content");
  if (!existsSync(dir)) return [];
  const files = await fs.readdir(dir);
  const episodes = [];
  for (const f of files.filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
    try {
      const c = await readJson(path.join(dir, f));
      episodes.push({
        file: f,
        path: path.join(dir, f),
        episode: c.episode || f.replace(/\.json$/, ""),
        series: c.series || "",
        slideCount: (c.slides || []).length,
      });
    } catch {
      /* skip */
    }
  }
  return episodes;
}

export async function loadEpisode(fileOrName) {
  const dir = path.join(CAROUSEL_ROOT, "content");
  let filePath = fileOrName;
  if (!path.isAbsolute(fileOrName)) {
    filePath = path.join(dir, path.basename(fileOrName).endsWith(".json")
      ? path.basename(fileOrName)
      : `${fileOrName}.json`);
  }
  return { content: await readJson(filePath), path: filePath };
}

export async function saveEpisode(fileName, content) {
  const safe = path.basename(fileName).endsWith(".json")
    ? path.basename(fileName)
    : `${path.basename(fileName)}.json`;
  const filePath = path.join(CAROUSEL_ROOT, "content", safe);
  await writeJson(filePath, content);
  return filePath;
}

export async function deleteEpisode(fileName) {
  const safe = path.basename(fileName).endsWith(".json")
    ? path.basename(fileName)
    : `${path.basename(fileName)}.json`;
  const filePath = path.join(CAROUSEL_ROOT, "content", safe);
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
  }
  // Also clear any autosave for this episode
  await clearAutosave("episode", safe).catch(() => {});
}

// ── Autosave helpers ─────────────────────────────────────────

const AUTOSAVE_DIRS = {
  episode: path.join(CAROUSEL_ROOT, "content", ".autosave"),
  theme: path.join(CAROUSEL_ROOT, "themes", ".autosave"),
};

const EXPLICIT_PATHS = {
  episode: (f) => path.join(CAROUSEL_ROOT, "content", f),
  theme: (f) => path.join(CAROUSEL_ROOT, "themes", f),
};

function autosavePath(type, fileName) {
  const safe = path.basename(fileName).endsWith(".json")
    ? path.basename(fileName)
    : `${path.basename(fileName)}.json`;
  return path.join(AUTOSAVE_DIRS[type], safe);
}

export async function writeAutosave(type, fileName, data) {
  const dir = AUTOSAVE_DIRS[type];
  await fs.mkdir(dir, { recursive: true });
  const filePath = autosavePath(type, fileName);
  await writeJson(filePath, data);
  return filePath;
}

export async function readAutosave(type, fileName) {
  const filePath = autosavePath(type, fileName);
  if (!existsSync(filePath)) return null;
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

export async function getAutosaveInfo(type, fileName) {
  const asPath = autosavePath(type, fileName);
  if (!existsSync(asPath)) return null;

  try {
    const asStat = await fs.stat(asPath);
    const explicitPath = EXPLICIT_PATHS[type](fileName);
    let explicitTime = 0;
    let explicitData = null;
    if (existsSync(explicitPath)) {
      try {
        const eStat = await fs.stat(explicitPath);
        explicitTime = eStat.mtimeMs;
        explicitData = await readJson(explicitPath);
      } catch { /* no explicit save yet */ }
    }

    const data = await readJson(asPath);
    // An autosave whose content matches the explicit save is redundant, not
    // "unsaved changes" — don't prompt a restore modal for it. This also
    // closes the race where an in-flight autosave write lands just after the
    // post-save DELETE and would otherwise look stale purely by mtime.
    const isRedundant =
      explicitData !== null &&
      JSON.stringify(data) === JSON.stringify(explicitData);

    return {
      exists: true,
      autosaveTime: asStat.mtimeMs,
      explicitTime,
      isStale: asStat.mtimeMs > explicitTime && !isRedundant,
      data,
    };
  } catch {
    return null;
  }
}

export async function clearAutosave(type, fileName) {
  const filePath = autosavePath(type, fileName);
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
  }
}

// ── History (versioning) helpers ─────────────────────────────

const HISTORY_DIR = path.join(CAROUSEL_ROOT, "content", ".history");
const MAX_HISTORY = 20;

function historyDirFor(episodeFile) {
  const stem = path.basename(episodeFile, ".json");
  return path.join(HISTORY_DIR, stem);
}

function historyFileName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`;
}

/** Save a timestamped snapshot of episode content (and optionally theme). */
export async function saveHistorySnapshot(episodeFile, content, theme) {
  const dir = historyDirFor(episodeFile);
  await fs.mkdir(dir, { recursive: true });

  const snapshot = {
    _snapshot: true,
    _timestamp: new Date().toISOString(),
    _episodeFile: episodeFile,
    content,
    theme: theme || null,
  };

  const filePath = path.join(dir, historyFileName());
  await writeJson(filePath, snapshot);

  // Prune: keep only MAX_HISTORY newest files
  await pruneHistory(episodeFile);

  return filePath;
}

/** List all snapshots for an episode, newest first. */
export async function listHistorySnapshots(episodeFile) {
  const dir = historyDirFor(episodeFile);
  if (!existsSync(dir)) return [];

  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse(); // newest first

  const snapshots = [];
  for (const f of files) {
    try {
      const data = await readJson(path.join(dir, f));
      snapshots.push({
        file: f,
        timestamp: data._timestamp || null,
        episodeFile: data._episodeFile || episodeFile,
      });
    } catch {
      snapshots.push({ file: f, timestamp: null, episodeFile });
    }
  }
  return snapshots;
}

/** Load a specific snapshot by filename. */
export async function loadHistorySnapshot(episodeFile, snapshotFile) {
  const dir = historyDirFor(episodeFile);
  const safe = path.basename(snapshotFile);
  const filePath = path.join(dir, safe);
  if (!existsSync(filePath)) return null;
  return await readJson(filePath);
}

/** Delete oldest snapshots beyond MAX_HISTORY. */
async function pruneHistory(episodeFile) {
  const dir = historyDirFor(episodeFile);
  if (!existsSync(dir)) return;

  const files = (await fs.readdir(dir))
    .filter((f) => f.endsWith(".json"))
    .sort(); // oldest first

  if (files.length <= MAX_HISTORY) return;

  const toDelete = files.slice(0, files.length - MAX_HISTORY);
  for (const f of toDelete) {
    await fs.unlink(path.join(dir, f)).catch((err) => {
      console.warn(`[carousel-tool] pruneHistory: failed to delete ${f}:`, err.message);
    });
  }
}

/** Delete a specific snapshot. */
export async function deleteHistorySnapshot(episodeFile, snapshotFile) {
  const dir = historyDirFor(episodeFile);
  const safe = path.basename(snapshotFile);
  const filePath = path.join(dir, safe);
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
  }
}

/**
 * Scan project + carousel font directories for available font files.
 */
export async function scanFonts() {
  const roots = [
    path.join(CAROUSEL_ROOT, "templates", "shared", "fonts"),
    PROJECT_ROOT,
    path.join(PROJECT_ROOT, "assets", "fonts", "thmanyahsans"),
    path.join(PROJECT_ROOT, "assets", "fonts", "thmanyahserifdisplay"),
    path.join(PROJECT_ROOT, "assets", "fonts", "thmanyahseriftext"),
  ];

  const found = new Map();

  async function walk(dir, depth = 0) {
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
        // Prefer woff2 over otf/ttf for same stem when in fonts dir
        const id = full;
        if (found.has(id)) continue;
        const family = guessFamilyName(ent.name);
        const weight = guessWeight(ent.name);
        const format = guessFormat(full);
        // Path relative to carousel templates when possible, else absolute
        let relPath = full;
        const sharedFonts = path.join(CAROUSEL_ROOT, "templates", "shared", "fonts");
        if (full.startsWith(sharedFonts)) {
          relPath = path.join("shared/fonts", path.relative(sharedFonts, full)).replace(/\\/g, "/");
        } else if (full.startsWith(CAROUSEL_ROOT)) {
          relPath = path.relative(path.join(CAROUSEL_ROOT, "templates"), full).replace(/\\/g, "/");
        } else {
          // Copy-friendly absolute; engine resolveFontPath handles absolute
          relPath = full;
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

  // Deduplicate by family+weight+ext preferring woff2 and shared/fonts
  const list = [...found.values()];
  list.sort((a, b) => {
    const score = (f) =>
      (f.ext === ".woff2" ? 0 : 1) + (String(f.path).includes("shared/fonts") ? 0 : 10);
    const s = score(a) - score(b);
    if (s !== 0) return s;
    return a.family.localeCompare(b.family) || a.fileName.localeCompare(b.fileName);
  });

  return list;
}

export function resolveFontPath(fontPath) {
  if (path.isAbsolute(fontPath) && existsSync(fontPath)) return fontPath;
  const candidates = [
    path.resolve(CAROUSEL_ROOT, "templates", fontPath),
    path.resolve(CAROUSEL_ROOT, fontPath),
    path.resolve(PROJECT_ROOT, fontPath),
    path.resolve(fontPath),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

// Font file magic bytes: wOF2 (woff2), wOFF (woff), OTTO (CFF/otf),
// 0x00010000 (ttf), true (Mac ttf), ttcf (collection).
const FONT_MAGIC = ["wOF2", "wOFF", "OTTO", "true", "ttcf"];

/**
 * Sniff the first bytes of a font file to confirm it is really a font.
 * Returns the detected format string, or null if the magic doesn't match
 * (e.g. an HTML error page saved with a .woff2 extension).
 */
async function sniffFontFormat(absPath) {
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

/**
 * Resolve an asset path to an absolute file path.
 * Checks theme-specific dir, shared dir, and legacy flat dir (in that order).
 * @param {string} assetPath - relative asset path e.g. "assets/icons/jwt-icon.svg"
 * @param {string} [themeName] - optional theme name for theme-specific lookup
 */
export function resolveAssetPath(assetPath, themeName) {
  if (!assetPath) return assetPath;
  if (assetPath.startsWith("data:")) return assetPath;
  if (path.isAbsolute(assetPath) && existsSync(assetPath)) return assetPath;

  // Normalise: strip leading "assets/" if present so we can rebuild
  const stripped = assetPath.replace(/^assets\//, "");

  const candidates = [];

  // 1. Theme-specific: assets/themes/{theme}/{stripped}
  if (themeName) {
    candidates.push(path.resolve(CAROUSEL_ROOT, "assets", "themes", themeName, stripped));
  }

  // 2. Shared: assets/shared/{stripped}
  candidates.push(path.resolve(CAROUSEL_ROOT, "assets", "shared", stripped));

  // 3. Legacy flat: assets/{stripped} (for backward compat with old references like "assets/icons/jwt-icon.svg")
  candidates.push(path.resolve(CAROUSEL_ROOT, "assets", stripped));

  // 4. Legacy flat with full original path
  candidates.push(path.resolve(CAROUSEL_ROOT, assetPath));

  // 5. Project root candidates
  candidates.push(path.resolve(PROJECT_ROOT, assetPath));
  candidates.push(path.resolve(PROJECT_ROOT, "studio-ui", "public", assetPath.replace(/^\/+/, "")));
  candidates.push(path.resolve(assetPath));
  candidates.push(path.resolve(process.cwd(), assetPath));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

/**
 * List all available assets for a given theme.
 * Returns assets from: assets/themes/{theme}/*  +  assets/shared/*
 */
export async function listAssetsForTheme(themeName) {
  const results = [];
  const assetExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"]);

  async function walkDir(dir, prefix) {
    if (!existsSync(dir)) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walkDir(full, prefix);
        } else if (ent.isFile()) {
          const ext = path.extname(ent.name).toLowerCase();
          if (!assetExts.has(ext)) continue;
          const relPath = `assets/${prefix}/${path.relative(dir, full).replace(/\\/g, "/")}`;
          const urlPath = `/uploads/${path.basename(full)}`;
          results.push({
            name: ent.name,
            path: relPath,
            url: urlPath,
            source: prefix.startsWith("themes") ? "theme" : "shared",
          });
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  // Theme-specific assets first
  if (themeName) {
    await walkDir(path.join(CAROUSEL_ROOT, "assets", "themes", themeName), `themes/${themeName}`);
  }

  // Then shared assets
  await walkDir(path.join(CAROUSEL_ROOT, "assets", "shared"), "shared");

  return results;
}

// ── internals ──────────────────────────────────────────────

async function buildFontFaceCss(fonts = {}) {
  const blocks = [];
  for (const [, font] of Object.entries(fonts)) {
    if (!font?.family || !font?.path) continue;
    const abs = resolveFontPath(font.path);
    const format = font.format || guessFormat(abs);
    const weight = font.weight != null ? font.weight : "normal";
    const style = font.style || "normal";
    let url;
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
  return blocks.join("\n");
}

function guessFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".woff2") return "woff2";
  if (ext === ".woff") return "woff";
  if (ext === ".ttf") return "truetype";
  if (ext === ".otf") return "opentype";
  return "woff2";
}

function guessFamilyName(fileName) {
  let base = fileName.replace(/\.(woff2?|ttf|otf)$/i, "");
  base = base
    .replace(/[-_]?(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black|Variable|VF|Salt).*$/i, "")
    .replace(/[-_]+$/g, "")
    .replace(/[-_]/g, " ")
    .trim();
  // thmanyahsans → Thmanyah Sans
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

function guessWeight(fileName) {
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

function buildCssVariables(theme, config) {
  const lines = [];
  lines.push(`:root {`);
  lines.push(`  --slide-width: ${config.width}px;`);
  lines.push(`  --slide-height: ${config.height}px;`);

  // Instagram safe zones (UI overlays): content must stay clear of these bands.
  const sz = config.safeZones || {};
  lines.push(`  --safe-top: ${sz.top ?? 120}px;`);
  lines.push(`  --safe-bottom: ${sz.bottom ?? 100}px;`);
  lines.push(`  --safe-x: ${sz.x ?? 80}px;`);

  for (const [key, value] of Object.entries(theme.colors || {})) {
    lines.push(`  --color-${camelToKebab(key)}: ${value};`);
  }

  for (const [key, font] of Object.entries(theme.fonts || {})) {
    if (font?.family) {
      lines.push(`  --font-${camelToKebab(key)}: ${JSON.stringify(font.family)}, sans-serif;`);
    }
  }

  const typeMap = {
    quoteSlide: "quote",
    codeSlideTitle: "code-title",
    codeSlideSubtitle: "code-subtitle",
    codeSlideCode: "code-code",
    codeSlideExplanation: "code-explanation",
    codeSlideNumber: "code-number",
    codeSlideFooter: "code-footer",
    codeSlideAnnotation: "code-annotation",
    coverSlideTitle: "cover-title",
    coverSlideSeries: "cover-series",
    coverSlideHint: "cover-hint",
    outroSlideQuestion: "outro-question",
    outroSlideHandle: "outro-handle",
    outroSlideCta: "outro-cta",
    comparisonSlideTitle: "comparison-title",
    comparisonSlideBody: "comparison-body",
    comparisonSlideLabel: "comparison-label",
    statSlideValue: "stat-value",
    statSlideLabel: "stat-label",
    statSlideSubtext: "stat-subtext",
  };

  for (const [typeKey, prefix] of Object.entries(typeMap)) {
    const t = theme.typography?.[typeKey];
    if (!t) continue;
    const familyKey = t.fontFamily;
    const family = theme.fonts?.[familyKey]?.family || familyKey || "sans-serif";
    lines.push(`  --type-${prefix}-font-family: ${JSON.stringify(family)}, sans-serif;`);
    const size = t.fontSizeMax ?? t.fontSize ?? 24;
    lines.push(`  --type-${prefix}-font-size: ${size}px;`);
    if (t.fontWeight != null) lines.push(`  --type-${prefix}-font-weight: ${t.fontWeight};`);
    if (t.lineHeight != null) lines.push(`  --type-${prefix}-line-height: ${t.lineHeight};`);
    if (t.letterSpacing != null) {
      const ls = typeof t.letterSpacing === "number" ? `${t.letterSpacing}px` : t.letterSpacing;
      lines.push(`  --type-${prefix}-letter-spacing: ${ls};`);
    }
    if (t.textTransform) lines.push(`  --type-${prefix}-text-transform: ${t.textTransform};`);
  }

  const q = theme.layout?.quoteSlide || {};
  lines.push(`  --layout-quote-text-align: ${q.textAlign || "right"};`);
  lines.push(`  --layout-quote-direction: ${q.direction || "rtl"};`);
  lines.push(`  --hl-thickness: ${q.highlightUnderlineThickness ?? 6}px;`);
  lines.push(`  --hl-offset: ${q.highlightUnderlineOffset ?? 4}px;`);
  const ps = q.paragraphSpacing;
  lines.push(`  --layout-quote-paragraph-spacing: ${ps != null ? (typeof ps === "number" ? `${ps}px` : ps) : "24px"};`);

  const c = theme.layout?.codeSlide || {};
  lines.push(`  --layout-code-block-radius: ${c.codeBlockBorderRadius ?? 16}px;`);
  lines.push(`  --layout-code-block-padding: ${c.codeBlockPadding || "24px"};`);
  lines.push(`  --layout-code-progress-height: ${c.progressBarHeight ?? 4}px;`);
  lines.push(`  --layout-code-progress-width: ${c.progressBarWidth || "100%"};`);
  lines.push(`  --layout-code-number-radius: ${c.slideNumberBorderRadius ?? 8}px;`);
  lines.push(`  --layout-code-number-padding: ${c.slideNumberPadding || "6px 12px"};`);
  lines.push(`  --layout-code-explanation-align: ${c.explanationAlign || "right"};`);
  lines.push(`  --layout-code-explanation-direction: ${c.explanationDirection || "rtl"};`);
  lines.push(`  --layout-code-annotation-gap: ${c.annotationGap ?? 12}px;`);

  const cov = theme.layout?.coverSlide || {};
  lines.push(`  --layout-cover-icon-size: ${cov.iconSize || "40%"};`);
  if (cov.logoWidth) {
    lines.push(`  --layout-cover-logo-width: ${cov.logoWidth};`);
    // Explicit logoHeight wins; otherwise a custom logoWidth implies auto height.
    lines.push(`  --layout-cover-logo-height: ${cov.logoHeight || "auto"};`);
  }
  if (cov.logoMaxHeight) {
    lines.push(`  --layout-cover-logo-max-height: ${cov.logoMaxHeight};`);
  }
  lines.push(`  --layout-cover-icon-frame-width: ${cov.iconFrameWidth ?? 3}px;`);
  lines.push(`  --layout-cover-icon-frame-radius: ${cov.iconFrameRadius ?? 24}px;`);
  lines.push(`  --layout-cover-icon-frame-padding: ${cov.iconFramePadding || "24px"};`);
  lines.push(`  --layout-cover-title-align: ${cov.titleAlign || "center"};`);
  lines.push(`  --layout-cover-title-direction: ${cov.titleDirection || "rtl"};`);

  const o = theme.layout?.outroSlide || {};
  lines.push(`  --layout-outro-question-align: ${o.questionAlign || "center"};`);
  lines.push(`  --layout-outro-question-direction: ${o.questionDirection || "rtl"};`);
  lines.push(`  --layout-outro-brand-gap: ${o.brandGap != null ? (typeof o.brandGap === "number" ? `${o.brandGap}px` : o.brandGap) : "14px"};`);
  lines.push(`  --layout-outro-cta-radius: ${o.ctaRadius ?? 999}px;`);
  lines.push(`  --layout-outro-cta-padding: ${o.ctaPadding || "14px 32px"};`);
  if (o.ctaShadow) lines.push(`  --effect-outro-cta-shadow: ${o.ctaShadow};`);

  const cmp = theme.layout?.comparisonSlide || {};
  lines.push(`  --layout-comparison-gap: ${cmp.gap != null ? (typeof cmp.gap === "number" ? `${cmp.gap}px` : cmp.gap) : "24px"};`);
  lines.push(`  --layout-comparison-panel-radius: ${cmp.panelRadius ?? 24}px;`);
  lines.push(`  --layout-comparison-panel-padding: ${cmp.panelPadding || "32px"};`);
  lines.push(`  --layout-comparison-title-align: ${cmp.titleAlign || "center"};`);
  lines.push(`  --layout-comparison-title-direction: ${cmp.titleDirection || "rtl"};`);

  const st = theme.layout?.statSlide || {};
  lines.push(`  --layout-stat-align: ${st.align || "center"};`);
  lines.push(`  --layout-stat-direction: ${st.direction || "rtl"};`);

  const fx = theme.effects || {};
  if (fx.codeBlockShadow) lines.push(`  --effect-code-block-shadow: ${fx.codeBlockShadow};`);
  if (fx.iconShadow) lines.push(`  --effect-icon-shadow: ${fx.iconShadow};`);
  if (fx.surfaceRadius != null) lines.push(`  --effect-surface-radius: ${fx.surfaceRadius}px;`);
  if (fx.clayDepth) lines.push(`  --effect-clay-depth: ${fx.clayDepth};`);
  if (theme.colors?.highlightMarker) {
    lines.push(`  --color-highlight-marker: ${theme.colors.highlightMarker};`);
  }

  lines.push(`}`);
  return lines.join("\n");
}

async function resolveSlideAssets(slide, themeName) {
  const clone = { ...slide };
  if (clone.iconAsset && !String(clone.iconAsset).startsWith("data:")) {
    const abs = resolveAssetPath(clone.iconAsset, themeName);
    if (existsSync(abs)) {
      const buf = await fs.readFile(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = MIME[ext] || "image/png";
      clone.iconAsset = `data:${mime};base64,${buf.toString("base64")}`;
    }
  }
  // Outro avatar / dedicated image asset
  if (clone.imageAsset && !String(clone.imageAsset).startsWith("data:")) {
    const abs = resolveAssetPath(clone.imageAsset, themeName);
    if (existsSync(abs)) {
      const buf = await fs.readFile(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = MIME[ext] || "image/png";
      clone.imageAsset = `data:${mime};base64,${buf.toString("base64")}`;
    }
  }
  // Resolve image assets for quote/code/cover slides
  if (clone.images && Array.isArray(clone.images)) {
    clone.images = await Promise.all(
      clone.images.map(async (img) => {
        const resolved = { ...img };
        if (img.asset && !String(img.asset).startsWith("data:")) {
          const abs = resolveAssetPath(img.asset, themeName);
          if (existsSync(abs)) {
            const buf = await fs.readFile(abs);
            const ext = path.extname(abs).toLowerCase();
            const mime = MIME[ext] || "image/png";
            resolved.asset = `data:${mime};base64,${buf.toString("base64")}`;
          }
        }
        return resolved;
      })
    );
  }
  return clone;
}

function camelToKebab(str) {
  return String(str)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

#!/usr/bin/env node
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CAROUSEL_ROOT,
  loadConfig,
  loadEpisode,
  loadTheme,
  listThemes,
  renderEpisode,
  renderEpisodePdf,
  validateTheme,
  prepareEpisode,
} from "./engine.js";
import { escapeHtml } from "./lib/html-utils.js";
import { chromium } from "playwright";
import http from "node:http";
import { createReadStream, statSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const config = await loadConfig();

  if (args.listThemes) {
    const themes = await listThemes();
    if (!themes.length) {
      console.log("No themes found.");
      return;
    }
    console.log("Available themes:\n");
    for (const t of themes) {
      console.log(`  ${t.file}`);
      console.log(`    name: ${t.name}`);
      if (t.description) console.log(`    desc: ${t.description}`);
      console.log();
    }
    return;
  }

  if (args.validateTheme) {
    const { theme, path: themePath } = await loadTheme(resolvePath(args.validateTheme));
    const result = await validateTheme(theme);
    if (!result.ok) {
      console.error(`Theme validation failed:\n${result.errors.join("\n")}`);
      process.exit(1);
    }
    console.log(`✓ Theme valid: ${themePath}`);
    return;
  }

  if (!args.episode) {
    console.error("Error: --episode is required (or use --list-themes / --validate-theme / --help)");
    printHelp();
    process.exit(1);
  }

  const episodePath = resolvePath(args.episode);
  const themePath = resolvePath(args.theme || config.defaultTheme);
  const { content } = await loadEpisode(episodePath);
  const { theme } = await loadTheme(themePath);

  const validation = await validateTheme(theme);
  if (!validation.ok) {
    console.error(`Theme validation failed for ${themePath}:\n${validation.errors.join("\n")}`);
    process.exit(1);
  }

  const episodeName = content.episode || path.basename(episodePath, ".json");
  const format = (args.format || "png").toLowerCase();
  if (!["png", "pdf"].includes(format)) {
    console.error(`Error: --format must be "png" or "pdf" (got "${args.format}")`);
    process.exit(1);
  }
  const outputDir = resolvePath(args.output || path.join(config.outputDir, episodeName));

  if (args.preview) {
    const prepared = await prepareEpisode(content, theme, config);
    await runPreview(prepared, config, themePath);
    return;
  }

  console.log(`Rendering ${content.slides?.length || 0} slides…`);
  console.log(`  theme:  ${path.relative(CAROUSEL_ROOT, themePath) || themePath}`);
  console.log(`  format: ${format}`);
  console.log(`  output: ${path.relative(CAROUSEL_ROOT, outputDir) || outputDir}`);
  console.log(`  size:   ${config.width}×${config.height} @ ${config.scale}x`);

  if (format === "pdf") {
    const pdfPath = outputDir.endsWith(".pdf")
      ? outputDir
      : path.join(outputDir, `${episodeName}.pdf`);
    const result = await renderEpisodePdf({
      content,
      theme,
      outputPath: pdfPath,
      config,
      onProgress: ({ index, total, type }) => {
        process.stdout.write(`  ✓ page ${index}/${total} (${type})\n`);
      },
    });
    console.log("\n────────────────────────────────────");
    console.log(`Done. ${result.count} pages compiled`);
    console.log(`PDF:     ${result.pdfPath}`);
    console.log(`Theme:   ${theme.name} (${themePath})`);
    printWarnings(result.warnings, config.readabilityFloor ?? 28);
    console.log("────────────────────────────────────\n");
    return;
  }

  const result = await renderEpisode({
    content,
    theme,
    outputDir,
    config,
    onProgress: ({ name, type }) => {
      process.stdout.write(`  ✓ ${name} (${type})\n`);
    },
  });

  console.log("\n────────────────────────────────────");
  console.log(`Done. ${result.count} slides generated`);
  console.log(`Output:  ${result.outputDir}`);
  console.log(`Theme:   ${result.themeName} (${themePath})`);
  printWarnings(result.warnings, result.readabilityFloor);
  console.log("────────────────────────────────────\n");
}

function printWarnings(warnings, floor) {
  if (warnings.length) {
    console.log(`\nWarnings (text auto-shrunk below readability floor ${floor}px):`);
    for (const w of warnings) {
      console.log(`  • slide_${String(w.slide).padStart(2, "0")}: ${w.element} → ${w.fontSize}px`);
    }
  } else {
    console.log("Warnings: none");
  }
}

async function runPreview(prepared, config, themePath) {
  const port = config.previewPort || 3847;
  const pages = prepared.map((p) => ({ index: p.index, type: p.type, html: p.html }));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildPreviewIndex(pages, themePath));
      return;
    }
    const m = url.pathname.match(/^\/slide\/(\d+)$/);
    if (m) {
      const idx = Number(m[1]) - 1;
      if (pages[idx]) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(pages[idx].html);
        return;
      }
    }
    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log(`\n  Preview server running at http://127.0.0.1:${port}`);
  console.log(`  ${pages.length} slides loaded — opening browser…`);
  console.log(`  Press Ctrl+C to stop.\n`);

  try {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}`);
    await new Promise(() => {});
  } catch (err) {
    console.error(`\n[carousel-tool] Preview browser closed or failed to launch.`);
    if (err?.message) console.error(`  ${err.message}`);
    if (err?.message?.includes("chromium") || err?.message?.includes("browser")) {
      console.error(`  Hint: run "npx playwright install chromium" to install the browser.`);
    }
  }
}

function buildPreviewIndex(pages, themePath) {
  const links = pages
    .map(
      (p) =>
        `<a class="card" href="/slide/${p.index}" target="frame"><span class="num">${String(p.index).padStart(2, "0")}</span><span class="type">${p.type}</span></a>`
    )
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Preview</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;background:#111;color:#eee;display:grid;grid-template-columns:220px 1fr;height:100vh}
aside{border-right:1px solid #333;padding:16px;overflow:auto}.card{display:flex;gap:10px;padding:10px;border:1px solid #333;border-radius:8px;color:inherit;text-decoration:none;margin-bottom:8px}
.num{color:#00C8D7;font-weight:700}main{display:flex;align-items:center;justify-content:center}
iframe{width:1080px;height:1350px;border:none;border-radius:12px;transform-origin:center}</style></head>
<body><aside><h1 style="font-size:14px;color:#888;margin-bottom:12px">Slides</h1>
<div style="font-size:12px;color:#666;margin-bottom:16px">${escapeHtml(String(themePath))}<br/>${pages.length} slides</div>
${links}</aside><main><iframe name="frame" src="/slide/1"></iframe></main>
<script>function scale(){const f=document.querySelector('iframe'),m=document.querySelector('main');const s=Math.min((m.clientWidth-48)/1080,(m.clientHeight-48)/1350,1);f.style.transform='scale('+s+')'}scale();window.onresize=scale</script>
</body></html>`;
}

function parseArgs(argv) {
  const out = {
    episode: null,
    theme: null,
    output: null,
    format: null,
    preview: false,
    listThemes: false,
    validateTheme: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--episode" || a === "-e") out.episode = argv[++i];
    else if (a === "--theme" || a === "-t") out.theme = argv[++i];
    else if (a === "--output" || a === "-o") out.output = argv[++i];
    else if (a === "--format" || a === "-f") out.format = argv[++i];
    else if (a === "--preview" || a === "-p") out.preview = true;
    else if (a === "--list-themes") out.listThemes = true;
    else if (a === "--validate-theme") out.validateTheme = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) {
      console.error(`Unknown flag: ${a}`);
      out.help = true;
    }
  }
  return out;
}

function printHelp() {
  console.log(`
sitehie carousel-tool — Instagram carousel generator (PNG + PDF)

Usage:
  node render.js --episode content/jwt.json [--theme themes/default.theme.json] [--output output/jwt/]
  node render.js --episode content/jwt.json --format pdf [--output output/jwt/]
  node render.js --episode content/jwt.json --preview
  node render.js --list-themes
  node render.js --validate-theme themes/default.theme.json

Formats:
  png   Individual high-DPI PNGs (slide_01.png …) @ config.scale — default
  pdf   One multi-page document (<episode>.pdf), 1080×1350 per page (LinkedIn)
`);
}

function resolvePath(p) {
  if (!p) return p;
  if (path.isAbsolute(p)) return p;
  const fromCwd = path.resolve(process.cwd(), p);
  if (existsSync(fromCwd)) return fromCwd;
  return path.resolve(CAROUSEL_ROOT, p);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

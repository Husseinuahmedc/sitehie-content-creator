import { chromium } from "playwright";
import { buildSlideHtml } from "../engine.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAROUSEL_ROOT = path.resolve(__dirname, "..");
const theme = JSON.parse(await readFile(path.join(CAROUSEL_ROOT, "themes", "alt-claymorphism.theme.json"), "utf8"));
const config = { width: 1080, height: 1350, scale: 2, outputDir: "output", templatesDir: "templates", readabilityFloor: 28 };

async function coverSize(px) {
  const html = await buildSlideHtml({
    type: "cover",
    slide: { type: "cover", title: "JWT ببساطة", iconEmoji: "🔐", fontSizes: { coverSlideTitle: px } },
    theme, config,
    meta: { slideIndex: 1, totalSlides: 5, progressPct: 20, series: "S", episode: "E", readingTime: 3, handle: "@sitehie" },
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  try { await page.waitForFunction(() => document.documentElement.getAttribute("data-ready") === "true", { timeout: 10000 }); } catch {}
  const size = await page.evaluate(() => getComputedStyle(document.getElementById("cover-title")).fontSize);
  await browser.close();
  return parseFloat(size);
}

// Title sits at top:68% (~918px), width 80% (864px), line-height 1.4.
// 140px: text fits one line (~616px wide), bottom ≈ 918+196=1114 → exact render.
// 340px: text wraps (too wide) AND 2 lines push past slide bottom → must shrink.
const at140 = await coverSize(140);
console.log(`${at140 === 140 ? "✅" : "❌"} 140px override → rendered ${at140}px (fits slide, expected exact 140)`);
const at340 = await coverSize(340);
console.log(`${at340 < 340 && at340 >= 30 ? "✅" : "❌"} 340px override → rendered ${at340}px (exceeds slide, expected shrink <340)`);
process.exit(at140 === 140 && at340 < 340 && at340 >= 30 ? 0 : 1);

import { chromium } from "playwright";
import { buildSlideHtml } from "../engine.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAROUSEL_ROOT = path.resolve(__dirname, "..");

async function loadTheme(name) {
  const p = path.join(CAROUSEL_ROOT, "themes", name);
  const raw = await readFile(p, "utf8");
  return JSON.parse(raw);
}

async function renderAndCapture(slide, config, theme) {
  const html = await buildSlideHtml({ type: slide.type, slide, theme, config, meta: {
    slideIndex: 1, totalSlides: 5, progressPct: 20,
    series: "Test Series", episode: "Test",
    readingTime: 3, handle: "@sitehie",
  }});

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  try {
    await page.waitForFunction(
      () => document.documentElement.getAttribute("data-ready") === "true",
      { timeout: 10000 }
    );
  } catch { /* ok */ }

  const data = await page.evaluate(() => {
    const slideEl = document.getElementById("slide");
    const rect = slideEl?.getBoundingClientRect();
    const images = [...document.querySelectorAll(".slide-image")].map((el) => {
      return {
        src: el.getAttribute("src")?.slice(0, 80),
        top: el.style.top, left: el.style.left,
        width: el.style.width, height: el.style.height,
        zIndex: el.style.zIndex,
      };
    });
    const paras = [...document.querySelectorAll("#quote-content p")].map((p) => ({
      text: (p.textContent || "").slice(0, 60),
      marginBottom: getComputedStyle(p).marginBottom,
    }));
    const coverTitle = document.getElementById("cover-title");
    return {
      images, paras,
      slideWidth: rect?.width, slideHeight: rect?.height,
      coverTitleFontSize: coverTitle ? getComputedStyle(coverTitle).fontSize : null,
    };
  });

  await page.close();
  await browser.close();
  return data;
}

async function main() {
  const theme = await loadTheme("default.theme.json");
  const config = { width: 1080, height: 1350, scale: 2, outputDir: "output", templatesDir: "templates", readabilityFloor: 28 };

  let failures = 0;

  // Test 1: Multi-paragraph quote
  {
    const slide = { type: "quote", paragraphs: [
      { text: "الفقرة الأولى", highlights: [], cyanWords: [] },
      { text: "الفقرة الثانية", highlights: [], cyanWords: [] },
      { text: "الفقرة الثالثة", highlights: [], cyanWords: [] },
    ]};
    const data = await renderAndCapture(slide, config, theme);
    const ok = data.paras.length === 3 && data.paras[0].text.includes("الفقرة الأولى") && data.paras[2].text.includes("الفقرة الثالثة");
    console.log(`${ok ? "✅" : "❌"} Multi-paragraph: ${data.paras.length} paragraphs` + (ok ? "" : ` (expected 3)`));
    if (!ok) failures++;
  }

  // Test 2: Backward compatibility (legacy text format)
  {
    const slide = { type: "quote", text: "نص قديم مع كلمة مميزة", highlights: ["مميزة"], cyanWords: [] };
    const data = await renderAndCapture(slide, config, theme);
    const ok = data.paras.length === 1 && data.paras[0].text.includes("نص قديم");
    console.log(`${ok ? "✅" : "❌"} Legacy compat: ${data.paras.length} paragraph from single text` + (ok ? "" : ` (expected 1)`));
    if (!ok) failures++;
  }

  // Test 3: Paragraph spacing
  {
    const themedTheme = JSON.parse(JSON.stringify(theme));
    themedTheme.layout.quoteSlide.paragraphSpacing = "60px";
    const slide = { type: "quote", paragraphs: [
      { text: "فقرة أولى", highlights: [], cyanWords: [] },
      { text: "فقرة ثانية", highlights: [], cyanWords: [] },
    ]};
    const data = await renderAndCapture(slide, config, themedTheme);
    const mb = parseFloat(data.paras[0].marginBottom);
    const ok = mb >= 55 && mb <= 65;
    console.log(`${ok ? "✅" : "❌"} Paragraph spacing: margin-bottom=${data.paras[0].marginBottom}` + (ok ? "" : ` (expected ~60px)`));
    if (!ok) failures++;
  }

  // Test 4: Image on quote slide
  {
    const slide = { type: "quote", text: "نص مع صورة", images: [
      { asset: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", top: "10%", left: "5%", width: "40%", height: "30%", scale: 1, zIndex: 0 },
    ]};
    const data = await renderAndCapture(slide, config, theme);
    const ok = data.images.length === 1 && data.images[0].top === "10%" && data.images[0].left === "5%";
    console.log(`${ok ? "✅" : "❌"} Image on quote: ${data.images.length} image(s) at ${data.images[0]?.top} ${data.images[0]?.left}`);
    if (!ok) failures++;
  }

  // Test 5: Image on code slide
  {
    const slide = { type: "code", titleEn: "Title", code: "const x = 1;", explanation: "شرح", images: [
      { asset: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", top: "20%", left: "10%", width: "30%", height: "20%", scale: 1, zIndex: 0 },
    ]};
    const data = await renderAndCapture(slide, config, theme);
    const ok = data.images.length === 1 && data.images[0].top === "20%" && data.images[0].left === "10%";
    console.log(`${ok ? "✅" : "❌"} Image on code: ${data.images.length} image(s) at ${data.images[0]?.top} ${data.images[0]?.left}`);
    if (!ok) failures++;
  }

  // Test 6: Image z-index default (0 = behind text which has z-index 1)
  {
    const slide = { type: "quote", text: "نص مع صورة خلفية", images: [
      { asset: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", top: "10%", left: "5%", width: "40%", height: "30%" },
    ]};
    const data = await renderAndCapture(slide, config, theme);
    const ok = data.images.length === 1 && data.images[0].zIndex === "0";
    console.log(`${ok ? "✅" : "❌"} Image z-index: ${data.images[0]?.zIndex}` + (ok ? "" : " (expected 0)"));
    if (!ok) failures++;
  }

  // Test 7: Font-size regression
  {
    const slide = { type: "cover", title: "Test", iconEmoji: "🔐", fontSizes: { coverSlideTitle: 96 } };
    const data = await renderAndCapture(slide, config, theme);
    const ok = data.coverTitleFontSize === "96px";
    console.log(`${ok ? "✅" : "❌"} Font-size regression: cover title = ${data.coverTitleFontSize}` + (ok ? "" : " (expected 96px)"));
    if (!ok) failures++;
  }

  console.log(`\n${failures === 0 ? "✅ All tests passed" : `❌ ${failures} test(s) failed`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });

/**
 * Presentation video exporter — deterministic Playwright frame-capture pipeline.
 *
 * Node.js computes frames via evaluateAtMasterTime(), Playwright renders slides,
 * FFmpeg encodes frames → MP4 or WebM.
 *
 * Core invariants:
 *   - Export never depends on wall-clock timing (explicit frame/fps)
 *   - Same evaluateTimeline code as browser player
 *   - Canvas scaling via ExportTarget (contain/cover fit)
 */

import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Browser, Page } from "playwright";
import type { Episode, Theme } from "@sitehie/core/domain";
import type { PresentationPreset, PresentationCanvas, CanvasFit } from "@sitehie/core/presentation";

export type ExportFormat = "mp4" | "webm";

export type ExportTarget = {
  canvas: PresentationCanvas;
  fit: CanvasFit;
  anchor?: "center" | "top" | "bottom";
};

export type ExportProgress = {
  frame: number;
  totalFrames: number;
  pct: number;
  phase: "rendering" | "encoding" | "done";
};

const FPS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Render page builder ────────────────────────────────────────────────────

function buildRenderPage(slideHtmls: string[], canvas: PresentationCanvas, fit: CanvasFit, anchor: string): string {
  const logicalW = 1080;
  const logicalH = 1350;
  const targetW = canvas.width;
  const targetH = canvas.height;

  // Compute scale and offset for contain/cover
  const scaleX = targetW / logicalW;
  const scaleY = targetH / logicalH;

  let scale: number;
  let offsetX = 0;
  let offsetY = 0;

  if (fit === "contain") {
    scale = Math.min(scaleX, scaleY);
    // Center the content
    offsetX = (targetW - logicalW * scale) / 2;
    offsetY = (targetH - logicalH * scale) / 2;
    if (anchor === "top") offsetY = 0;
    else if (anchor === "bottom") offsetY = targetH - logicalH * scale;
  } else {
    // cover: scale to fill, crop the overflow
    scale = Math.max(scaleX, scaleY);
    offsetX = (targetW - logicalW * scale) / 2;
    offsetY = (targetH - logicalH * scale) / 2;
    if (anchor === "top") offsetY = 0;
    else if (anchor === "bottom") offsetY = targetH - logicalH * scale;
  }
  const slideFrames = slideHtmls
    .map(
      (html, i) => `<iframe
  class="slide-frame"
  data-slide="${i}"
  srcdoc="${escapeForHtml(html)}"
  style="
    position:absolute;
    inset:0;
    width:100%;
    height:100%;
    border:none;
    background:transparent;
    will-change:opacity,transform;
  "
></iframe>`,
    )
    .join("\n");

  const w = canvas.width;
  const h = canvas.height;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body {
    width:${w}px; height:${h}px;
    overflow:hidden;
    background:#0a0c0e;
  }
  #stage {
    position:absolute;
    width:${logicalW}px; height:${logicalH}px;
    overflow:hidden;
    transform: translate(${offsetX}px, ${offsetY}px) scale(${scale});
    transform-origin: top left;
  }
  .slide-frame {
    transition: none;
  }
</style>
</head>
<body>
<div id="stage">
${slideFrames}
</div>
<script>
let readyCount = 0;
const totalSlides = ${slideHtmls.length};
const readyResolve = {};

window.__ready = new Promise(resolve => {
  window.__resolveReady = () => {
    readyCount++;
    if (readyCount >= totalSlides) resolve();
  };
});

// Each iframe calls parent.__onSlideReady() when its data-ready is set
window.__onSlideReady = function() {};

window.__applyFrame = function(data) {
  if (!data || !data.frames) return;
  for (let i = 0; i < data.frames.length; i++) {
    const f = data.frames[i];
    const iframe = document.querySelector('.slide-frame[data-slide="' + f._slideIndex + '"]');
    if (!iframe) continue;
    const s = iframe.style;
    s.opacity = f._opacity != null ? f._opacity : 1;
    s.transform = f._transform || 'none';
    s.filter = f._filter || 'none';
    s.zIndex = i;
  }
};
</script>
</body>
</html>`;
}

function escapeForHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── FFmpeg encode stream ───────────────────────────────────────────────────

function encodeToVideo(
  format: ExportFormat,
  fps: number,
  frames: Buffer[],
): Promise<Buffer> {
  const tmpFile = path.join(os.tmpdir(), `sitehie-export-${Date.now()}.${format}`);

  const args: string[] = [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "png",
    "-r", String(fps),
    "-i", "-",
  ];

  if (format === "mp4") {
    args.push(
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
    );
  } else {
    args.push(
      "-c:v", "libvpx-vp9",
      "-crf", "30",
      "-b:v", "0",
      "-row-mt", "1",
      "-deadline", "realtime",
    );
  }

  // Output to temp file (mp4 muxer requires seekable output)
  args.push("-f", format, tmpFile);

  const proc = spawn("ffmpeg", args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  proc.stderr!.on("data", (d: Buffer) => { stderr += d.toString(); });

  // Pipe frames to stdin
  const frameStream = Readable.from(frames);
  frameStream.pipe(proc.stdin!);

  return new Promise((resolve, reject) => {
    proc.on("close", async (code) => {
      try {
        if (code !== 0) {
          console.error(`[ffmpeg stderr] ${stderr.slice(-500)}`);
          try { fs.unlinkSync(tmpFile); } catch {}
          reject(new Error(`ffmpeg exited with code ${code}`));
          return;
        }
        const buffer = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        resolve(buffer);
      } catch (err) {
        try { fs.unlinkSync(tmpFile); } catch {}
        reject(err);
      }
    });
    proc.on("error", (err) => {
      try { fs.unlinkSync(tmpFile); } catch {}
      reject(err);
    });
    setTimeout(() => {
      proc.kill();
      try { fs.unlinkSync(tmpFile); } catch {}
      reject(new Error("FFmpeg encode timed out"));
    }, 300000);
  });
}

// ── Render and capture frames ──────────────────────────────────────────────

export async function exportPresentationVideo({
  episode,
  theme,
  slideHtmls,
  preset,
  canvas,
  fit,
  format,
  outputPath,
  anchor,
  onProgress,
}: {
  episode: Episode;
  theme: Theme;
  slideHtmls: string[];
  preset: PresentationPreset;
  canvas: PresentationCanvas;
  fit: CanvasFit;
  format: ExportFormat;
  outputPath: string;
  anchor?: "center" | "top" | "bottom";
  onProgress?: (p: ExportProgress) => void;
}): Promise<Buffer> {
  const {
    evaluateAtMasterTime,
    computeTotalDuration,
  } = await import("@sitehie/core/presentation");

  const { buildPresentationData } = await import("@/lib/presentation-builder");
  const presentationData = buildPresentationData(episode, preset);

  const totalMs = computeTotalDuration(presentationData.slides);
  const totalFrames = Math.max(1, Math.ceil((totalMs / 1000) * FPS));

  const pageHtml = buildRenderPage(slideHtmls, canvas, fit, anchor ?? "center");

  // Launch Playwright
  const { chromium } = await import("playwright");
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: canvas.width, height: canvas.height },
    deviceScaleFactor: 1,
  });

  const page: Page = await context.newPage();

  try {
    await page.setContent(pageHtml, { waitUntil: "domcontentloaded" });

    // Wait for slide iframes to load
    let allReady = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const ready = await page.evaluate(() => {
        const iframes = document.querySelectorAll(".slide-frame");
        let count = 0;
        for (const iframe of iframes) {
          try {
            const doc = (iframe as HTMLIFrameElement).contentDocument;
            if (doc && doc.documentElement.getAttribute("data-ready") === "true") {
              count++;
            }
          } catch { /* may fail during load */ }
        }
        return { count, total: iframes.length };
      });
      if (ready.count === ready.total) {
        allReady = true;
        break;
      }
      await sleep(300);
    }

    if (!allReady) {
      console.warn(`[export-video] Only ${/* approximate */ "some"} slides ready, proceeding`);
    }

    // Allow font/layout to stabilize
    await sleep(600);

    // Collect all frames in memory first
    const pngFrames: Buffer[] = [];

    // Frame capture loop
    const frameTime = 1000 / FPS;
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      const t = frameIdx * frameTime;
      const masterResult = evaluateAtMasterTime(presentationData.slides, t);

      const frameData = buildFramePayload(masterResult);

      await page.evaluate((data) => {
        const fn = (window as unknown as { __applyFrame?: (d: unknown) => void }).__applyFrame;
        if (fn) fn(data);
      }, frameData);

      await sleep(33);

      const png = await page.screenshot({ type: "png" });
      pngFrames.push(png);

      if (frameIdx % 10 === 0 || frameIdx === totalFrames - 1) {
        onProgress?.({
          frame: frameIdx + 1,
          totalFrames,
          pct: Math.round(((frameIdx + 1) / totalFrames) * 100),
          phase: "rendering",
        });
      }
    }

    // Encode all frames to video
    onProgress?.({ frame: totalFrames, totalFrames, pct: 100, phase: "encoding" });
    const videoBuffer = await encodeToVideo(format, FPS, pngFrames);
    onProgress?.({ frame: totalFrames, totalFrames, pct: 100, phase: "done" });

    return videoBuffer;
  } finally {
    await context.close();
    await browser.close();
  }
}

// ── Frame payload builder ──────────────────────────────────────────────────

type FrameData = {
  frames: Array<{
    _slideIndex: number;
    _opacity: number;
    _transform: string;
    _filter: string;
  }>;
};

function buildFramePayload(
  masterResult: ReturnType<typeof import("@sitehie/core/presentation").evaluateAtMasterTime>,
): FrameData {
  if (!masterResult) return { frames: [] };

  const frames: FrameData["frames"] = [];

  for (let i = 0; i < masterResult.frames.length; i++) {
    const frame = masterResult.frames[i];
    const match = frame.slideId.match(/slide-(\d+)/);
    const slideIdx = match ? Number(match[1]) : i;

    const tv = masterResult.transitionVisual;

    let opacity = 1;
    let transform = "none";
    let filter = "none";

    if (tv && masterResult.frames.length === 2) {
      if (i === 0) {
        opacity = tv.slideA.opacity;
        transform = tv.slideA.transform;
        filter = tv.slideA.filter;
      } else {
        opacity = tv.slideB.opacity;
        transform = tv.slideB.transform;
        filter = tv.slideB.filter;
      }
    }

    frames.push({
      _slideIndex: slideIdx,
      _opacity: opacity,
      _transform: transform,
      _filter: filter,
    });
  }

  return { frames };
}

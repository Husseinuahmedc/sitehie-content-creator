/**
 * Style-example sampling — reads the most recent theme JSONs in the carousel
 * content directory so AI prompts can learn the creator's voice.
 *
 * This is UI-layer I/O (reads `carousel-tool/content/*.json`); it is not part
 * of the `AiAdapter` port. The adapter-level prompts consume the examples via
 * the `styleExamples` field of the port inputs.
 */
import fs from "node:fs/promises";
import path from "node:path";

const MAX_EXAMPLES = 5;
const PER_FILE_CHARS = 400;
const TOTAL_EXAMPLES_CHARS = 2000;

export async function sampleStyleExamples(carouselRoot: string): Promise<string[]> {
  const dir = path.join(carouselRoot, "content");
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const withStats = await Promise.all(
    jsonFiles.map(async (f) => {
      try {
        const stat = await fs.stat(path.join(dir, f));
        return { file: f, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    })
  );

  const valid = withStats.filter((x): x is NonNullable<typeof x> => x !== null);
  valid.sort((a, b) => b.mtime - a.mtime);
  const recent = valid.slice(0, MAX_EXAMPLES);

  const examples: string[] = [];
  let totalChars = 0;
  for (const { file } of recent) {
    if (totalChars >= TOTAL_EXAMPLES_CHARS) break;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, file), "utf-8")) as Record<string, unknown>;
      const texts: string[] = [];
      const slides = raw.slides;
      if (Array.isArray(slides)) {
        for (const slide of slides) {
          if (!slide || typeof slide !== "object") continue;
          const s = slide as Record<string, unknown>;
          if (typeof s.title === "string") texts.push(s.title);
          if (typeof s.text === "string") texts.push(s.text);
          if (typeof s.titleEn === "string") texts.push(s.titleEn);
          if (typeof s.explanation === "string") texts.push(s.explanation);
          if (typeof s.code === "string") texts.push(s.code);
          if (Array.isArray(s.paragraphs)) {
            for (const p of s.paragraphs) {
              if (p && typeof p === "object" && typeof (p as Record<string, unknown>).text === "string") {
                texts.push((p as Record<string, unknown>).text as string);
              }
            }
          }
        }
      }

      const combined = texts.join("\n").trim();
      if (!combined) continue;

      const truncated = combined.length > PER_FILE_CHARS
        ? combined.slice(0, PER_FILE_CHARS) + "..."
        : combined;
      examples.push(truncated);
      totalChars += truncated.length;
    } catch {
      // skip unreadable files
    }
  }

  return examples;
}
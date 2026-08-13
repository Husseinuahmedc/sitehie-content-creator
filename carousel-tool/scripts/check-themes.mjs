/**
 * Theme consistency checker.
 *
 * 1. Validates EVERY themes/*.theme.json against themes/theme.schema.json (Ajv).
 * 2. Cross-theme drift check: computes the union of config leaf paths across
 *    all themes and flags any theme missing a path that a sibling defines.
 *    This catches the class of bug where a new field (e.g. paragraphSpacing)
 *    is added to one theme file but not backfilled into the others.
 *
 * Allowlisted / excluded from the drift check:
 *   - effects.*          — freeform per schema (additionalProperties: true)
 *   - *Position boxes    — sub-keys (top/left/right/center) legitimately vary
 *   - name, description  — intentionally unique per theme
 *
 * Usage: node scripts/check-themes.mjs   (exit 0 = all themes consistent)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTheme } from "../engine.js";

const CAROUSEL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_DIR = path.join(CAROUSEL_ROOT, "themes");

function leafPaths(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (p === "name" || p === "description") continue;
    if (p.startsWith("effects")) continue;
    if (k.endsWith("Position")) {
      out.push(p);
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...leafPaths(v, p));
    else out.push(p);
  }
  return out;
}

async function main() {
  const files = (await fs.readdir(THEMES_DIR)).filter((f) => f.endsWith(".theme.json"));
  if (!files.length) {
    console.error("No theme files found in", THEMES_DIR);
    process.exit(1);
  }

  let failures = 0;
  const themes = new Map();

  // Pass 1: full validation per theme (schema + referenced files via engine.validateTheme)
  for (const f of files.sort()) {
    const theme = JSON.parse(await fs.readFile(path.join(THEMES_DIR, f), "utf8"));
    themes.set(f, theme);
    const { ok, errors } = await validateTheme(theme);
    if (!ok) {
      failures++;
      console.error(`❌ ${f}: validation failed`);
      for (const err of errors) {
        console.error(`  ${err}`);
      }
    } else {
      console.log(`✅ ${f}: valid`);
    }
  }

  // Pass 2: cross-theme drift check
  const sets = new Map([...themes.entries()].map(([f, t]) => [f, new Set(leafPaths(t))]));
  const union = new Set([...sets.values()].flatMap((s) => [...s]));
  let drift = 0;
  for (const [f, set] of sets) {
    const missing = [...union].filter((p) => !set.has(p));
    if (missing.length) {
      drift++;
      console.error(`❌ ${f}: missing fields present in sibling themes:`);
      for (const p of missing) console.error(`   • ${p}`);
    }
  }
  if (!drift) console.log(`✅ drift check: all ${files.length} themes define the same config fields`);

  if (failures || drift) {
    console.error(`\n${failures + drift} problem(s) found`);
    process.exit(1);
  }
  console.log("\nAll themes consistent.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

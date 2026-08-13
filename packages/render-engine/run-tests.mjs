#!/usr/bin/env node
/**
 * Test runner wrapper.
 *
 * Playwright browsers are installed locally in node_modules (via
 * `PLAYWRIGHT_BROWSERS_PATH=0`). This wrapper ensures the renderer tests can
 * find those browsers without requiring a global Playwright cache.
 */
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

const result = spawnSync("node", ["--test", "dist/**/*.test.js"], {
  stdio: "inherit",
  shell: true,
  cwd: here,
});

process.exit(result.status ?? 1);

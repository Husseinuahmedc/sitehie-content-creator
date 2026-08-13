/**
 * Shared HTML utility functions for render-engine.
 *
 * Kept narrowly scoped so rendering logic never calls fs or HTML helpers
 * ad-hoc. These are the same primitives historically used by the old engine.
 */

/** Escape HTML special characters to prevent XSS and markup corruption. */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replace the first occurrence of `needle` in `haystack` with `replacement`.
 * Logs a warning if the needle is not found (silent template breakage detection).
 */
export function replaceOnce(haystack: string, needle: string, replacement: string): string {
  const i = haystack.indexOf(needle);
  if (i === -1) {
    console.warn(
      `[render-engine] replaceOnce: needle not found — ${needle.slice(0, 60)}${needle.length > 60 ? "…" : ""}`
    );
    return haystack;
  }
  return haystack.slice(0, i) + replacement + haystack.slice(i + needle.length);
}

/** Escape a string for use in a RegExp. */
export function escapeRegExp(str: string): string {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

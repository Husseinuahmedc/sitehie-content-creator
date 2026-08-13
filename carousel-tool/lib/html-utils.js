/**
 * Shared HTML utility functions for carousel-tool.
 * Used by engine.js, highlight.js, render.js (Node-side only).
 */

/** Escape HTML special characters to prevent XSS and markup corruption. */
export function escapeHtml(str) {
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
export function replaceOnce(haystack, needle, replacement) {
  const i = haystack.indexOf(needle);
  if (i === -1) {
    console.warn(`[carousel-tool] replaceOnce: needle not found — ${needle.slice(0, 60)}${needle.length > 60 ? "…" : ""}`);
    return haystack;
  }
  return haystack.slice(0, i) + replacement + haystack.slice(i + needle.length);
}

/** Escape a string for use in a RegExp. */
export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

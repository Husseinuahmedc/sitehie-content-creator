/**
 * Build-time syntax highlighting via Prism.
 *
 * Runs in Node before HTML injection so rendered slides stay fully
 * self-contained (no client-side highlighter, no network). The output
 * uses Prism's standard `token <type>` classes, which the code-slide
 * template maps onto theme colors.
 */
import Prism from "prismjs";
import loadLanguages from "prismjs/components/index.js";
import { escapeHtml } from "./html-utils.js";

// Load the languages we support in the Studio language picker.
// loadLanguages() resolves cross-dependencies (e.g. tsx → jsx → typescript).
loadLanguages([
  "markup",
  "css",
  "clike",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "bash",
  "python",
  "sql",
  "yaml",
  "docker",
  "go",
  "rust",
  "graphql",
  "markdown",
  "regex",
]);

/** Canonical aliases → Prism grammar keys. */
const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  py: "python",
  python3: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
  dockerfile: "docker",
  golang: "go",
  rs: "rust",
  html: "markup",
  xml: "markup",
  svg: "markup",
  md: "markdown",
  plaintext: "",
  text: "",
  none: "",
};

/**
 * Resolve a user-provided language tag to an available Prism grammar key,
 * or "" when highlighting should be skipped (unknown / plain text).
 */
export function resolveLanguage(language: string | undefined): string {
  const raw = String(language || "javascript").trim().toLowerCase();
  const aliased = LANG_ALIASES[raw] ?? raw;
  if (!aliased) return "";
  return Prism.languages[aliased] ? aliased : "";
}

/**
 * Highlight `code` and return HTML with Prism token spans.
 * Falls back to escaped plain text for unknown languages.
 */
export function highlightCodeToHtml(code: string, language?: string): string {
  const source = String(code || "");
  const lang = resolveLanguage(language);
  if (!lang) return escapeHtml(source);
  try {
    return Prism.highlight(source, Prism.languages[lang], lang);
  } catch {
    return escapeHtml(source);
  }
}

/** Languages offered by the Studio code editor (canonical keys + labels). */
export const SUPPORTED_LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "jsx", label: "JSX" },
  { id: "tsx", label: "TSX" },
  { id: "python", label: "Python" },
  { id: "bash", label: "Bash / Shell" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "docker", label: "Dockerfile" },
  { id: "sql", label: "SQL" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "css", label: "CSS" },
  { id: "markup", label: "HTML / XML" },
  { id: "graphql", label: "GraphQL" },
  { id: "markdown", label: "Markdown" },
];

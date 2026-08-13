/**
 * Lightweight SVG sanitizer — strips scripts, event handlers, and dangerous
 * URLs from SVG strings before rendering via dangerouslySetInnerHTML.
 *
 * This is NOT a full HTML sanitizer. It's purpose-built for trusted-but-varied
 * icon SVGs that come from the local carousel-tool asset library.
 */

const FORBIDDEN_TAGS = /<\s*(script|foreignObject|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi;
const SELF_CLOSING_FORBIDDEN = /<\s*(script|foreignObject|iframe|object|embed|form)\b[^>]*\/?\s*>/gi;

const EVENT_ATTRS = /\s+on[a-z]+=(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const DANGEROUS_URLS = /url\s*\(\s*['"]?\s*(?:javascript|data(?!:image\/svg)):.*?\)/gi;
const JS_URL_ATTRS = /\s+(?:href|src|action|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi;

const STRIP_TAGS = /<\s*(?:meta|style|title)\b[^>]*\/?\s*>/gi;

export function sanitizeSvg(svg: string): string {
  let clean = svg;
  clean = clean.replace(FORBIDDEN_TAGS, "");
  clean = clean.replace(SELF_CLOSING_FORBIDDEN, "");
  clean = clean.replace(STRIP_TAGS, "");
  clean = clean.replace(EVENT_ATTRS, "");
  clean = clean.replace(DANGEROUS_URLS, "");
  clean = clean.replace(JS_URL_ATTRS, "");
  return clean;
}

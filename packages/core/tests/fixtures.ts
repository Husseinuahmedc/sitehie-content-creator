async function loadJson<T = unknown>(relativePath: string): Promise<T> {
  const url = new URL(relativePath, import.meta.url);
  const module = await import(url.href, { with: { type: "json" } });
  return module.default as T;
}

export async function loadThemeSchema(): Promise<object> {
  return loadJson("../../../../carousel-tool/themes/theme.schema.json");
}

export async function loadTheme(name: string): Promise<object> {
  return loadJson(`../../../../carousel-tool/themes/${name}.theme.json`);
}

export async function loadEpisode(name: string): Promise<object> {
  return loadJson(`../../../../carousel-tool/content/${name}.json`);
}

export function listThemeNames(): string[] {
  return ["default", "light", "cyberpunk", "warm-cream-clay", "alt-claymorphism"];
}

export function listEpisodeNames(): string[] {
  // _audit-test.json is intentionally prefixed with "_" for audit testing.
  return ["jsron", "_audit-test"];
}

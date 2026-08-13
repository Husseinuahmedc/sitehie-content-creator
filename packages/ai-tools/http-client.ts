/**
 * Low-level HTTP helpers shared by AI adapters.
 *
 * Adapters receive a `fetch` implementation via constructor options so tests
 * can inject mocks without starting real Ollama / OpenCode servers.
 */

export type Fetch = typeof fetch;

export async function fetchWithTimeout(
  fetchImpl: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP error ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

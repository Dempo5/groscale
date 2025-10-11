const API_BASE = import.meta.env.VITE_API_URL || "https://api.groscales.com";

/** Small helper to wait */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with timeout */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = 20000, ...rest } = init;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: ctrl.signal, mode: "cors" });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Warm-and-fetch: handles Render cold start by retrying politely.
 * Pass onStatus to surface nice UI messages ("Waking server…", etc).
 */
export async function getLeads(onStatus?: (s: string) => void) {
  const url = `${API_BASE}/api/leads?t=${Date.now()}`;

  // up to ~90s total (6 tries * (20s timeout + small waits))
  const maxTries = 6;
  let attempt = 0;

  while (attempt < maxTries) {
    attempt++;
    const label =
      attempt === 1
        ? "Contacting API…"
        : `Still waking the API (try ${attempt}/${maxTries})…`;
    onStatus?.(label);

    try {
      const res = await fetchWithTimeout(url, { timeoutMs: 20000 });

      // Render shows 503/522/524 while starting — retry those.
      if (!res.ok) {
        if ([502, 503, 504, 522, 524].includes(res.status)) {
          await sleep(1500);
          continue;
        }
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status} ${res.statusText} ${text}`);
      }

      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("API returned non-JSON");
      }
    } catch (err: any) {
      // AbortError => timed out; retry
      if (err?.name === "AbortError") {
        await sleep(1500);
        continue;
      }
      // Network / DNS hiccup — retry a couple times
      if (attempt < maxTries) {
        await sleep(1500);
        continue;
      }
      throw err;
    }
  }

  throw new Error("API is still starting. Please try again in a moment.");
}

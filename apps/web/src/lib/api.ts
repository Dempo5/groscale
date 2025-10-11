// apps/web/src/lib/api.ts
// Robust client for GroScales API: health check + retries + timeouts.

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "https://api.groscales.com";

const DEFAULT_TIMEOUT_MS = 12_000; // each request max 12s
const MAX_HEALTH_RETRIES = 8;      // ~90s worst-case for Render cold start
const BASE_DELAY_MS = 800;         // backoff start

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeout = DEFAULT_TIMEOUT_MS) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(input, { ...init, signal: ctl.signal, credentials: "omit" });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Waits until API responds healthy (/_health or /api/leads HEAD) with retries.
 */
export async function waitForApiReady(): Promise<void> {
  const healthUrls = [`${API_BASE}/_health`, `${API_BASE}/api/health`, `${API_BASE}/api/leads`];

  for (let attempt = 1; attempt <= MAX_HEALTH_RETRIES; attempt++) {
    for (const url of healthUrls) {
      try {
        const res = await fetchWithTimeout(url, { method: url.endsWith("/api/leads") ? "HEAD" : "GET" }, 6000);
        if (res.ok) return; // API is up
      } catch {
        // ignore and try next/again
      }
    }
    // exponential backoff with small jitter
    const delay = BASE_DELAY_MS * Math.pow(1.5, attempt - 1) + Math.random() * 150;
    // Provide a hook for the UI to optionally read status (optional custom event)
    window.dispatchEvent(new CustomEvent("groscale:api-waking", { detail: { attempt, delay } }));
    await sleep(delay);
  }

  throw new Error("API is still starting. Please try again in a moment.");
}

/**
 * Loads leads after ensuring the API is reachable.
 */
export async function getLeads() {
  await waitForApiReady();
  const res = await fetchWithTimeout(`${API_BASE}/api/leads`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fetch failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json() as Promise<Array<{ id: number; name: string; email: string }>>;
}

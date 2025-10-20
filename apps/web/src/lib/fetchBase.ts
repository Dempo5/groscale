import { BASE } from "./api";

// Patch global fetch so relative "/api/..." always uses BASE
const origFetch = window.fetch.bind(window);

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = typeof input === "string" ? input : String((input as URL));
    if (url.startsWith("/api/")) {
      return origFetch(`${BASE}${url}`, init);
    }
  } catch {}
  return origFetch(input as any, init);
};

console.info("[fetchBase] patch active ->", BASE);

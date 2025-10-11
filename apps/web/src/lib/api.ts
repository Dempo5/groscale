// apps/web/src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_URL || "https://groscale.onrender.com";

export async function getLeads() {
  const url = `${API_BASE}/api/leads`;
  const res = await fetch(url, { credentials: "omit" }); // omit is fine (no cookies)
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return res.json();
}

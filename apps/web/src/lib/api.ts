// apps/web/src/lib/api.ts
const API_BASE = "https://groscale.onrender.com"; // hard-code for reliability

export async function getLeads() {
  const res = await fetch(`${API_BASE}/api/leads`, {
    // no credentials; keeps CORS simple
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return res.json();
}
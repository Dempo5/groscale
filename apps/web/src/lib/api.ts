con// apps/web/src/lib/api.ts

// 🔒 For now, hardcode the API so we don't chase env issues.
const API_BASE = "https://groscale.onrender.com";

export async function getLeads() {
  const res = await fetch(`${API_BASE}/api/leads`, {
    // tell the browser this is a CORS request
    mode: "cors",
  });
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  return res.json();
}
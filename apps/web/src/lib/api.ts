// apps/web/src/lib/api.ts
const API_BASE = "https://groscale.onrender.com"; // your Render URL

export async function getLeads() {
  const res = await fetch(`${API_BASE}/api/leads`, {
    mode: "cors",
  });
  if (!res.ok) {
    throw new Error(`Load failed (${res.status})`);
  }
  return res.json();
}
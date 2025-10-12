// apps/web/src/lib/api.ts

export type Lead = {
  id: number;
  name: string;
  email: string;
};

const API_BASE =
  (import.meta as any)?.env?.VITE_API_URL?.replace(/\/$/, "") ||
  "https://groscale.onrender.com";

/** Returns demo leads from the API. */
export async function getLeads(): Promise<Lead[]> {
  const res = await fetch(`${API_BASE}/api/leads`, { credentials: "omit" });
  if (!res.ok) throw new Error(`Failed to fetch leads: ${res.status}`);
  return res.json();
}

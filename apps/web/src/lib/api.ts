// apps/web/src/lib/api.ts
export type Lead = { id: number; name: string; email: string };

const API_BASE =
  import.meta.env.VITE_API_URL ?? "https://groscale.onrender.com";

export async function getLeads(
  signal?: AbortSignal
): Promise<Lead[]> {
  const res = await fetch(`${API_BASE}/api/leads`, { signal, credentials: "include" });
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return res.json();
}

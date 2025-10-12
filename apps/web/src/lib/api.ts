// apps/web/src/lib/api.ts
export interface Lead {
  id: number;
  name: string;
  email: string;
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string) || "https://groscale.onrender.com";

export async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch(`${API_BASE}/api/leads`, {
    mode: "cors",
    credentials: "omit",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    // If CORS fails, browsers often surface an opaque response (status 0).
    throw new Error(`HTTP ${res.status || 0}`);
  }
  return (await res.json()) as Lead[];
}

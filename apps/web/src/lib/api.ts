// apps/web/src/lib/api.ts
export interface Lead {
  id: number;
  name: string;
  email: string;
}

const API_BASE =
  import.meta.env.VITE_API_URL?.toString() || 'https://groscale.onrender.com';

export async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch(`${API_BASE}/api/leads`, { credentials: 'omit' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<Lead[]>;
}

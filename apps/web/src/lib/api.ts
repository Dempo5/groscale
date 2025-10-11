// ---------- Base API ----------
const API_BASE =
  import.meta.env.VITE_API_URL || "https://api.groscales.com";

// ---------- Types ----------
export interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string;
  status?: string;
  tags?: string[];
}

export async function getLeads(): Promise<Lead[]> {
  const url = `${API_BASE}/api/leads`;
  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    throw new Error(`Leads fetch failed: ${res.status} ${res.statusText}`);
  }

  // Be defensive: sometimes servers send text by mistake
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Leads endpoint did not return JSON");
  }
}

// apps/web/src/lib/api.ts

// ----- Types -----
export type Lead = {
  id: string | number;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
};

export type UploadSummary = {
  ok: boolean;
  inserted: number;
  skipped: number;
  errors?: string[];
};

// ----- Helpers -----
async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const b = await res.json();
      msg = (b?.error || b?.message || msg) as string;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

// If your API is same-origin, leave base as empty string.
// If you set VITE_API_URL later, we can add it back.
const BASE = "";

// ----- Leads -----
export async function getLeads(): Promise<Lead[]> {
  const res = await fetch(`${BASE}/api/leads`, { credentials: "include" });
  return asJson<Lead[]>(res);
}

// ----- Uploads -----
export async function uploadLeads(file: File): Promise<UploadSummary> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/api/uploads/csv`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  return asJson<UploadSummary>(res);
}

// ----- Auth -----
export function logout(): void {
  localStorage.removeItem("jwt");
}

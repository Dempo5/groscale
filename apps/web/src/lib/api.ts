// apps/web/src/lib/api.ts

/**
 * Frontend API helpers — kept minimal and typed.
 * Uses relative paths so it works with a reverse proxy or same-origin dev.
 * If you need a fixed server URL, set VITE_API_URL and we’ll prefix with it.
 */

const API_BASE =
  (import.meta as any).env?.VITE_API_URL
    ? String((import.meta as any).env.VITE_API_URL).replace(/\/$/, "")
    : ""; // empty = same origin

// ---------- Types ----------
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
  sample?: Record<string, unknown>[];
};

// small fetch helper
async function j<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = (body && (body.error || body.message)) || msg;
    } catch (_) {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

// ---------- Leads ----------
export async function getLeads(): Promise<Lead[]> {
  // demo endpoint from the server; replace with real later
  return j<Lead[]>("/api/leads");
}

// ---------- Auth ----------
export function logout(): void {
  // keep it simple for now
  localStorage.removeItem("jwt");
}

// ---------- Uploads (CSV) ----------
/**
 * Upload a CSV file of leads.
 * Server route expected: POST /api/uploads/csv (multipart form-data)
 */
export async function uploadLeads(file: File): Promise<UploadSummary> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(API_BASE + "/api/uploads/csv", {
    method: "POST",
    body: fd,
    credentials: "include",
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = (body && (body.error || body.message)) || msg;
    } catch (_) {
      /* ignore */
    }
    throw new Error(msg);
  }

  return (await res.json()) as UploadSummary;
}

/**
 * Optional: list recent uploads (if you add this on the server)
 */
export type UploadRecord = {
  id: string;
  filename: string;
  rows: number;
  createdAt: string;
};

export async function listUploads(): Promise<UploadRecord[]> {
  return j<UploadRecord[]>("/api/uploads");
}

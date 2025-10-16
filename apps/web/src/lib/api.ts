// apps/web/src/lib/api.ts
// Web helpers. Auth hits the Render API via VITE_API_URL.
// Falls back to same-origin for local dev.

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

// -------- auth types --------
type AuthPayload = { email: string; password: string; name?: string };
type AuthResponse =
  | { token: string; user?: any }
  | { jwt: string; user?: any }
  | { accessToken: string; user?: any }
  | { error?: string };

// -------- config --------
const TOKEN_KEY = "jwt";
const BASE = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "";

// small fetch helper (JSON)
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// -------- token helpers --------
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}
export function isAuthed() { return !!getToken(); }

function normalizeToken(r: AuthResponse) {
  return (r as any).token || (r as any).jwt || (r as any).accessToken;
}

// -------- auth API --------
export async function register(payload: AuthPayload) {
  const r = await api<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const t = normalizeToken(r);
  if (!t) throw new Error("No token returned from /register");
  setToken(t);
  return r;
}

export async function login(payload: AuthPayload) {
  const r = await api<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const t = normalizeToken(r);
  if (!t) throw new Error("No token returned from /login");
  setToken(t);
  return r;
}

export async function logout() {
  clearToken();
  // Optional: await api("/api/auth/logout", { method: "POST" }).catch(()=>{});
}

// -------- leads (demo) --------
export async function getLeads(): Promise<Lead[]> {
  return api<Lead[]>("/api/leads", { method: "GET" });
}

// -------- uploads (CSV) --------
// Server route expected: POST /api/uploads  (field name: "file")
export async function uploadLeads(file: File): Promise<UploadSummary> {
  const url = `${BASE}/api/uploads`;
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(url, {
    method: "POST",
    body: fd,
    credentials: "include", // carry cookies if you add server auth later
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Upload failed: ${res.status}`);
  }
  return res.json() as Promise<UploadSummary>;
}

// --- Uploads API ---
export async function uploadLeads(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/uploads/import", { method: "POST", body: fd });
  if (!res.ok) {
    // Try to return structured error if server replies JSON
    try { return await res.json(); } catch {}
    throw new Error("Upload failed");
  }
  return await res.json(); // { ok, inserted, skipped, invalids?, errors? }
}

export async function getUploadHistory(): Promise<{
  id: string; filename: string; uploadedAt: string;
  leads: number; duplicates: number; invalids: number;
  status: "success"|"partial"|"failed"; downloadUrl?: string|null;
}[]> {
  const res = await fetch("/api/uploads/history");
  if (!res.ok) return []; // graceful fallback
  return await res.json();
}


// (Optional helpers you may call later; safe no-ops until endpoints exist)
export async function deleteAllLeads(): Promise<{ ok: boolean; removed?: number }> {
  const url = `${BASE}/api/uploads/all`;
  const res = await fetch(url, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => "Delete failed"));
  return res.json();
}
// alias if your page used a different name previously
export const uploadLeadsCsv = uploadLeads;

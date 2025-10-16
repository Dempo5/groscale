// apps/web/src/lib/api.ts
// Flat, safe helpers used across the web app.
// Works same-origin by default; add VITE_API_URL later if you need cross-origin.

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

type AuthPayload = { email: string; password: string; name?: string };
type AuthResponse =
  | { token: string; user?: any }
  | { jwt: string; user?: any }
  | { accessToken: string; user?: any };

const TOKEN_KEY = "jwt";

// keep same-origin by default; if you add an external API later,
// set VITE_API_URL in the web app's env and uncomment below.
// const BASE = import.meta.env.VITE_API_URL ?? "";
const BASE = "";

/* --------------------------------------------------------------- */
/* Token helpers                                                   */
/* --------------------------------------------------------------- */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/** Tiny auth check used by ProtectedRoute */
export function isAuthed(): boolean {
  const t = getToken();
  return !!t && t.length > 0;
}

/* --------------------------------------------------------------- */
/* Auth API                                                        */
/* --------------------------------------------------------------- */
export async function register(payload: AuthPayload) {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Register failed (${r.status})`);
  const data: AuthResponse = await r.json();
  const token = (data as any).token || (data as any).jwt || (data as any).accessToken;
  if (token) setToken(token);
  return data;
}

export async function login(payload: { email: string; password: string }) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Login failed (${r.status})`);
  const data: AuthResponse = await r.json();
  const token = (data as any).token || (data as any).jwt || (data as any).accessToken;
  if (token) setToken(token);
  return data;
}

export function logout() {
  clearToken();
}

/* --------------------------------------------------------------- */
/* Leads (demo list for now; replace with your real API soon)      */
/* --------------------------------------------------------------- */
export async function getLeads(): Promise<Lead[]> {
  const r = await fetch(`${BASE}/api/leads`, {
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`getLeads failed (${r.status})`);
  return r.json();
}

/* --------------------------------------------------------------- */
/* Uploads (CSV)                                                   */
/* --------------------------------------------------------------- */
export async function uploadLeads(file: File): Promise<UploadSummary> {
  const fd = new FormData();
  fd.append("file", file);

  const r = await fetch(`${BASE}/api/uploads/csv`, {
    method: "POST",
    headers: authHeaders(/* no content-type for FormData */),
    body: fd,
  });

  if (!r.ok) {
    const msg = await safeText(r);
    throw new Error(`Upload failed (${r.status}) ${msg ? "- " + msg : ""}`);
  }
  return r.json();
}

/* --------------------------------------------------------------- */
/* Utils                                                           */
/* --------------------------------------------------------------- */
function authHeaders(init?: Record<string, string>) {
  const h: Record<string, string> = { ...(init || {}) };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

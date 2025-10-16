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

// small fetch helper
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
  // optional server logout could be added here later
}

// -------- demo leads (unchanged) --------
export async function getLeads(): Promise<Lead[]> {
  return api<Lead[]>("/api/leads", { method: "GET" });
}

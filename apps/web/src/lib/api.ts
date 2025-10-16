// apps/web/src/lib/api.ts
// Flat, safe helpers used across the web app.
// Uses VITE_API_URL to hit the Render API. Falls back to same-origin for local dev.

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

// ---------- auth types ----------
type AuthPayload = { email: string; password: string; name?: string };
type AuthResponse =
  | { token: string; user?: any }
  | { jwt: string; user?: any }
  | { accessToken: string; user?: any }
  | { error?: string };

// ---------- config ----------
const TOKEN_KEY = "jwt";

// If you set VITE_API_URL in Vercel, we’ll use it. Otherwise same-origin (local dev).
const BASE = import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "";

// Small fetch helper that always JSONs and throws on !ok
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include", // not harmful; CORS allows this in your server
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------- token helpers ----------
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

export function isAuthed() {
  return !!getToken();
}

// Extract a token from any of the common fields we might get back
function normalizeToken(r: AuthResponse): string | undefined {
  return (
    (r as any).token ||
    (r as any).jwt ||
    (r as any).accessToken ||
    undefined
  );
}

// ---------- auth APIs ----------
export async function register(payload: AuthPayload) {
  const r = await api<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const token = normalizeToken(r);
  if (!token) throw new Error("No token returned from /register");
  setToken(token);
  return r;
}

export async function login(payload: AuthPayload) {
  const r = await api<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const token = normalizeToken(r);
  if (!token) throw new Error("No token returned from /login");
  setToken(token);
  return r;
}

export async function logout() {
  clearToken();
  // Optional: if you add a server logout route later:
  // await api("/api/auth/logout", { method: "POST" });
}

// ---------- existing demo APIs ----------
export async function getLeads(): Promise<Lead[]> {
  return api<Lead[]>("/api/leads", { method: "GET" });
}

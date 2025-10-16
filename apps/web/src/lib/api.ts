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
const BASE = ""; // same-origin; if you later set VITE_API_URL, change to import.meta.env.VITE_API_URL ?? ""

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

export function isAuthed(): boolean {
  return !!getToken();
}

// ---------- fetch helpers ----------
async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j: any = await res.json();
      msg = (j?.error || j?.message || msg) as string;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function authHeaders(): HeadersInit {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { ...authHeaders() },
  });
  return asJson<T>(res);
}

async function apiPost<T>(url: string, body: any, isFormData = false): Promise<T> {
  const headers: HeadersInit = { ...authHeaders() };
  const init: RequestInit = {
    method: "POST",
    credentials: "include",
    headers,
    body: isFormData ? body : JSON.stringify(body),
  };
  if (!isFormData) (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  const res = await fetch(url, init);
  return asJson<T>(res);
}

// ---------- auth ----------
export async function login(email: string, password: string) {
  const data = await apiPost<AuthResponse>(`${BASE}/api/auth/login`, { email, password } satisfies AuthPayload);
  const token = (data as any).token || (data as any).jwt || (data as any).accessToken;
  if (typeof token === "string" && token.length > 0) setToken(token);
  return data;
}

export async function register(name: string, email: string, password: string) {
  const data = await apiPost<AuthResponse>(`${BASE}/api/auth/register`, { name, email, password } satisfies AuthPayload);
  const token = (data as any).token || (data as any).jwt || (data as any).accessToken;
  if (typeof token === "string" && token.length > 0) setToken(token);
  return data;
}

export function logout(): void {
  clearToken();
}

// ---------- leads ----------
export async function getLeads(): Promise<Lead[]> {
  return apiGet<Lead[]>(`${BASE}/api/leads`);
}

// ---------- uploads ----------
export async function uploadLeads(file: File): Promise<UploadSummary> {
  const fd = new FormData();
  fd.append("file", file);
  return apiPost<UploadSummary>(`${BASE}/api/uploads/csv`, fd, true);
}

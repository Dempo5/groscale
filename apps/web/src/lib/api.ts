// Flat, safe helpers used across the web app.
// Uses same-origin in dev, explicit VITE_API_URL in prod.

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
  duplicates?: number;
  invalids?: number;
  errors?: string[];
};

type AuthPayload = { email: string; password: string; name?: string };
type AuthResponse =
  | { token: string; user?: any }
  | { jwt: string; user?: any }
  | { accessToken: string; user?: any };

const TOKEN_KEY = "jwt";

/**
 * In dev (Vite) we’ll run the API on the same origin.
 * In prod (Vercel), set VITE_API_URL to your Render domain.
 */
const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "";

// -------- token helpers --------
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

// Small fetch wrapper that attaches auth automatically
async function http<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const url = `${BASE}${path}`;
  const headers = new Headers(opts.headers || {});
  if (!headers.has("Content-Type") && opts.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...opts, headers, credentials: "include" });
  if (!res.ok) {
    // bubble minimal error info for UI
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }
  // try json, fall back to text
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : (res.text() as any)) as T;
}

// -------- auth API --------
export async function register(p: AuthPayload): Promise<AuthResponse> {
  const data = await http<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(p),
  });
  // normalize token field
  const token =
    (data as any).token ||
    (data as any).jwt ||
    (data as any).accessToken ||
    "";
  if (token) setToken(token);
  return data;
}

export async function login(p: AuthPayload): Promise<AuthResponse> {
  const data = await http<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(p),
  });
  const token =
    (data as any).token ||
    (data as any).jwt ||
    (data as any).accessToken ||
    "";
  if (token) setToken(token);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await http("/api/auth/logout", { method: "POST" });
  } finally {
    clearToken();
  }
}

// --- auth state helper (used by ProtectedRoute, etc.) ---
export function isAuthed(): boolean {
  return !!getToken();
}


// -------- leads (demo) --------
export async function getLeads(): Promise<Lead[]> {
  return http<Lead[]>("/api/leads");
}

// -------- uploads (page you added) --------
export async function uploadLeads(
  file: File
): Promise<UploadSummary> {
  const form = new FormData();
  form.append("file", file);
  return http<UploadSummary>("/api/uploads/import", {
    method: "POST",
    body: form, // leave browser to set multipart boundary
    // do not set Content-Type manually
  });
}

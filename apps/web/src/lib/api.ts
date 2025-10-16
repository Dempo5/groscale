// apps/web/src/lib/api.ts
// Flat, safe helpers used across the web app.
// Works same-origin by default; add VITE_API_URL later if you need cross-origin.

export type Lead = {
  id: string | number;
  name?: string;
  email?: string;
  phone?: string | null;
  createdAt?: string;
};

export type UploadSummary = {
  ok: boolean;
  inserted: number;
  duplicates: number;
  invalids: number;   // <-- keep this name; UI expects it
  skipped: number;
  errors?: string[];
};

type AuthPayload = { email: string; password: string; name?: string };
type AuthResponse =
  | { token: string; user?: any }
  | { jwt: string; user?: any }
  | { accessToken: string; user?: any };

const TOKEN_KEY = "jwt";
const BASE = ""; // same-origin; if you later set VITE_API_URL, switch to import.meta.env.VITE_API_URL ?? ""

/* ---------------- token helpers ---------------- */
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

/* ---------------- auth ---------------- */
async function consumeAuth(res: Response) {
  if (!res.ok) throw new Error(`${res.status}`);
  const data: any = await res.json();
  const token =
    (data as AuthResponse).token ??
    (data as any).jwt ??
    (data as any).accessToken ??
    "";
  if (token) setToken(token);
  return data;
}

export async function register(payload: AuthPayload) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return consumeAuth(res);
}

export async function login(payload: AuthPayload) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return consumeAuth(res);
}

export function logout() {
  clearToken();
}

/* ---------------- leads (demo) ---------------- */
export async function getLeads(): Promise<Lead[]> {
  // backed by server /api/leads (public demo route)
  const res = await fetch(`${BASE}/api/leads`);
  if (!res.ok) {
    // fallback demo data so UI still renders
    return [
      { id: 1, name: "Test Lead", email: "lead@example.com" },
      { id: 2, name: "Demo Lead", email: "demo@example.com" },
    ];
  }
  return res.json();
}

/* ---------------- uploads ---------------- */
export async function uploadLeads(file: File): Promise<UploadSummary> {
  const fd = new FormData();
  fd.append("file", file);

  const token = getToken();
  const res = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.error) msg = String(err.error);
    } catch {}
    return {
      ok: false,
      inserted: 0,
      duplicates: 0,
      invalids: 0,
      skipped: 0,
      errors: [msg],
    };
  }

  const data: any = await res.json();

  // Normalize/guard fields
  return {
    ok: !!data.ok,
    inserted: Number(data.inserted ?? 0),
    duplicates: Number(data.duplicates ?? 0),
    invalids: Number(data.invalids ?? 0),
    skipped: Number(data.skipped ?? 0),
    errors: Array.isArray(data.errors) ? data.errors : undefined,
  };
}

// apps/web/src/lib/api.ts
import { setToken, clearToken, getToken } from "./auth";
export { getToken } from "./auth"; // keep older imports working

type User = { id: string; email: string; name?: string | null };

const API_BASE =
  (import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ||
    "https://groscale.onrender.com"); // fallback to your Render URL

export type Lead = {
  id: string | number;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
};

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers as HeadersInit);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers, credentials: "omit" });
  const text = await res.text().catch(() => "");

  if (res.status === 401) {
    clearToken();
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    // try to parse server {error:"..."} shape first
    try {
      const j = JSON.parse(text);
      throw new Error(j?.error || `Request failed: ${res.status}`);
    } catch {
      throw new Error(text || `Request failed: ${res.status}`);
    }
  }

  return (text ? JSON.parse(text) : {}) as T;
}

/* ---------------- AUTH ---------------- */

// Use the server contract { token, user } and save token
export async function register(email: string, password: string, name?: string) {
  const data = await request<{ token: string; user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  setToken(data.token);
  return data;
}

export async function login(email: string, password: string) {
  const data = await request<{ token: string; user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe() {
  return request<{ user: User }>("/api/auth/me");
}

export function logout() {
  clearToken();
}

export function isAuthed() {
  return Boolean(getToken());
}

/* ---------------- LEADS ---------------- */

export function getLeads() {
  return request<Lead[]>("/api/leads");
}

// For Dashboard.tsx which imports listLeads
export const listLeads = getLeads;

export function createLead(input: { name: string; email: string; phone?: string }) {
  return request<Lead>("/api/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
// ADD near your other exports in apps/web/src/lib/api.ts

export async function importLeads(rows: Array<Record<string, any>>) {
  // If you already have `request<T>()` helper with auth headers, you can use it:
  // return request<{ok:true; created:number; updated:number; skipped:number}>("/api/uploads/import", {
  //   method: "POST",
  //   body: JSON.stringify({ rows }),
  // });

// apps/web/src/lib/api.ts  — add this at the bottom with your other exports
export async function uploadLeads(payload: { csv?: string; leads?: any[] }) {
  return request<{ ok: boolean; normalizedCount: number }>("/api/uploads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


  // Otherwise, do it raw to avoid breaking anything:
  const token = getToken?.() || localStorage.getItem("token");
  const res = await fetch(`${API_BASE}/api/uploads/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ rows }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: true; created: number; updated: number; skipped: number }>;
}

// apps/web/src/lib/api.ts
import { authHeader, setToken, clearToken, getToken } from "./auth";

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "https://api.groscales.com";

export type Lead = { id: number; name: string; email: string };

// generic fetch
async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...(opts.headers || {}),
    },
  });

  if (res.status === 401) {
    clearToken();
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// AUTH
export async function register(name: string, email: string, password: string) {
  return request<{ ok: true }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function login(email: string, password: string) {
  const data = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export function logout() {
  clearToken();
}

export function isAuthed() {
  return Boolean(getToken());
}

// LEADS
export function getLeads() {
  return request<Lead[]>("/api/leads");
}

// apps/web/src/lib/api.ts
import { setToken, clearToken, getToken } from "./auth";
export { getToken } from "./auth"; // <-- re-export to keep older imports working
type User = { id: string; email: string; name?: string | null };

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "https://api.groscales.com";

export type Lead = { id: number; name: string; email: string };

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers as HeadersInit);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    throw new Error("Unauthorized");
    // optionally: location.assign('/login');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  // most endpoints return JSON; if you add file downloads later, branch here
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
export async function getMe() {
  return request<{ user: User }>("/api/auth/me");
}

export async function createLead(input: { name: string; email: string; phone?: string }) {
  return request("/api/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export type Lead = { id: number; name: string; email: string };

const API_BASE =
  (import.meta as any)?.env?.VITE_API_URL?.replace(/\/$/, "") ||
  "https://groscale.onrender.com";

const TOKEN_KEY = "gs_token";
export function setToken(t: string | null) {
  if (!t) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, t);
}
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export async function getLeads(): Promise<Lead[]> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`${API_BASE}/api/leads`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch leads: ${res.status}`);
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json(); // { token }
  if (data?.token) setToken(data.token);
  return data;
}

export async function register(name: string, email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  return res.json();
}

export function logout() { setToken(null); }

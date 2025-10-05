export type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: "NEW" | "CONTACTED" | "BOOKED";
  tags: string[];
};

export type Message = {
  id: string;
  leadId: string;
  from: "me" | "them";
  text: string;
  at: string; // ISO string
};

// In dev: BASE = "" so Vite proxy sends /api/* -> http://localhost:4000
// In prod: set VITE_API_BASE to https://api.groscales.com (or your API)
const BASE = import.meta.env.VITE_API_BASE ?? "";

let TOKEN: string | null = null;
export function setToken(t: string | null) { TOKEN = t; }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("/api") ? (BASE + path) : path;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...init,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// AUTH (optional if your backend supports it)
export const login = (email: string, password: string) =>
  api<{ token: string; user: { id: string; role: string } }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

// LEADS
export const getLeads = () => api<Lead[]>("/api/leads");

export const updateLead = (id: string, data: Partial<Lead>) =>
  api<Lead>(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

// MESSAGES
export const getThread = (leadId: string) =>
  api<Message[]>(`/api/messages/thread/${leadId}`);

export const sendMessage = (leadId: string, text: string) =>
  api<Message>(`/api/messages/send`, {
    method: "POST",
    body: JSON.stringify({ leadId, text }),
  });

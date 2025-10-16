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

// ---- phone numbers ----

export type SearchNumbersParams = {
  country?: string;      // default US
  areaCode?: string;     // e.g. "949"
  contains?: string;     // e.g. "555"
  sms?: boolean;         // default true
  mms?: boolean;         // default false
  voice?: boolean;       // default false
  limit?: number;        // default 20
};

export async function searchNumbers(params: SearchNumbersParams = {}) {
  const q = new URLSearchParams();
  if (params.country) q.set("country", params.country);
  if (params.areaCode) q.set("areaCode", params.areaCode);
  if (params.contains) q.set("contains", params.contains);
  if (params.sms !== undefined) q.set("sms", String(params.sms));
  if (params.mms !== undefined) q.set("mms", String(params.mms));
  if (params.voice !== undefined) q.set("voice", String(params.voice));
  if (params.limit) q.set("limit", String(params.limit));
  const res = await fetch(`/api/numbers/available?${q.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json() as Promise<{ ok: true; data: any[] } | { ok: false; error: string }>;
}

export async function purchaseNumber(input: {
  country: string;
  phoneNumber: string;
  makeDefault?: boolean;
  messagingServiceSid?: string;
}) {
  const res = await fetch(`/api/numbers/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Purchase failed (${res.status})`);
  return res.json() as Promise<{ ok: boolean; error?: string; number?: any }>;
}

// ---------- Phone numbers API ----------

export type SearchNumbersParams = {
  country: string;
  areaCode?: string;
  contains?: string;
  sms?: boolean;
  mms?: boolean;
  voice?: boolean;
  limit?: number;
};

export async function searchNumbers(params: SearchNumbersParams) {
  const p = new URLSearchParams();
  p.set("country", params.country);
  if (params.areaCode) p.set("areaCode", params.areaCode);
  if (params.contains) p.set("contains", params.contains);
  if (params.sms) p.set("sms", "true");
  if (params.mms) p.set("mms", "true");
  if (params.voice) p.set("voice", "true");
  if (params.limit != null) p.set("limit", String(params.limit));

  // GET /api/numbers/available
  const r = await fetch(`/api/numbers/available?${p.toString()}`, {
    credentials: "include",
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return (await r.json()) as {
    ok: boolean;
    data?: Array<{
      friendlyName?: string | null;
      phoneNumber: string;
      locality?: string | null;
      region?: string | null;
      isoCountry?: string;
      postalCode?: string | null;
      capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean };
    }>;
    error?: string;
  };
}

export async function purchaseNumber(input: {
  country: string;
  phoneNumber: string;
  makeDefault?: boolean;
  messagingServiceSid?: string;
}) {
  // POST /api/numbers/purchase
  const r = await fetch(`/api/numbers/purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return (await r.json()) as {
    ok: boolean;
    number?: {
      sid: string;
      number: string;
      friendlyName?: string | null;
      capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean };
      isDefault?: boolean;
    };
    error?: string;
  };
}
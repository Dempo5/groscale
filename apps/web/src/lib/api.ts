// Flat, safe helpers used across the web app.
// Same-origin in dev. In prod, set VITE_API_URL to your server origin (no trailing slash).

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
  // number UI should show in the "LEADS" column
  leads?: number;
};

type AuthPayload = { email: string; password: string; name?: string };
type AuthResponse =
  | { token: string; user?: any }
  | { jwt: string; user?: any }
  | { accessToken: string; user?: any };

const TOKEN_KEY = "jwt";

// ---- Base URL: empty = same-origin. In prod set VITE_API_URL (e.g. https://YOUR-SERVER)
const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || "";

/* ---------------- token helpers ---------------- */
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string) { try { localStorage.setItem(TOKEN_KEY, token); } catch {} }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch {} }
export function isAuthed(): boolean { return !!getToken(); }

/* ---------------- fetch helper ---------------- */
async function http<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const url = `${BASE}${path}`;
  const headers = new Headers(opts.headers || {});
  if (!headers.has("Content-Type") && opts.body && !(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...opts, headers, credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : (res.text() as any)) as T;
}

/* ---------------- auth ---------------- */
export async function register(p: AuthPayload): Promise<AuthResponse> {
  const data = await http<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(p),
  });
  const token = (data as any).token || (data as any).jwt || (data as any).accessToken || "";
  if (token) setToken(token);
  return data;
}
export async function login(p: AuthPayload): Promise<AuthResponse> {
  const data = await http<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(p),
  });
  const token = (data as any).token || (data as any).jwt || (data as any).accessToken || "";
  if (token) setToken(token);
  return data;
}
export async function logout(): Promise<void> {
  try { await http("/api/auth/logout", { method: "POST" }); } finally { clearToken(); }
}

/* ---------------- leads (demo) ---------------- */
export async function getLeads(): Promise<Lead[]> {
  return http<Lead[]>("/api/leads");
}

/* ---------------- uploads ---------------- */
export async function uploadLeads(file: File): Promise<UploadSummary> {
  const form = new FormData();
  form.append("file", file);

  const data = await http<any>("/api/uploads/import", { method: "POST", body: form });

  const leads =
    data?.stats?.validRows ??
    data?.stats?.totalRows ??
    (typeof data?.inserted === "number" &&
     typeof data?.duplicates === "number" &&
     typeof data?.invalids === "number"
       ? data.inserted + data.duplicates + data.invalids
       : undefined);

  return {
    ok: !!data?.ok,
    inserted: data?.inserted ?? 0,
    skipped: data?.skipped ?? 0,
    duplicates: data?.duplicates ?? 0,
    invalids: data?.invalids ?? 0,
    errors: data?.errors ?? [],
    leads,
  };
}

/* ---- mapped upload (wizard) ---- */
export type CsvMapping = {
  name?: string; first?: string; last?: string; email?: string; phone?: string;
  tags?: string; note?: string; city?: string; state?: string; zip?: string;
  address?: string; dob?: string;
};

export async function uploadLeadsMapped(
  file: File,
  mapping: CsvMapping,
  opts?: { ignoreDuplicates?: boolean; tags?: string[]; workflowId?: string }
): Promise<UploadSummary & { meta?: any; stats?: any; confidence?: any }> {
  const form = new FormData();
  form.append("file", file);
  form.append("mapping", JSON.stringify(mapping || {}));
  form.append("options", JSON.stringify(opts || {}));
  return http<UploadSummary & { meta?: any; stats?: any; confidence?: any }>(
    "/api/uploads/import",
    { method: "POST", body: form }
  );
}

/* ---------------- phone numbers ---------------- */
export type SearchNumbersParams = {
  country?: string; areaCode?: string; contains?: string;
  sms?: boolean; mms?: boolean; voice?: boolean; limit?: number;
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
  return http<{ ok: true; data: any[] } | { ok: false; error: string }>(
    `/api/numbers/available?${q.toString()}`
  );
}
export async function purchaseNumber(input: {
  country: string; phoneNumber: string; makeDefault?: boolean; messagingServiceSid?: string;
}) {
  return http<{ ok: boolean; error?: string; number?: any }>(
    "/api/numbers/purchase",
    { method: "POST", body: JSON.stringify(input) }
  );
}
export async function listMyNumbers() {
  return http<{ ok: boolean; data: any[] }>(`/api/numbers/mine`);
}
export async function setDefaultNumber(sid: string) {
  return http<{ ok: boolean }>(`/api/numbers/default`, {
    method: "POST", body: JSON.stringify({ sid }),
  });
}

/* ---------------- workflows (server-first, LS fallback) ---------------- */
export type Workflow = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
  createdAt: string;
  updatedAt: string;
};

const WF_LS_KEY = "gs_workflows";
function lsRead(): Workflow[] {
  try { const raw = localStorage.getItem(WF_LS_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function lsWrite(rows: Workflow[]) { try { localStorage.setItem(WF_LS_KEY, JSON.stringify(rows)); } catch {} }
function lsCreate(input: { name: string }): Workflow {
  const now = new Date().toISOString();
  const row: Workflow = { id: `wf_${Date.now()}`, name: input.name || "Untitled workflow", status: "draft", createdAt: now, updatedAt: now };
  const cur = lsRead(); lsWrite([row, ...cur]); return row;
}
function lsUpdate(id: string, patch: Partial<Workflow>): Workflow {
  const cur = lsRead();
  const idx = cur.findIndex((w) => w.id === id);
  if (idx === -1) return lsCreate({ name: patch.name || "Untitled workflow" });
  const updated: Workflow = { ...cur[idx], ...patch, updatedAt: new Date().toISOString() };
  const next = [...cur]; next[idx] = updated; lsWrite(next); return updated;
}

export async function listWorkflows(): Promise<Workflow[]> {
  try {
    const res = await http<any>("/api/workflows");
    return Array.isArray(res) ? (res as Workflow[]) : (res?.data ?? []);
  } catch { return lsRead(); }
}
export async function createWorkflow(input: { name: string }): Promise<Workflow> {
  try {
    const res = await http<any>("/api/workflows", { method: "POST", body: JSON.stringify(input) });
    return (res?.data ?? res) as Workflow;
  } catch { return lsCreate(input); }
}
export async function updateWorkflow(id: string, patch: Partial<Workflow>): Promise<Workflow> {
  try {
    const res = await http<any>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    return (res?.data ?? res) as Workflow;
  } catch { return lsUpdate(id, patch); }
}

/* Full object with steps, if your Workflows page needs it */
export async function listWorkflowsFull() {
  return http(`/api/workflows?full=1`);
}

/* ---------------- copilot (draft assistant) ---------------- */
export type CopilotDraftRequest = {
  lastMessage: string; tone?: "friendly" | "neutral" | "formal" | "casual"; goal?: string;
};
export type CopilotDraftResponse = { ok: boolean; draft?: string; error?: string; meta?: Record<string, any>; };
export async function copilotDraft(input: CopilotDraftRequest, opts?: { signal?: AbortSignal }): Promise<CopilotDraftResponse> {
  return http<CopilotDraftResponse>("/api/copilot/draft", { method: "POST", body: JSON.stringify(input), signal: opts?.signal });
}

/* ---------------- tags ---------------- */

/** Color can be any hex (e.g. "#10b981") or null */
export type TagDTO = {
  id: string;
  name: string;
  color?: string | null;
  workflowId?: string | null;
};

/** normalize helpers */
const normColor = (v: string | null | undefined): string | null =>
  typeof v === "string" && v.trim() ? v : null;
const normId = (v: string | "" | null | undefined): string | null =>
  typeof v === "string" && v.trim() ? v : null;

export async function getTags(): Promise<TagDTO[]> {
  const res = await http<{ ok: boolean; tags: TagDTO[] }>("/api/tags");
  return res.tags;
}
export async function listTags(): Promise<TagDTO[]> { return getTags(); }

export async function createTag(input: { name: string; color?: string | null; workflowId?: string | "" | null; }): Promise<TagDTO> {
  const body = { name: input.name, color: normColor(input.color ?? null), workflowId: normId(input.workflowId) };
  const res = await http<{ ok: boolean; tag: TagDTO }>("/api/tags", { method: "POST", body: JSON.stringify(body) });
  return res.tag;
}
export async function updateTag(
  id: string,
  patch: Partial<{ name: string; color: string | null; workflowId: string | "" | null; }>
): Promise<TagDTO> {
  const body: any = {};
  if (Object.prototype.hasOwnProperty.call(patch, "name")) body.name = patch.name;
  if (Object.prototype.hasOwnProperty.call(patch, "color")) body.color = normColor(patch.color ?? null);
  if (Object.prototype.hasOwnProperty.call(patch, "workflowId")) body.workflowId = normId(patch.workflowId ?? null);
  const res = await http<{ ok: boolean; tag: TagDTO }>(`/api/tags/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return res.tag;
}
export async function deleteTag(id: string): Promise<void> {
  await http<{ ok: boolean }>(`/api/tags/${id}`, { method: "DELETE" });
}

// apps/web/src/lib/api.ts
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
  leads?: number;
};

type AuthPayload = { email: string; password: string; name?: string };
type AuthResponse =
  | { token: string; user?: any }
  | { jwt: string; user?: any }
  | { accessToken: string; user?: any };

const TOKEN_KEY = "jwt";

// ---- Base URL: empty = same-origin. In prod set VITE_API_URL (e.g. https://groscale.onrender.com)
export const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "";

/* ---------------- token helpers ---------------- */
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}
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
  const data = await http<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(p) });
  const token = (data as any).token || (data as any).jwt || (data as any).accessToken || "";
  if (token) setToken(token);
  return data;
}
export async function login(p: AuthPayload): Promise<AuthResponse> {
  const data = await http<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(p) });
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
    (typeof data?.inserted === "number" && typeof data?.duplicates === "number" && typeof data?.invalids === "number"
      ? data.inserted + data.duplicates + data.invalids
      : undefined);
  return { ok: !!data?.ok, inserted: data?.inserted ?? 0, skipped: data?.skipped ?? 0, duplicates: data?.duplicates ?? 0, invalids: data?.invalids ?? 0, errors: data?.errors ?? [], leads };
}

export type CsvMapping = {
  name?: string; first?: string; last?: string; email?: string; phone?: string;
  tags?: string; note?: string; city?: string; state?: string; zip?: string; address?: string; dob?: string;
};

export async function uploadLeadsMapped(
  file: File, mapping: CsvMapping,
  opts?: { ignoreDuplicates?: boolean; tags?: string[]; workflowId?: string }
): Promise<UploadSummary & { meta?: any; stats?: any; confidence?: any }> {
  const form = new FormData();
  form.append("file", file);
  form.append("mapping", JSON.stringify(mapping || {}));
  form.append("options", JSON.stringify(opts || {}));
  return http<UploadSummary & { meta?: any; stats?: any; confidence?: any }>(
    "/api/uploads/import", { method: "POST", body: form }
  );
}

/* ---------------- phone numbers ---------------- */
export type SearchNumbersParams = {
  country?: string; areaCode?: string; contains?: string; sms?: boolean; mms?: boolean; voice?: boolean; limit?: number;
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
  return http<{ ok: true; data: any[] } | { ok: false; error: string }>(`/api/numbers/available?${q.toString()}`);
}
export async function purchaseNumber(input: { country: string; phoneNumber: string; makeDefault?: boolean; messagingServiceSid?: string; }) {
  return http<{ ok: boolean; error?: string; number?: any }>("/api/numbers/purchase", { method: "POST", body: JSON.stringify(input) });
}
export async function listMyNumbers() { return http<{ ok: boolean; data: any[] }>(`/api/numbers/mine`); }
export async function setDefaultNumber(sid: string) {
  return http<{ ok: boolean }>(`/api/numbers/default`, { method: "POST", body: JSON.stringify({ sid }) });
}

/* ---------------- workflows ---------------- */
export type Workflow = { id: string; name: string; status: "draft" | "active" | "paused"; createdAt: string; updatedAt: string; };
export type WfStep = { type: "SEND_TEXT"; textBody: string } | { type: "WAIT"; waitMs: number };
export async function listWorkflows(): Promise<Workflow[]> {
  const res = await http<any>("/api/workflows");
  return Array.isArray(res) ? (res as Workflow[]) : (res?.data ?? []);
}
export async function listWorkflowsFull() { return http<any>("/api/workflows?full=1"); }
export async function createWorkflow(input: { name: string }): Promise<Workflow> {
  const res = await http<any>("/api/workflows", { method: "POST", body: JSON.stringify(input) });
  return (res?.data ?? res) as Workflow;
}
export async function updateWorkflow(id: string, patch: Partial<Workflow>): Promise<Workflow> {
  const statusMap: any = { draft: "DRAFT", active: "ACTIVE", paused: "PAUSED" };
  const body: any = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.status !== undefined) body.status = statusMap[patch.status] || patch.status;
  const res = await http<any>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return (res?.data ?? res) as Workflow;
}
export async function replaceWorkflowSteps(id: string, steps: WfStep[]) {
  return http<any>(`/api/workflows/${id}/steps`, { method: "PUT", body: JSON.stringify({ steps }) });
}
export async function deleteWorkflow(id: string) { await http(`/api/workflows/${id}`, { method: "DELETE" }); }

/* ---------------- copilot ---------------- */
export type CopilotDraftRequest = { lastMessage: string; tone?: "friendly" | "neutral" | "formal" | "casual"; goal?: string; };
export type CopilotDraftResponse = { ok: boolean; draft?: string; error?: string; meta?: Record<string, any>; };
export async function copilotDraft(input: CopilotDraftRequest, opts?: { signal?: AbortSignal }): Promise<CopilotDraftResponse> {
  return http<CopilotDraftResponse>("/api/copilot/draft", { method: "POST", body: JSON.stringify(input), signal: opts?.signal });
}

/* ---------------- tags ---------------- */
export type TagColor = "red"|"orange"|"amber"|"green"|"teal"|"blue"|"indigo"|"violet"|"pink"|"gray";
type TagColorInput = TagColor | "" | null | undefined;
export type TagDTO = { id: string; name: string; color?: TagColor | null; workflowId?: string | null; };
const normColor = (v: TagColorInput): TagColor | null => typeof v === "string" && v.trim() !== "" ? (v as TagColor) : null;
const normId = (v: string | "" | null | undefined): string | null => typeof v === "string" && v.trim() !== "" ? v : null;

export async function getTags(): Promise<TagDTO[]> {
  const res = await http<{ ok: boolean; tags: TagDTO[] }>("/api/tags");
  return res.tags;
}
export async function listTags(): Promise<TagDTO[]> { return getTags(); }
export async function createTag(input: { name: string; color?: TagColorInput; workflowId?: string | "" | null; }): Promise<TagDTO> {
  const body = { name: input.name, color: normColor(input.color), workflowId: normId(input.workflowId) };
  const res = await http<{ ok: boolean; tag: TagDTO }>("/api/tags", { method: "POST", body: JSON.stringify(body) });
  return res.tag;
}
export async function updateTag(id: string, patch: Partial<{ name: string; color: TagColorInput; workflowId: string | "" | null; }>): Promise<TagDTO> {
  const body: any = {};
  if (Object.prototype.hasOwnProperty.call(patch, "name")) body.name = patch.name;
  if (Object.prototype.hasOwnProperty.call(patch, "color")) body.color = normColor(patch.color as TagColorInput);
  if (Object.prototype.hasOwnProperty.call(patch, "workflowId")) body.workflowId = normId(patch.workflowId as string | "" | null);
  const res = await http<{ ok: boolean; tag: TagDTO }>(`/api/tags/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return res.tag;
}
export async function deleteTag(id: string): Promise<void> { await http<{ ok: boolean }>(`/api/tags/${id}`, { method: "DELETE" }); }

// apps/web/src/lib/api.ts (add)
export async function sendTestSMS(to: string, body: string, leadId?: string) {
  return fetch(`${BASE}/api/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ to, body, leadId }),
  }).then(r => r.json());
}

/* ---------------- conversations / messages (final) ---------------- */

/** Thread summary used by the left list */
export type MessageThread = {
  id: string;
  ownerId?: string;
  leadId?: string | null;
  leadName?: string | null;
  leadEmail?: string | null;
  leadPhone?: string | null;
  phoneNumberSid?: string | null;
  lastMessageAt: string;
};

/** Individual message used in the right pane */
export type Message = {
  id: string;
  threadId: string;
  direction: "OUTBOUND" | "INBOUND";
  body: string;
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "RECEIVED";
  error?: string | null;
  externalSid?: string | null;
  toNumber?: string | null;
  fromNumber?: string | null;
  createdAt: string;
};

/** List the user’s threads */
export async function listThreads(): Promise<MessageThread[]> {
  const res = await http<any>("/api/messages/threads");
  // Accept either {ok, threads} or raw array
  if (Array.isArray(res)) return res as MessageThread[];
  if (Array.isArray(res?.threads)) return res.threads as MessageThread[];
  if (Array.isArray(res?.data)) return res.data as MessageThread[];
  return [];
}

/** Get messages for a thread */
export async function getThreadMessages(threadId: string): Promise<Message[]> {
  const res = await http<any>(`/api/messages/${threadId}`);
  // Accept {ok, messages}, {data}, or raw array
  if (Array.isArray(res)) return res as Message[];
  if (Array.isArray(res?.messages)) return res.messages as Message[];
  if (Array.isArray(res?.data)) return res.data as Message[];
  return [];
}

/** Start a brand-new thread by phone (optional name + firstMessage) */
export async function startThread(input: {
  phone: string;           // E.164 is best, we'll send it as-is
  name?: string;
  firstMessage?: string;
}): Promise<{ threadId: string }> {
  const res = await http<any>("/api/messages/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
  // Accept {ok, threadId}, {thread: {id}}, {id}
  if (typeof res?.threadId === "string") return { threadId: res.threadId };
  if (typeof res?.id === "string") return { threadId: res.id };
  if (res?.thread?.id) return { threadId: String(res.thread.id) };
  throw new Error("Start thread: missing thread id in response");
}

/** Send a message into an existing thread */
export async function sendMessage(threadId: string, body: string) {
  return http<{ ok: boolean; id?: string }>(`/api/messages/send`, {
    method: "POST",
    body: JSON.stringify({ threadId, body }),
  });
}

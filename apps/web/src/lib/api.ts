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

const TOKEN_KEY = "jwt";

// Base URL for the API
const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "";

/* ---------------- token helpers ---------------- */
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string) { try { localStorage.setItem(TOKEN_KEY, token); } catch {} }
export function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch {} }

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

/* ---------------- workflows ---------------- */
export type Workflow = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "draft" | "active" | "paused";
  createdAt: string;
  updatedAt: string;
};

export type WfStep =
  | { type: "SEND_TEXT"; textBody: string }
  | { type: "WAIT"; waitMs: number };

export async function listWorkflows(): Promise<Workflow[]> {
  const res = await http<any>("/api/workflows");
  return Array.isArray(res) ? res : (res?.data ?? []);
}

export async function listWorkflowsFull(): Promise<any[]> {
  const res = await http<any>("/api/workflows?full=1");
  return Array.isArray(res) ? res : (res?.data ?? []);
}

export async function createWorkflow(input: { name: string }): Promise<Workflow> {
  const res = await http<any>("/api/workflows", { method: "POST", body: JSON.stringify(input) });
  return (res?.data ?? res) as Workflow;
}

export async function saveWorkflowMeta(
  id: string,
  patch: Partial<{ name: string; status: "draft" | "active" | "paused" }>
) {
  const map = { draft: "DRAFT", active: "ACTIVE", paused: "PAUSED" } as const;
  const body: any = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.status !== undefined) body.status = map[patch.status];
  const res = await http<any>(`/api/workflows/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return res?.data ?? res;
}

export async function replaceWorkflowSteps(id: string, steps: WfStep[]) {
  const res = await http<any>(`/api/workflows/${id}/steps`, {
    method: "PUT",
    body: JSON.stringify({ steps }),
  });
  return res?.data ?? res;
}

export async function deleteWorkflow(id: string) {
  await http(`/api/workflows/${id}`, { method: "DELETE" });
}

/* ---------------- tags ---------------- */

export type TagDTO = {
  id: string;
  name: string;
  color?: string | null;
  workflowId?: string | null;
};

export async function getTags(): Promise<TagDTO[]> {
  const res = await http<{ ok: boolean; tags: TagDTO[] }>("/api/tags");
  return res.tags;
}

export async function createTag(input: {
  name: string;
  color?: string | null;
  workflowId?: string | null;
}): Promise<TagDTO> {
  const res = await http<{ ok: boolean; tag: TagDTO }>("/api/tags", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      color: input.color ?? null,
      workflowId: input.workflowId ?? null,
    }),
  });
  return res.tag;
}

export async function updateTag(
  id: string,
  patch: Partial<{ name: string; color: string | null; workflowId: string | null }>
): Promise<TagDTO> {
  const res = await http<{ ok: boolean; tag: TagDTO }>(`/api/tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.workflowId !== undefined ? { workflowId: patch.workflowId } : {}),
    }),
  });
  return res.tag;
}

export async function deleteTag(id: string): Promise<void> {
  await http<{ ok: boolean }>(`/api/tags/${id}`, { method: "DELETE" });
}

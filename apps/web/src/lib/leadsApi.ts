// Contacts data. Uses the login token the same way api.ts does.
import { BASE, getToken } from "./api";

export type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  city: string | null;
  state: string | null;
  createdAt: string;
  tags: { id: string; name: string; color?: string | null }[];
  threadId: string | null;
  lastMessageAt: string | null;
};

function headers(json = false): Record<string, string> {
  const t = getToken();
  return {
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export async function listLeads(opts: { q?: string; stage?: string; tagId?: string; cursor?: string }) {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.stage) params.set("stage", opts.stage);
  if (opts.tagId) params.set("tagId", opts.tagId);
  if (opts.cursor) params.set("cursor", opts.cursor);
  return req<{ ok: boolean; total: number; nextCursor: string | null; data: LeadRow[] }>(
    `/api/leads?${params.toString()}`,
    { headers: headers() }
  );
}

export async function createLead(input: { name: string; phone?: string; email?: string }) {
  const res = await req<{ ok: boolean; data: any }>("/api/leads", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(input),
  });
  const l = res.data;
  const row: LeadRow = {
    id: l.id,
    name: l.name,
    email: l.email ?? null,
    phone: l.phone ?? null,
    stage: l.stage || "NEW",
    city: l.city ?? null,
    state: l.state ?? null,
    createdAt: l.createdAt,
    tags: [],
    threadId: null,
    lastMessageAt: null,
  };
  return row;
}

export async function openLeadThread(leadId: string): Promise<string> {
  const res = await req<{ ok: boolean; data: { threadId: string } }>(`/api/leads/${leadId}/thread`, {
    method: "POST",
    headers: headers(true),
  });
  return res.data.threadId;
}

export async function bulkStage(ids: string[], stage: string) {
  return req<{ ok: boolean; changed: number }>("/api/leads/bulk/stage", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ ids, stage }),
  });
}

export async function bulkTag(ids: string[], tagId: string, remove = false) {
  return req<{ ok: boolean; changed: number }>("/api/leads/bulk/tag", {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ ids, tagId, remove }),
  });
}

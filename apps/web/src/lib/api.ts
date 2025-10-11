// apps/web/src/lib/api.ts

// Base API URL comes from Vercel env var
const API_BASE =
  import.meta.env.VITE_API_URL || "https://api.groscales.com";

// ---------- Types ----------
export interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string;
  status?: string;
  tags?: string[];
}

export interface Message {
  id: string;
  from: "me" | "lead";
  text: string;
  at: string;
  leadId?: string;
}

// ---------- Real API ----------
export async function getLeads(): Promise<Lead[]> {
  const res = await fetch(`${API_BASE}/api/leads`); // no credentials
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  return res.json();
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update lead: ${res.status}`);
  return res.json();
}

export async function getThread(leadId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/api/threads/${leadId}`);
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`);
  return res.json();
}

export async function sendMessage(leadId: string, text: string): Promise<Message> {
  const res = await fetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId, text }),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}

export const api = { getLeads, updateLead, getThread, sendMessage };

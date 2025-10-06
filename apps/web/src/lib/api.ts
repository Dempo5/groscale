// apps/web/src/lib/api.ts
// ---------- Base API ----------

// Use environment variable first, fallback to Vercel backend
const API_BASE =
  import.meta.env.VITE_API_BASE || "https://groscale.vercel.app";

// ---------- Types ----------
export interface Lead {
  id: string;
  /** Many screens use first/last explicitly */
  firstName?: string;
  lastName?: string;

  /** Friendly combined name for UI */
  name?: string;

  phone: string;
  email?: string;
  status: string;          // e.g., "BOOKED", "CONTACTED"
  tags?: string[];         // e.g., ["hot", "follow-up"]
}

export interface Message {
  id: string;
  from: "me" | "lead";
  text: string;
  at: string;              // display time-only is fine for mock
  /** Optional lead ID reference */
  leadId?: string;
}

// ---------- Real API (connected to backend) ----------

/** Get all leads */
export async function getLeads(): Promise<Lead[]> {
  const res = await fetch(`${API_BASE}/api/leads`);
  if (!res.ok) throw new Error("Failed to fetch leads");
  return res.json();
}

/** Update a lead */
export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const res = await fetch(`${API_BASE}/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update lead");
  return res.json();
}

/** Get thread by lead ID */
export async function getThread(leadId: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/api/threads/${leadId}`);
  if (!res.ok) throw new Error("Failed to fetch thread");
  return res.json();
}

/** Send a message */
export async function sendMessage(leadId: string, text: string): Promise<Message> {
  const res = await fetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId, text }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json();
}

// ---- Compatibility export ----
export const api = {
  getLeads,
  updateLead,
  getThread,
  sendMessage,
};

// apps/web/src/lib/api.ts
// ---------- Base API ----------
const API_BASE =
  import.meta.env.VITE_API_URL || "https://groscales-server.onrender.com";

// ---------- Types ----------
export interface Lead {
  id: string;
  /** Many screens use first/last explicitly */
  firstName?: string;
  lastName?: string;

  /** Keep a friendly combined name too (back-compat for places using .name) */
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
  /** Some UI references message.leadId, so we expose it (optional) */
  leadId?: string;
}

// ---------- Real API (using backend) ----------

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

/** Get one thread by lead id */
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

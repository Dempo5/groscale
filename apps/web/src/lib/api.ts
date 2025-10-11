// apps/web/src/lib/api.ts

// ---- Base URL for the API (Render) ----
const API_BASE =
  import.meta.env.VITE_API_URL || "https://groscale.onrender.com";

// ---- API functions ----
export async function getLeads() {
  const res = await fetch(`${API_BASE}/api/leads`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch leads: ${res.status}`);
  return res.json();
}

export async function updateLead(id: string, updates: any) {
  const res = await fetch(`${API_BASE}/api/leads/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update lead: ${res.status}`);
  return res.json();
}

export async function getThread(leadId: string) {
  const res = await fetch(`${API_BASE}/api/threads/${leadId}`);
  if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`);
  return res.json();
}

export async function sendMessage(leadId: string, text: string) {
  const res = await fetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId, text }),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}

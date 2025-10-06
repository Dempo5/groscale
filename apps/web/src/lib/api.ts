// apps/web/src/lib/api.ts

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: "NEW" | "CONTACTED" | "BOOKED" | "DNC";
  tags?: string[];
  lastMessageAt?: string;
};

export type Message = {
  id: string;
  leadId: string;
  from: "me" | "them";
  text: string;
  at: string; // ISO date
};

export type Thread = {
  lead: Lead;
  messages: Message[];
};

const API_BASE =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") ||
  ""; // relative to same origin by default

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  // If backend is not up, fall back to mock data
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/* ---------------- Real calls (adjust paths to your backend) ---------------- */

export async function getLeads(): Promise<Lead[]> {
  try {
    return await http<Lead[]>("/api/leads");
  } catch {
    return mockLeads(); // fallback
  }
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
  try {
    return await http<Lead>(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  } catch {
    // Local optimistic update fallback
    const leads = mockLeads();
    const i = leads.findIndex(l => l.id === id);
    if (i >= 0) leads[i] = { ...leads[i], ...patch };
    return leads[i]!;
  }
}

export async function getThread(leadId: string): Promise<Thread> {
  try {
    return await http<Thread>(`/api/threads/${encodeURIComponent(leadId)}`);
  } catch {
    const lead = mockLeads().find(l => l.id === leadId)!;
    return {
      lead,
      messages: mockMessages().filter(m => m.leadId === leadId),
    };
  }
}

export async function sendMessage(leadId: string, text: string): Promise<Message> {
  try {
    return await http<Message>("/api/messages", {
      method: "POST",
      body: JSON.stringify({ leadId, text }),
    });
  } catch {
    // Mock immediate echo
    const now = new Date().toISOString();
    return { id: `m_${Math.random().toString(36).slice(2)}`, leadId, from: "me", text, at: now };
  }
}

/* ----------------------------- Mock data ---------------------------------- */

function mockLeads(): Lead[] {
  return [
    {
      id: "L-001",
      name: "Carlos Ruiz",
      phone: "+1 689 555 1122",
      email: "carlos@example.com",
      status: "BOOKED",
      tags: ["hot"],
      lastMessageAt: "2025-10-05T09:14:00-04:00",
    },
    {
      id: "L-002",
      name: "Bree Chen",
      phone: "+1 407 555 8811",
      email: "bree@example.com",
      status: "CONTACTED",
      tags: ["followup"],
      lastMessageAt: "2025-10-05T08:02:00-04:00",
    },
  ];
}

function mockMessages(): Message[] {
  return [
    {
      id: "m1",
      leadId: "L-001",
      from: "them",
      text: "Hey! Can we reschedule?",
      at: "2025-10-05T09:12:00-04:00",
    },
    {
      id: "m2",
      leadId: "L-001",
      from: "me",
      text: "Sure, what works for you?",
      at: "2025-10-05T09:14:00-04:00",
    },
    {
      id: "m3",
      leadId: "L-002",
      from: "them",
      text: "What's the pricing?",
      at: "2025-10-05T08:02:00-04:00",
    },
  ];
}

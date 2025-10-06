// apps/web/src/lib/api.ts

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

// ---------- Tiny in-memory mock “DB” ----------

const leadsMock: Lead[] = [
  {
    id: "L001",
    firstName: "Carlos",
    lastName: "Ruiz",
    name: "Carlos Ruiz",
    phone: "+1 689 555 1122",
    email: "carlos@example.com",
    status: "BOOKED",
    tags: ["hot"],
  },
  {
    id: "L002",
    firstName: "Bree",
    lastName: "Chen",
    name: "Bree Chen",
    phone: "+1 407 555 8811",
    email: "bree@example.com",
    status: "CONTACTED",
    tags: ["follow-up"],
  },
];

const messagesByLead = new Map<string, Message[]>(
  [
    [
      "L001",
      [
        { id: "m1", from: "lead", text: "Hey! Can we reschedule?", at: "9:12 AM", leadId: "L001" },
        { id: "m2", from: "me",   text: "Sure, what works for you?", at: "9:14 AM", leadId: "L001" },
      ],
    ],
    [
      "L002",
      [
        { id: "m3", from: "lead", text: "What's the pricing?", at: "8:02 AM", leadId: "L002" },
      ],
    ],
  ]
);

// Utility to normalize full name when one part changes
function withFullName(lead: Lead): Lead {
  const first = lead.firstName?.trim() ?? "";
  const last = lead.lastName?.trim() ?? "";
  const name = [first, last].filter(Boolean).join(" ");
  return { ...lead, name: name || lead.name };
}

// ---------- API (mocked) ----------

/** Get all leads */
export async function getLeads(): Promise<Lead[]> {
  return leadsMock.map(withFullName);
}

/** Update a lead; returns the updated Lead */
export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
  const idx = leadsMock.findIndex(l => l.id === id);
  if (idx === -1) throw new Error("Lead not found");

  const merged = withFullName({ ...leadsMock[idx], ...updates });
  leadsMock[idx] = merged;
  return merged;
}

/** Get one thread by lead id */
export async function getThread(leadId: string): Promise<Message[]> {
  return messagesByLead.get(leadId)?.slice() ?? [];
}

/** Send a message and return the created Message */
export async function sendMessage(leadId: string, text: string): Promise<Message> {
  const msg: Message = {
    id: "m" + Math.random().toString(36).slice(2, 8),
    from: "me",
    text,
    at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    leadId,
  };
  const arr = messagesByLead.get(leadId) ?? [];
  arr.push(msg);
  messagesByLead.set(leadId, arr);
  return msg;
}

// Keep compatibility with `import { api } from './lib/api'`
export const api = { getLeads, updateLead, getThread, sendMessage };

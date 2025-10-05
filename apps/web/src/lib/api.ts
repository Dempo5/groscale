// apps/web/src/lib/api.ts

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  tags?: string[];
}

export interface Message {
  id: string;
  from: string; // 'me' or 'lead'
  text: string;
  at: string;
}

// Temporary mock functions
export async function getLeads(): Promise<Lead[]> {
  return [
    {
      id: "L001",
      name: "Carlos Ruiz",
      phone: "+1 689 555 1122",
      email: "carlos@example.com",
      status: "BOOKED",
      tags: ["hot"],
    },
    {
      id: "L002",
      name: "Bree Chen",
      phone: "+1 407 555 8811",
      email: "bree@example.com",
      status: "CONTACTED",
      tags: ["follow-up"],
    },
  ];
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<void> {
  console.log("Updating lead", id, updates);
}

export async function getThread(leadId: string): Promise<Message[]> {
  return [
    { id: "m1", from: "lead", text: "Hey! Can we reschedule?", at: "9:12 AM" },
    { id: "m2", from: "me", text: "Sure, what works for you?", at: "9:14 AM" },
  ];
}

export async function sendMessage(leadId: string, text: string): Promise<Message> {
  console.log("Sending message to", leadId, text);
  return { id: "temp", from: "me", text, at: new Date().toLocaleTimeString() };
}

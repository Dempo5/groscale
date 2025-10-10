// Tiny in-memory mock data

export type Lead = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone: string;
  email?: string;
  status: "NEW" | "CONTACTED" | "BOOKED" | "CLOSED";
  tags?: string[];
};

export type Message = {
  id: string;
  from: "me" | "lead";
  text: string;
  at: string;
  leadId: string;
};

export const leads: Lead[] = [
  {
    id: "L001",
    firstName: "Carlos",
    lastName: "Ruiz",
    name: "Carlos Ruiz",
    phone: "+1 689 555 1122",
    email: "carlos@example.com",
    status: "BOOKED",
    tags: ["hot"]
  },
  {
    id: "L002",
    firstName: "Bree",
    lastName: "Chen",
    name: "Bree Chen",
    phone: "+1 407 555 8811",
    email: "bree@example.com",
    status: "CONTACTED",
    tags: ["follow-up"]
  }
];

export const threads: Record<string, Message[]> = {
  L001: [
    { id: "m1", from: "lead", text: "Hey! Can we reschedule?", at: "9:12 AM", leadId: "L001" },
    { id: "m2", from: "me",   text: "Sure, what works for you?", at: "9:14 AM", leadId: "L001" }
  ],
  L002: [
    { id: "m3", from: "lead", text: "What's the pricing?", at: "8:02 AM", leadId: "L002" }
  ]
};
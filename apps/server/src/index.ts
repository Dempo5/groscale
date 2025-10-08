import express from "express";
import cors from "cors";

// ---------- CORS ----------
const allowedOrigins = [
  "http://localhost:5173",                 // Vite dev
  "https://groscales-frontend.onrender.com", // Render frontend
  "https://groscale.vercel.app",             // Vercel frontend
];

const app = express();
app.use(express.json());
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / curl with no Origin
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ---------- Mock data ----------
type Lead = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone: string;
  email?: string;
  status: string;
  tags?: string[];
};

type Message = {
  id: string;
  leadId: string;
  from: "me" | "lead";
  text: string;
  at: string;
};

const leads: Lead[] = [
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

const messagesByLead = new Map<string, Message[]>([
  [
    "L001",
    [
      {
        id: "m1",
        leadId: "L001",
        from: "lead",
        text: "Hey! Can we reschedule?",
        at: "9:12 AM",
      },
      {
        id: "m2",
        leadId: "L001",
        from: "me",
        text: "Sure, what works for you?",
        at: "9:14 AM",
      },
    ],
  ],
  [
    "L002",
    [
      {
        id: "m3",
        leadId: "L002",
        from: "lead",
        text: "What's the pricing?",
        at: "8:02 AM",
      },
    ],
  ],
]);

function withFullName(l: Lead): Lead {
  const first = l.firstName?.trim() ?? "";
  const last = l.lastName?.trim() ?? "";
  const name = [first, last].filter(Boolean).join(" ");
  return { ...l, name: name || l.name };
}

// ---------- Routes ----------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/leads", (_req, res) => {
  res.json(leads.map(withFullName));
});

app.put("/api/leads/:id", (req, res) => {
  const { id } = req.params;
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return res.status(404).json({ error: "Lead not found" });

  const merged = withFullName({ ...leads[idx], ...req.body });
  leads[idx] = merged;
  res.json(merged);
});

app.get("/api/threads/:leadId", (req, res) => {
  const msgs = messagesByLead.get(req.params.leadId) ?? [];
  res.json(msgs);
});

app.post("/api/messages", (req, res) => {
  const { leadId, text } = req.body as { leadId: string; text: string };
  if (!leadId || !text) return res.status(400).json({ error: "leadId and text required" });

  const msg: Message = {
    id: "m" + Math.random().toString(36).slice(2, 8),
    leadId,
    from: "me",
    text,
    at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
  const arr = messagesByLead.get(leadId) ?? [];
  arr.push(msg);
  messagesByLead.set(leadId, arr);
  res.json(msg);
});

// ---------- Start ----------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API listening on ${PORT}`);
});

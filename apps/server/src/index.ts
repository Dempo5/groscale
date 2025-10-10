import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

// ---------- CORS ----------
const allowed = [
  "http://localhost:5173",                    // Vite dev
  "https://groscale-frontend.onrender.com",   // Render frontend
  "https://groscale.vercel.app"               // Vercel (if you point web there)
];

const app = express();
app.use(express.json());

app.use(
  cors({
    origin(origin: string | undefined, cb) {
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ---------- Mock “DB” ----------
type LeadStatus = "NEW" | "CONTACTED" | "BOOKED" | "CLOSED";

export interface Lead {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone: string;
  email?: string;
  status: LeadStatus;
  tags?: string[];
}

export interface Message {
  id: string;
  from: "me" | "lead";
  text: string;
  at: string;
  leadId: string;
}

const leads: Lead[] = [
  {
    id: "L001",
    firstName: "Carlos",
    lastName: "Ruiz",
    name: "Carlos Ruiz",
    phone: "+16895551122",
    status: "BOOKED",
    tags: ["hot"],
  },
  {
    id: "L002",
    firstName: "Bree",
    lastName: "Chen",
    name: "Bree Chen",
    phone: "+14075558811",
    status: "CONTACTED",
    tags: ["follow-up"],
  },
];

const messagesByLead = new Map<string, Message[]>([
  [
    "L001",
    [
      { id: "m1", from: "lead", text: "Hey! Can we reschedule?", at: "09:12", leadId: "L001" },
      { id: "m2", from: "me",   text: "Sure — what works?",     at: "09:14", leadId: "L001" },
    ],
  ],
  [
    "L002",
    [{ id: "m3", from: "lead", text: "What’s the pricing?", at: "08:02", leadId: "L002" }],
  ],
]);

function withFullName(l: Lead): Lead {
  const first = l.firstName?.trim() ?? "";
  const last  = l.lastName?.trim() ?? "";
  const name  = [first, last].filter(Boolean).join(" ");
  return { ...l, name: name || l.name };
}

// ---------- Routes ----------
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

app.get("/api/leads", (_req: Request, res: Response) => {
  res.json(leads.map(withFullName));
});

app.put("/api/leads/:id", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const idx = leads.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: "Lead not found" });

    const update = req.body as Partial<Lead>;
    const merged = withFullName({ ...leads[idx], ...update });
    leads[idx] = merged;
    res.json(merged);
  } catch (err) {
    next(err);
  }
});

app.get("/api/threads/:leadId", (req: Request, res: Response) => {
  const { leadId } = req.params;
  res.json((messagesByLead.get(leadId) ?? []).slice());
});

app.post("/api/messages", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadId, text } = req.body as { leadId: string; text: string };
    if (!leadId || !text) return res.status(400).json({ error: "leadId and text required" });

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
    res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
});

// ---------- Error handler (typed) ----------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

// ---------- Start ----------
const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});
import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());

// 👇 set this to your Vercel domain (and localhost for dev)
const allowed = [
  "http://localhost:5173",                    // dev
  "https://groscale.vercel.app",             // Vercel frontend 
  "https://groscale-frontend.onrender.com",  // Render frontend 
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (!origin || allowed.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

// --- Mock Data (swap with DB later) ---
let leads = [
  { id: "L-001", name: "Carlos Ruiz", phone: "+16895551122", status: "BOOKED", tags: ["hot"] },
  { id: "L-002", name: "Bree Chen",  phone: "+14075558811", status: "CONTACTED", tags: ["followup"] },
];
let threads = [
  {
    id: "T-1",
    leadId: "L-001",
    messages: [
      { id: "m1", from: "lead", text: "Hey! Can we reschedule?", at: "9:12 AM" },
      { id: "m2", from: "me",   text: "Sure, what works for you?", at: "9:14 AM" }
    ]
  }
];

// --- Health check ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Leads ---
app.get("/api/leads", (_req, res) => res.json(leads));
app.get("/api/leads/:id", (req, res) => {
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: "Not found" });
  res.json(lead);
});
app.patch("/api/leads/:id", (req, res) => {
  const i = leads.findIndex(l => l.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: "Not found" });
  leads[i] = { ...leads[i], ...req.body };
  res.json(leads[i]);
});

// --- Tags ---
app.post("/api/leads/:id/tags", (req, res) => {
  const { tag } = req.body as { tag: string };
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: "Not found" });
  if (!lead.tags.includes(tag)) lead.tags.push(tag);
  res.json(lead);
});
app.delete("/api/leads/:id/tags/:tag", (req, res) => {
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: "Not found" });
  lead.tags = lead.tags.filter(t => t !== req.params.tag);
  res.json(lead);
});

// --- Messaging ---
app.get("/api/threads", (_req, res) => res.json(threads));
app.get("/api/threads/:id", (req, res) => {
  const thread = threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: "Not found" });
  res.json(thread);
});
app.post("/api/threads/:id/send", (req, res) => {
  const { text } = req.body as { text: string };
  const thread = threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: "Not found" });

  const msg = { id: "m" + (thread.messages.length + 1), from: "me" as const, text, at: new Date().toLocaleTimeString() };
  thread.messages.push(msg);
  // TODO: later call Twilio here
  res.json({ ok: true, message: msg });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

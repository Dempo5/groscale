import express, { Request, Response, NextFunction } from "express";
import cors, { CorsOptions } from "cors";
import { leads, threads, Lead, Message } from "./db.js";

const app = express();
app.use(express.json());

// ---- CORS ----
const allowed = [
  "http://localhost:5173",                    // Vite dev
  "https://groscale-frontend.onrender.com",   // Render Vite service (your current frontend)
  "https://groscale.vercel.app"               // Vercel domain if you point frontend there
];

const corsOptions: CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);                 // allow curl/postman
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true
};
app.use(cors(corsOptions));

// ---- Routes ----
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

app.get("/api/leads", (_req: Request, res: Response, next: NextFunction) => {
  try {
    const withFull = leads.map((l) => ({
      ...l,
      name: l.name ?? [l.firstName, l.lastName].filter(Boolean).join(" ")
    }));
    res.json(withFull);
  } catch (e) { next(e); }
});

app.put("/api/leads/:id", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const idx = leads.findIndex((l) => l.id === id);
    if (idx === -1) return res.status(404).json({ error: "Lead not found" });

    const merged: Lead = { ...leads[idx], ...req.body };
    // normalize full name
    merged.name = merged.name ?? [merged.firstName, merged.lastName].filter(Boolean).join(" ");
    leads[idx] = merged;
    res.json(merged);
  } catch (e) { next(e); }
});

app.get("/api/threads/:leadId", (req: Request, res: Response, next: NextFunction) => {
  try {
    const msgs = threads[req.params.leadId] ?? [];
    res.json(msgs);
  } catch (e) { next(e); }
});

app.post("/api/messages", (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadId, text } = req.body as { leadId: string; text: string };
    if (!leadId || !text) return res.status(400).json({ error: "leadId and text are required" });

    const msg: Message = {
      id: "m" + Math.random().toString(36).slice(2, 8),
      from: "me",
      text,
      at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      leadId
    };

    threads[leadId] = threads[leadId] ?? [];
    threads[leadId].push(msg);
    res.json(msg);
  } catch (e) { next(e); }
});

// ---- Error handler (typed) ----
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

// ---- Start (Render provides PORT) ----
const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
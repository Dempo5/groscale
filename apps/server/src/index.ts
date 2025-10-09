// apps/server/src/index.ts
import express from "express";
import cors from "cors";
import { prisma } from "./db";

const app = express();
app.use(express.json());

// ----- CORS -----
const allowed = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
);
// always allow local vite
allowed.add("http://localhost:5173");

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowed.has(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ----- Health -----
app.get("/health", (_req, res) => res.json({ ok: true }));

// ----- Leads -----
app.get("/api/leads", async (_req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
    res.json(leads);
  } catch (e) { next(e); }
});

app.post("/api/leads", async (req, res, next) => {
  try {
    const { firstName, lastName, name, phone, email, tags = [], status = "NEW" } = req.body ?? {};
    const created = await prisma.lead.create({
      data: { firstName, lastName, name, phone, email, tags, status },
    });
    res.status(201).json(created);
  } catch (e) { next(e); }
});

app.put("/api/leads/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, name, phone, email, tags, status } = req.body ?? {};
    const updated = await prisma.lead.update({
      where: { id },
      data: { firstName, lastName, name, phone, email, tags, status },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

app.delete("/api/leads/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.message.deleteMany({ where: { leadId: id } });
    await prisma.lead.delete({ where: { id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ----- Threads / Messages -----
app.get("/api/threads/:leadId", async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const msgs = await prisma.message.findMany({
      where: { leadId },
      orderBy: { at: "asc" },
    });
    res.json(msgs);
  } catch (e) { next(e); }
});

app.post("/api/messages", async (req, res, next) => {
  try {
    const { leadId, text } = req.body ?? {};
    const msg = await prisma.message.create({
      data: {
        leadId,
        text,
        from: "me",
      },
    });
    res.status(201).json(msg);
  } catch (e) { next(e); }
});

// ----- 404 -----
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ----- Error handler -----
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

// start only when not on Render
const port = process.env.PORT || 3001;
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => console.log(`API on http://localhost:${port}`));
}

export default app;

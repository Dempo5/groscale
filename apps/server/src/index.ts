/// <reference path="./types/express.d.ts" />

import express, { type Request, type Response, type NextFunction } from "express";

// ESM route imports MUST include .js
import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js";
import tagsRouter from "./routes/tags.js";
import messagesRouter from "./routes/messages.js"; // keep only if the file exists
import twilioRouter from "./routes/twilio.js";     // keep only if the file exists

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

/** Normalize to "scheme://host[:port]" */
function norm(u?: string | null) {
  if (!u) return "";
  try { return new URL(u).origin; } catch { return String(u).replace(/\/+$/, ""); }
}

/** Explicit allow-list from env (comma separated) */
const envList = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => norm(s.trim()))
  .filter(Boolean);

/** Allow any Vercel preview, Onrender, and localhost */
const allowRegex = /(localhost(:\d+)?|\.vercel\.app|\.onrender\.com)$/;

/** Single CORS middleware that always answers OPTIONS */
function corsGuard(req: Request, res: Response, next: NextFunction) {
  const origin = norm(req.headers.origin as string | undefined);

  const allowed =
    !origin ||                      // server-to-server / same-origin
    envList.includes(origin) ||     // explicit allow-list
    allowRegex.test(origin);        // preview domains + localhost

  if (allowed) {
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  }
  if (req.method === "OPTIONS") return res.sendStatus(403);
  return res.status(403).json({ error: "Not allowed by CORS" });
}

const app = express();

// behind Render’s proxy (correct req.ip, protocol, etc.)
app.set("trust proxy", true);

// global JSON for most routes
app.use(express.json({ limit: "2mb" }));
app.use(corsGuard);

// ---------- Health ----------
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

// ---------- API routes ----------
app.use("/api/auth", authRoute);
app.use("/api/uploads", uploadsRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/copilot", copilotRouter);
app.use("/api/tags", tagsRouter);

// Optional (only if the files exist)
// messages uses JSON body
app.use("/api/messages", messagesRouter);

// Twilio webhooks need urlencoded parsing (not JSON).
// If your twilio route does its own parsing, you can remove the middleware here.
app.use("/api/twilio",
  express.urlencoded({ extended: false }),  // keeps signature verification possible
  twilioRouter
);

// ---------- Demo ----------
app.get("/api/leads", (_req, res) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

// ---------- Root ----------
app.get("/", (_req, res) => {
  res.type("text").send(`GroScale API is running ✅

Try:
/health
POST /api/auth/register
POST /api/auth/login
POST /api/uploads/import
GET  /api/leads
GET  /api/workflows
GET  /api/tags
POST /api/messages/send     (if implemented)
POST /api/twilio/inbound    (Twilio webhook)
POST /api/copilot/draft`);
});

// ---------- 404 ----------
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ---------- Error handler ----------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const code = typeof err?.status === "number" ? err.status : 500;
  res.status(code).json({ error: err?.message || "Server error" });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 GroScales API running on port ${PORT}`);
});
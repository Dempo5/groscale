// apps/server/src/index.ts
import express, { Request, Response, NextFunction } from "express";
import cors, { CorsOptions } from "cors";

// ESM imports must include .js
import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

/* ---------------- utils ---------------- */
const norm = (u?: string | null) => {
  if (!u) return "";
  try { return new URL(u).origin; } catch { return String(u).replace(/\/+$/, ""); }
};

// explicit allow-list from env
const allowedFromEnv = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => norm(s.trim()))
  .filter(Boolean);

// allow any vercel/onrender preview + localhost
const allowRegex = /(localhost(:\d+)?|\.vercel\.app|\.onrender\.com)$/;

/* ---------------- app ---------------- */
const app = express();

/** CORS config */
const corsOptions: CorsOptions = {
  origin(origin, cb) {
    // same-origin / server-to-server
    if (!origin) return cb(null, true);
    const o = norm(origin);
    const ok = allowedFromEnv.includes(o) || allowRegex.test(o);
    if (ok) return cb(null, true);
    console.warn("[CORS] Blocked origin:", origin, "allowed:", allowedFromEnv);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Attach CORS BEFORE any routes/body-parsers
app.use(cors(corsOptions));

/**
 * Strong preflight handler — guarantees OPTIONS never 404s.
 * Responds 204 quickly and sets the same headers CORS would set.
 */
app.options("*", cors(corsOptions), (_req, res) => res.sendStatus(204));

app.use(express.json());

/* ---------------- health ---------------- */
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

/* ---------------- routes ---------------- */
app.use("/api/auth", authRoute);
app.use("/api/uploads", uploadsRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/copilot", copilotRouter);

/* ---------------- demo ---------------- */
app.get("/api/leads", (_req, res) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

/* ---------------- root ---------------- */
app.get("/", (_req, res) => {
  res
    .type("text")
    .send(`GroScale API is running ✅

Try:
/health
POST /api/auth/register
POST /api/auth/login
POST /api/uploads
GET  /api/leads
GET  /api/workflows
POST /api/copilot/draft`);
});

/* ---------------- 404 & errors ---------------- */
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const code = typeof err?.status === "number" ? err.status : 500;
  res.status(code).json({ error: err?.message || "Server error" });
});

/* ---------------- start ---------------- */
app.listen(PORT, () => {
  console.log(`🚀 GroScales API running on port ${PORT}`);
});
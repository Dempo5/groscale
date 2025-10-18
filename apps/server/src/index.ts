// apps/server/src/index.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

// ESM imports must include .js
import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js";

const PORT: number = process.env.PORT ? Number(process.env.PORT) : 10000;

/** Normalize to origin form "scheme://host[:port]" */
function norm(u?: string | null): string {
  if (!u) return "";
  try {
    return new URL(u).origin;
  } catch {
    return String(u).replace(/\/+$/, "");
  }
}

/** Explicit allow-list from env (comma-separated) */
const allowedFromEnv: string[] = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => norm(s.trim()))
  .filter(Boolean);

/** Always allow vercel/onrender preview URLs and localhost */
const allowRegex = /(localhost(:\d+)?|\.vercel\.app|\.onrender\.com)$/;

const app = express();
app.use(express.json());

/** CORS */
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / server-to-server
      if (!origin) return cb(null, true);
      const o = norm(origin);
      const ok = allowedFromEnv.includes(o) || allowRegex.test(o);
      if (ok) return cb(null, true);
      console.warn("[CORS] Blocked:", origin, "allowed:", allowedFromEnv);
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
// make sure all preflights succeed
app.options("*", cors());

/** Health */
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

/** API routes */
app.use("/api/auth", authRoute);
app.use("/api/uploads", uploadsRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/copilot", copilotRouter);

/** Demo leads */
app.get("/api/leads", (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

/** Root */
app.get("/", (_req: Request, res: Response) => {
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

/** 404 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

/** Error handler — typed to avoid TS7006 */
app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction): void => {
    const code = typeof err?.status === "number" ? err.status : 500;
    const msg = err?.message || "Server error";
    try {
      console.error("[ERROR]", msg);
    } catch {}
    res.status(code).json({ error: msg });
  }
);

/** Start */
app.listen(PORT, () => {
  console.log(`🚀 GroScales API running on port ${PORT}`);
});
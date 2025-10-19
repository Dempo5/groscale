// apps/server/src/index.ts
import express, { Request, Response, NextFunction } from "express";

// ESM imports must include .js
import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js";
import tagsRouter from "./routes/tags.js"; // ✅ NEW

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

/** Normalize to "scheme://host[:port]" */
function norm(u?: string | null) {
  if (!u) return "";
  try {
    return new URL(u).origin;
  } catch {
    return String(u).replace(/\/+$/, "");
  }
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
    !origin || // server-to-server / same-origin
    envList.includes(origin) || // explicit allow-list
    allowRegex.test(origin); // preview domains + localhost

  if (allowed) {
    // Vary=Origin so caches don’t mix responses for different origins
    res.header("Vary", "Origin");
    if (origin) res.header("Access-Control-Allow-Origin", origin);
    else res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );

    if (req.method === "OPTIONS") {
      // Always succeed preflight
      return res.sendStatus(204);
    }
    return next();
  }

  // Blocked by CORS (still answer preflight clearly)
  if (req.method === "OPTIONS") return res.sendStatus(403);
  return res.status(403).json({ error: "Not allowed by CORS" });
}

const app = express();
app.use(express.json());
app.use(corsGuard); // <-- our CORS & preflight handler FIRST

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
app.use("/api/tags", tagsRouter); // ✅ NEW

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
POST /api/uploads
GET  /api/leads
GET  /api/workflows
GET  /api/tags
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

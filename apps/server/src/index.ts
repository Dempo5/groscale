// apps/server/src/index.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

// Routes
import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

/* ---------- Normalize + Allowed Origins ---------- */
function norm(u?: string | null) {
  if (!u) return "";
  try { return new URL(u).origin; } catch { return String(u).replace(/\/+$/, ""); }
}

const allowedFromEnv = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => norm(s.trim()))
  .filter(Boolean);

const allowRegex = /(localhost(:\d+)?|\.vercel\.app|\.onrender\.com)$/;

/* ---------- Express App ---------- */
const app = express();

// ✅ CORS FIRST (before JSON, before routes)
const corsOptions = {
  origin(origin: any, cb: any) {
    if (!origin) return cb(null, true);
    const o = norm(origin);
    const ok = allowedFromEnv.includes(o) || allowRegex.test(o);
    if (ok) return cb(null, true);
    console.warn("[CORS] Blocked origin:", origin);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// 🚀 Handle preflights globally *before anything else*
app.options("*", cors(corsOptions), (_req, res) => res.sendStatus(204));
app.use(cors(corsOptions));
app.use(express.json());

/* ---------- Health ---------- */
app.get("/health", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

/* ---------- Routes ---------- */
app.use("/api/auth", authRoute);
app.use("/api/uploads", uploadsRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/copilot", copilotRouter);

/* ---------- Demo ---------- */
app.get("/api/leads", (_req, res) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

/* ---------- Root ---------- */
app.get("/", (_req, res) => {
  res
    .type("text")
    .send(`GroScales API running ✅

Try:
/health
POST /api/auth/register
POST /api/auth/login
`);
});

/* ---------- 404 + Error Handling ---------- */
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const code = typeof err?.status === "number" ? err.status : 500;
  res.status(code).json({ error: err?.message || "Server error" });
});

/* ---------- Start ---------- */
app.listen(PORT, () => {
  console.log(`🚀 GroScales API running on port ${PORT}`);
});
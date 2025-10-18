import express, { Request, Response, NextFunction } from "express";
import cors, { CorsOptionsDelegate } from "cors";

// ESM imports (.js required)
import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js";

const PORT = Number(process.env.PORT || 10000);

/* ---------------- helpers ---------------- */
const norm = (u?: string | null) => {
  if (!u) return "";
  try { return new URL(u).origin; } catch { return String(u).replace(/\/+$/, ""); }
};

const envList = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => norm(s.trim()))
  .filter(Boolean);

// Always allow Vercel previews, Render domain, and localhost
const allowRegex = /(localhost(:\d+)?|\.vercel\.app|\.onrender\.com)$/;

const isAllowedOrigin = (origin?: string | null) => {
  if (!origin) return true;            // curl/server-to-server/same-origin
  const o = norm(origin);
  return envList.includes(o) || allowRegex.test(o);
};

/* ---------------- app ---------------- */
const app = express();
app.use(express.json());

/* ---------------- CORS ---------------- */
const corsDelegate: CorsOptionsDelegate = (req, cb) => {
  const origin = req.header("Origin");
  const ok = isAllowedOrigin(origin);
  const opts = {
    origin: ok,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };
  if (!ok) console.warn("[CORS] Blocked:", origin, "allowed:", envList);
  cb(null, opts);
};

// Primary CORS middleware
app.use(cors(corsDelegate));

// Robust fallback for any OPTIONS that might slip past (some proxies are picky)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.header("Origin") || "*";
    if (isAllowedOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      return res.status(204).end();
    }
  }
  next();
});

/* ---------------- health ---------------- */
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

/* ---------------- routes ---------------- */
app.use("/api/auth", authRoute);
app.use("/api/uploads", uploadsRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/copilot", copilotRouter);

/* ---------------- demo data ---------------- */
app.get("/api/leads", (_req, res) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

/* ---------------- root ---------------- */
app.get("/", (_req, res) => {
  res.type("text").send(`GroScale API is running ✅

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

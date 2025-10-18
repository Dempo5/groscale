import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

// ⚠️ NodeNext/ESM requires .js in relative imports
import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js"; // ✅ NEW

// ----- env -----
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

// normalize and cache env allow-list
const envAllowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, "")) // strip trailing slash
  .filter(Boolean);

// ----- app -----
const app = express();
app.use(express.json());

// ----- env -----
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;

// Normalize origins to consistent "scheme://host[:port]"
function norm(u?: string | null) {
  if (!u) return "";
  try { return new URL(u).origin; } catch { return (u || "").replace(/\/+$/, ""); }
}

// Parse env and pre-normalize all allowed origins once
const ALLOWED_ORIGINS_ENV = process.env.ALLOWED_ORIGINS || "";
const allowedOrigins: string[] = ALLOWED_ORIGINS_ENV
  .split(",")
  .map((s) => norm(s.trim()))
  .filter(Boolean);

// Accept any vercel/onrender previews + localhost by regex
const allowRegex = /(\.vercel\.app|\.onrender\.com|localhost)(:\d+)?$/;

// ----- app -----
const app = express();
app.use(express.json());

// ----- CORS -----
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / server-to-server
      if (!origin) return cb(null, true);

      const o = norm(origin);
      const ok =
        allowedOrigins.includes(o) || // explicit allowlist from env
        allowRegex.test(o);           // previews + localhost

      if (ok) return cb(null, true);

      console.warn("[CORS] Blocked origin:", origin, "allowed:", allowedOrigins);
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Make sure OPTIONS preflights succeed everywhere
app.options("*", cors());



// ensure preflight always ok
app.options("*", cors());

// ---------- Health ----------
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

// ---------- API routes ----------
app.use("/api/auth", authRoute);
app.use("/api/uploads", uploadsRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/copilot", copilotRouter); // ✅ NEW

// ---------- Demo leads (placeholder) ----------
app.get("/api/leads", (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

// ---------- Root ----------
app.get("/", (_req: Request, res: Response) => {
  res
    .type("text")
    .send(
      `GroScale API is running ✅

Try:
/health
POST /api/auth/register
POST /api/auth/login
POST /api/uploads
GET  /api/leads
GET  /api/workflows
POST /api/copilot/draft`
    );
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

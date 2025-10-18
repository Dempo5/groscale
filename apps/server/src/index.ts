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

// ----- CORS -----
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / server-to-server / curl
      if (!origin) return cb(null, true);

      const o = origin.trim().replace(/\/+$/, "");

      const isEnvAllowed = envAllowed.includes(o);
      const isVercel = /^https?:\/\/[a-z0-9-]+\.vercel\.app$/i.test(o);
      const isRender = /^https?:\/\/[a-z0-9.-]+\.onrender\.com$/i.test(o);
      const isLocalhost = /^https?:\/\/localhost(?::\d+)?$/i.test(o);

      if (isEnvAllowed || isVercel || isRender || isLocalhost) {
        return cb(null, true);
      }

      // helpful debug so you can copy/paste into ALLOWED_ORIGINS
      console.warn(`[CORS] Blocked Origin: ${o}`);
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

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

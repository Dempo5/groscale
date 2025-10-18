// apps/server/src/index.ts
import express from "express";
import cors from "cors";

import authRoute from "./routes/auth.js";
import uploadsRouter from "./routes/uploads.js";
import numbersRouter from "./routes/numbers.js";
import workflowsRouter from "./routes/workflows.js";
import copilotRouter from "./routes/copilot.js";

const PORT = process.env.PORT || 10000;

// Normalize a URL to its origin
function norm(u?: string | null): string {
  if (!u) return "";
  try { return new URL(u).origin; } catch { return u.replace(/\/+$/, ""); }
}

// Allowlist
const allowedFromEnv = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => norm(s.trim()))
  .filter(Boolean);

const allowRegex = /(localhost(:\d+)?|\.vercel\.app|\.onrender\.com)$/i;

// Express
const app = express();
app.use(express.json());

// 🔥 CORS configured BEFORE routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const o = norm(origin);
      const ok = allowedFromEnv.includes(o) || allowRegex.test(o);
      if (ok) return cb(null, true);
      console.warn("[CORS] blocked:", origin);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Health
app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Routes
app.use("/api/auth", authRoute);
app.use("/api/uploads", uploadsRouter);
app.use("/api/numbers", numbersRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/copilot", copilotRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: err.message || "Server error" });
});

app.listen(PORT, () => {
  console.log(`✅ GroScales API running on port ${PORT}`);
});
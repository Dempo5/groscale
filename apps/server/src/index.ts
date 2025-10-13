import { requireAuth } from "./middleware/requireAuth.js";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

// ----- env -----
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// ----- app -----
const app = express();

app.use(express.json());

// CORS: allow the Vercel frontends you listed in Render env var
app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin / curl
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ---------- Public health check (no auth) ----------
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

// ---------- DEMO leads (public GET for now) ----------
/**
 * NOTE: We’ll lock this behind auth once Week 1 auth is finished.
 * Keeping GET public avoids breaking the UI while we wire login.
 */
app.get("/api/leads", (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

// Optional landing text
app.get("/", (_req: Request, res: Response) => {
  res.type("text").send(
    `GroScale API is running ✅

Try:
/health
GET /api/leads`
  );
});

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const code = typeof err?.status === "number" ? err.status : 500;
  res.status(code).json({ error: err?.message || "Server error" });
});

// start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

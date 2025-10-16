// apps/server/src/index.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import authRoute from "./routes/auth.js";          // 👈 mount auth routes
// import { requireAuth } from "./middleware/requireAuth.js"; // use later to protect routes

// ----- env -----
const PORT = process.env.PORT ? Number(process.env.PORT) : 10000;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// ----- app -----
const app = express();
app.use(express.json());

// ✅ Add this line to register your uploads route
import uploadsRouter from "./routes/uploads.js";
app.use("/api/uploads", uploadsRouter);

// ----- CORS -----
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / curl / server-to-server
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (/\.vercel\.app$/.test(origin)) return cb(null, true); // preview URLs
      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
// handle preflight quickly
app.options("*", cors());

// ---------- Public health check ----------
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

// ---------- Mount API routes ----------
app.use("/api/auth", authRoute);                    // 👈 now /api/auth/register & /login work

// ---------- Demo leads (public for now) ----------
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
POST /api/auth/register
POST /api/auth/login
GET  /api/leads`
  );
});

// 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const code = typeof err?.status === "number" ? err.status : 500;
  res.status(code).json({ error: err?.message || "Server error" });
});

// start
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

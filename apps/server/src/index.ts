// apps/server/src/index.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors"; // keep this import; we’ll add a custom handler below too
import path from "path";

// ───────────────────────────────────────────────────────────────────────────────
// Basic server
// ───────────────────────────────────────────────────────────────────────────────
const app = express();
const PORT = Number(process.env.PORT || 10000);

app.use(express.json());

// ───────────────────────────────────────────────────────────────────────────────
// CORS: allow your explicit origins + any *.vercel.app previews
// ───────────────────────────────────────────────────────────────────────────────
const rawAllowed = process.env.ALLOWED_ORIGINS ?? "";
const allowedExact = rawAllowed
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    // Allow any Vercel preview deployments, e.g. https://groscale-xxxxx.vercel.app
    if (u.hostname.endsWith(".vercel.app")) return true;
  } catch {
    // ignore parse errors
  }
  // Also allow anything explicitly listed in ALLOWED_ORIGINS
  return allowedExact.includes(origin);
}

// We still mount cors() to handle preflight defaults, but we’ll override headers
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, false);
      cb(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false, // no cookies in this demo
  })
);

// Ensure Vary/Origin and explicit headers for all matching requests
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader("Access-Control-Allow-Credentials", "false");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ───────────────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.type("text/html").send(
    `<pre>GroScale API is running ✅  Try <a href="/api/leads">/api/leads</a></pre>`
  );
});

app.get("/api/leads", (_req, res) => {
  // demo payload — replace with DB later
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
);

// ───────────────────────────────────────────────────────────────────────────────
// Start
// ───────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

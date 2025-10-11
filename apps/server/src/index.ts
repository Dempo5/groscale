// apps/server/src/index.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

const app = express();

// ------- CORS ---------------------------------------------------------------
const raw = process.env.ALLOWED_ORIGINS || "";
// allow comma or whitespace separated list
const ALLOWED = raw
  .split(/[, \n\r\t]+/)
  .map(s => s.trim())
  .filter(Boolean);

// during bring-up, allow your api domain + vercel main + preview
const FALLBACK = [
  "https://groscale.vercel.app",
  "https://api.groscales.com",
];

const WHITELIST = new Set([...ALLOWED, ...FALLBACK]);

app.use((req, res, next) => {
  res.setHeader("X-Powered-By", "GroScales");
  next();
});

app.use(
  cors({
    origin(origin, cb) {
      // allow no Origin (curl, server-side) and any whitelisted origin
      if (!origin || WHITELIST.has(origin)) return cb(null, true);
      cb(new Error(`CORS blocked for origin ${origin}`));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 86400,
  })
);

// make sure preflight never hangs
app.options("*", (_req, res) => res.sendStatus(204));

// ------- health / readiness -------------------------------------------------
app.get("/_health", (_req, res) => {
  res.status(200).json({ ok: true, service: "groscales-api", ts: Date.now() });
});
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// ------- demo data (replace with DB later) ----------------------------------
const DEMO_LEADS = [
  { id: 1, name: "Test Lead", email: "lead@example.com" },
  { id: 2, name: "Demo Lead", email: "demo@example.com" },
];

// quick readiness probe with no body
app.head("/api/leads", (_req, res) => res.sendStatus(200));

// real data
app.get("/api/leads", (_req: Request, res: Response, _next: NextFunction) => {
  res.json(DEMO_LEADS);
});

// root banner (useful to see if the service is live)
app.get("/", (_req, res) => {
  res
    .status(200)
    .type("text/plain")
    .send("GroScale API is running ✅  Try /_health or /api/leads");
});

// ------- error handler ------------------------------------------------------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const code = typeof err?.status === "number" ? err.status : 500;
  res.status(code).json({ error: err?.message || "Server error" });
});

// ------- start --------------------------------------------------------------
const PORT = Number(process.env.PORT || 10000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${PORT}`);
});

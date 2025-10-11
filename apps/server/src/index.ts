// apps/server/src/index.ts
import express from "express";
import cors from "cors";

const app = express();
app.set("trust proxy", true);
app.use(express.json());

// --- CORS: allow your prod domain + any Vercel preview ---
function isAllowedOrigin(origin?: string) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    // Prod web app
    if (u.hostname === "groscale.vercel.app") return true;
    // Any Vercel preview (e.g. groscale-xxxxx-groscales-projects.vercel.app)
    if (u.hostname.endsWith(".vercel.app")) return true;
    // Hitting the API directly from its own domain (useful for tools)
    if (u.hostname === "api.groscales.com") return true;
    return false;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server / curl (no Origin header)
      if (!origin) return cb(null, true);
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: false, // no cookies/session
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// respond fast to preflight
app.options("*", cors());

// --- Health / homepage ---
app.get("/", (_req, res) => {
  res.type("text/plain").send("GroScale API is running ✅  Try /api/leads");
});

// --- Example routes (keep or replace with your DB-backed ones) ---
app.get("/api/leads", (_req, res) => {
  res.json([
    { id: "1", name: "Test Lead", email: "lead@example.com" },
    { id: "2", name: "Demo Lead", email: "demo@example.com" },
  ]);
});

app.put("/api/leads/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body ?? {};
  res.json({ id, ...updates });
});

app.get("/api/threads/:leadId", (req, res) => {
  const { leadId } = req.params;
  res.json([
    { id: "m1", from: "lead", text: "Hi!", at: new Date().toISOString(), leadId },
    { id: "m2", from: "me", text: "Hello!", at: new Date().toISOString(), leadId },
  ]);
});

app.post("/api/messages", (req, res) => {
  const { leadId, text } = req.body ?? {};
  res.json({
    id: Math.random().toString(36).slice(2),
    from: "me",
    text: text ?? "",
    at: new Date().toISOString(),
    leadId: leadId ?? null,
  });
});

// --- Start server ---
const PORT = parseInt(process.env.PORT || "10000", 10);
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});

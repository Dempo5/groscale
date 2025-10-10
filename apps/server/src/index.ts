import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());

// Permissive CORS (temporary while we stabilize)
app.use(
  cors({
    origin: true,      // reflect the Origin header
    credentials: false // we aren't using cookies
  })
);

// Health
app.get("/", (_req, res) =>
  res.type("text/plain").send("GroScale API is running ✅  Try /api/leads")
);

// Leads
app.get("/api/leads", (_req, res) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

// 404 text (so Vercel 404s are obvious)
app.use((_req, res) => res.status(404).type("text/plain").send("Not Found"));

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Server running on ${port}`));
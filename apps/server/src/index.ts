// apps/server/src/index.ts
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

// Broad CORS while we finish wiring things up
app.use(
  cors({
    origin: true,          // reflect request origin
    credentials: true,     // allow cookies if you ever use them
  })
);
app.options("*", cors({ origin: true }));

app.use(express.json());

app.get("/", (_req, res) => {
  res.send("GroScale API is running ✅ Try /api/leads");
});

app.get("/api/leads", (_req, res) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
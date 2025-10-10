import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ TEMP CORS FIX — allows requests from any origin for testing
app.use(
  cors({
    origin: true, // reflect the request origin automatically
    credentials: true, // allow cookies if needed
  })
);

// ✅ Ensure preflight (OPTIONS) requests succeed
app.options("*", cors({ origin: true }));

app.use(express.json());

// ✅ Simple test route to confirm API is working
app.get("/", (req, res) => {
  res.send("GroScale API is running ✅ Try /api/leads");
});

// ✅ Example API route
app.get("/api/leads", (req, res) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// apps/server/src/index.ts
import express from "express";
import cors from "cors";
import { prisma } from "./db"; // make sure ./db.ts exists in the same folder

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow your frontend URLs (Render + Vercel)
      const allowed = [
        "https://groscale-frontend.onrender.com",
        "https://groscale.vercel.app",
        "http://localhost:5173"
      ];
      if (!origin || allowed.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"));
      }
    },
    credentials: true
  })
);

// ✅ Health check route
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ✅ Get all leads
app.get("/api/leads", async (_req, res, next) => {
  try {
    const leads = await prisma.lead.findMany();
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

// ✅ Update a lead
app.put("/api/leads/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await prisma.lead.update({
      where: { id },
      data: req.body
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ✅ Get thread (messages for a lead)
app.get("/api/threads/:leadId", async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const messages = await prisma.message.findMany({ where: { leadId } });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// ✅ Send a message
app.post("/api/messages", async (req, res, next) => {
  try {
    const { leadId, text } = req.body;
    const newMsg = await prisma.message.create({
      data: { leadId, text, from: "me", at: new Date().toISOString() }
    });
    res.json(newMsg);
  } catch (err) {
    next(err);
  }
});

// ✅ Error handler
app.use((err, _req, res, _next) => {
  console.error("Error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
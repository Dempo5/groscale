import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

const app = express();
app.use(express.json());

/* -------------------------------------------------------
   ✅ CORS — allows Vercel + localhost + Render previews
--------------------------------------------------------- */
const envList = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const defaults = ["http://localhost:5173"];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow server-to-server / health checks
      if (envList.includes(origin) || defaults.includes(origin)) return cb(null, true);
      try {
        const { host } = new URL(origin);
        if (host.endsWith(".vercel.app")) return cb(null, true);
      } catch {}
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

/* -------------------------------------------------------
   ✅ Basic routes
--------------------------------------------------------- */
app.get("/", (_req: Request, res: Response) => {
  res.send("GroScale API is running ✅ Try /api/leads");
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/* Example route (replace with Prisma later) */
app.get("/api/leads", (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: "Test Lead", email: "lead@example.com" },
    { id: 2, name: "Demo Lead", email: "demo@example.com" },
  ]);
});

/* -------------------------------------------------------
   ✅ Error handler
--------------------------------------------------------- */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("❌ Error:", err.message);
  res.status(500).json({ error: err.message });
});

/* -------------------------------------------------------
   ✅ Server start
--------------------------------------------------------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

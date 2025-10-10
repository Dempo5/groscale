import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

// ✅ Root + Health routes
app.get("/", (_req: Request, res: Response) => {
  res.type("text/plain").send("GroScale API is running ✅  Try /api/leads");
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

// ✅ Mock endpoint example
app.get("/api/leads", (_req: Request, res: Response) => {
  res.json({
    leads: [
      { id: 1, name: "Alex Johnson", status: "NEW" },
      { id: 2, name: "Bree Chen", status: "CONTACTED" },
      { id: 3, name: "Carlos Ruiz", status: "BOOKED" },
    ],
  });
});

// ✅ 404 fallback
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ✅ Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something broke!" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
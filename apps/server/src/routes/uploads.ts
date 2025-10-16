import { Router, Request, Response } from "express";

const router = Router();

// Simple route to confirm uploads route works
router.get("/health", (_req, res) => res.json({ ok: true, route: "uploads" }));

// Import leads (temporary test endpoint)
router.post("/import", (req: Request, res: Response) => {
  const leads = Array.isArray(req.body?.leads) ? req.body.leads : [];
  res.json({ ok: true, received: leads.length });
});

export default router;

// apps/server/src/routes/uploads.ts
import { Router, Request, Response } from "express";

const router = Router();

/**
 * Health check for deployments
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, route: "uploads" });
});

/**
 * Minimal CSV/JSON import stub
 * Accepts JSON: { leads: [...] }
 * (You can wire CSV multipart later; this keeps build green.)
 */
router.post("/import", (req: Request, res: Response) => {
  const leads = Array.isArray(req.body?.leads) ? req.body.leads : [];
  res.json({
    ok: true,
    received: leads.length,
    // TODO: insert to DB, enqueue workflow, etc.
  });
});

export default router;

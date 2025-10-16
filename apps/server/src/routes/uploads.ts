import { Router, Request, Response } from "express";
const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, route: "uploads" }));

router.post("/import", (req: Request, res: Response) => {
  const leads = Array.isArray(req.body?.leads) ? req.body.leads : [];
  res.json({ ok: true, received: leads.length });
});

export default router;

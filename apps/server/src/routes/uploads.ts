// apps/server/src/routes/uploads.ts
import { Router, Request, Response } from "express";

const router = Router();

/**
 * Minimal placeholder for CSV uploads.
 * Frontend can POST JSON for now; we’ll swap to multipart later.
 */
router.post("/", async (req: Request, res: Response) => {
  // Expect either an array of leads or raw CSV string (to be implemented)
  const { leads, csv } = req.body ?? {};

  // No DB writes yet—just validate and echo
  if (!leads && !csv) {
    return res.status(400).json({
      ok: false,
      error: "Send { leads: [...] } or { csv: '...' }",
    });
  }

  // Example normalized response
  const count =
    Array.isArray(leads) ? leads.length : typeof csv === "string" ? csv.split("\n").length - 1 : 0;

  return res.json({
    ok: true,
    received: { leads: Array.isArray(leads) ? leads.length : 0, csv: Boolean(csv) },
    normalizedCount: count,
    note:
      "Upload route is wired up. Next step: parse CSV, validate columns, insert to DB, enqueue workflow.",
  });
});

export default router;

// apps/server/src/routes/workflows.ts
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

/** Accepts "draft|active|paused" (any case) or DB enum "DRAFT|ACTIVE|PAUSED". */
function normalizeStatus(v?: string) {
  if (!v) return undefined;
  const up = String(v).toUpperCase();
  if (up === "DRAFT" || up === "ACTIVE" || up === "PAUSED") return up;
  return undefined;
}

/** GET /api/workflows?full=1 — list workflows (optionally with steps) */
router.get("/", async (req: Request, res: Response) => {
  try {
    const full = String(req.query.full || "") === "1";
    const rows = await prisma.workflow.findMany({
      orderBy: { updatedAt: "desc" },
      include: full ? { steps: { orderBy: { order: "asc" } } } : undefined,
    });
    res.json({ ok: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to list workflows" });
  }
});

/** POST /api/workflows { name } — create workflow */
router.post("/", async (req: Request, res: Response) => {
  try {
    const name = (req.body?.name ?? "").toString().trim() || "New workflow";
    const row = await prisma.workflow.create({ data: { name } });
    res.json({ ok: true, data: row });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to create workflow" });
  }
});

/** PATCH /api/workflows/:id { name?, status? } — update meta */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const patch: any = {};
    if (typeof req.body?.name === "string") patch.name = req.body.name.trim();

    if (typeof req.body?.status === "string") {
      const st = normalizeStatus(req.body.status);
      if (st) patch.status = st as any; // map to DB enum value
    }

    const row = await prisma.workflow.update({ where: { id }, data: patch });
    res.json({ ok: true, data: row });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to update workflow" });
  }
});

/**
 * PUT /api/workflows/:id/steps { steps: Array<...> } — replace steps
 * Step shape (client):
 *   { type: "SEND_TEXT", textBody: string }
 *   { type: "WAIT",      waitMs: number }
 */
router.put("/:id/steps", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    const input = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const stepsData = input.map((s: any, i: number) => {
      const t = String(s?.type || "").toUpperCase();

      if (t === "SEND_TEXT") {
        return {
          order: i,
          type: "SEND_TEXT" as any,
          textBody: String(s?.textBody ?? ""),
          waitMs: null,
        };
      }
      if (t === "WAIT") {
        const n = Number(s?.waitMs ?? 0);
        return {
          order: i,
          type: "WAIT" as any,
          textBody: null,
          waitMs: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0,
        };
      }
      throw new Error(`Invalid step type at index ${i}`);
    });

    const result = await prisma.$transaction(async (tx) => {
      // Replace steps
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });
      if (stepsData.length) {
        await tx.workflowStep.createMany({
          data: stepsData.map((d) => ({ ...d, workflowId: id })),
        });
      }
      // Return fresh workflow (with steps)
      return tx.workflow.findUnique({
        where: { id },
        include: { steps: { orderBy: { order: "asc" } } },
      });
    });

    res.json({ ok: true, data: result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to replace steps" });
  }
});

/** DELETE /api/workflows/:id — delete workflow */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.workflow.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to delete workflow" });
  }
});

export default router;

// apps/server/src/routes/workflows.ts
// Every query is scoped to the logged-in user (ownerId), so one account
// can never see or change another account's workflows.
import { Router, type Request, type Response } from "express";
import { prisma } from "../prisma.js";
import type { Prisma } from "@prisma/client";
import type { AuthedRequest } from "../middleware/auth.js";

const router = Router();

const ownerOf = (req: Request) => (req as AuthedRequest).userId!;

// Only let a user touch workflows they own.
async function findOwned(id: string, ownerId: string) {
  return prisma.workflow.findFirst({ where: { id, ownerId } });
}

/** GET /api/workflows?full=1 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    const full = String(req.query.full || "") === "1";
    const data = await prisma.workflow.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include: full
        ? {
            steps: { orderBy: { order: "asc" } },
            tags: { select: { id: true, name: true, color: true } },
          }
        : undefined,
    });
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** POST /api/workflows { name } */
router.post("/", async (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    const name = String(req.body?.name || "Untitled workflow").trim() || "Untitled workflow";
    const row = await prisma.workflow.create({
      data: { ownerId, name, status: "DRAFT" as any },
      include: { steps: true, tags: { select: { id: true, name: true, color: true } } },
    });
    res.json({ ok: true, data: row });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** PATCH /api/workflows/:id { name?, status? } */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    const { id } = req.params;
    if (!(await findOwned(id, ownerId))) {
      return res.status(404).json({ ok: false, error: "Workflow not found" });
    }
    const patch: Record<string, any> = {};
    if (typeof req.body?.name === "string") patch.name = req.body.name.trim() || "Untitled workflow";
    if (typeof req.body?.status === "string") {
      const s = String(req.body.status).toUpperCase();
      if (["ACTIVE", "PAUSED", "DRAFT"].includes(s)) patch.status = s as any;
    }
    const row = await prisma.workflow.update({ where: { id }, data: patch });
    res.json({ ok: true, data: row });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** PUT /api/workflows/:id/steps { steps: [{type,textBody?,waitMs?}] } */
router.put("/:id/steps", async (req: Request, res: Response) => {
  const ownerId = ownerOf(req);
  const { id } = req.params;
  const steps: Array<{ type: string; textBody?: string; waitMs?: number }> = Array.isArray(req.body?.steps)
    ? req.body.steps
    : [];

  try {
    if (!(await findOwned(id, ownerId))) {
      return res.status(404).json({ ok: false, error: "Workflow not found" });
    }
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });
      if (steps.length) {
        await tx.workflowStep.createMany({
          data: steps.map((s, i) => {
            const type = s.type === "WAIT" ? "WAIT" : "SEND_TEXT";
            return {
              workflowId: id,
              order: i + 1,
              type: type as any,
              textBody: type === "SEND_TEXT" ? String(s.textBody ?? "") : null,
              waitMs: type === "WAIT" ? Math.max(0, Number(s.waitMs ?? 0)) : null,
            };
          }),
        });
      }
    });

    const full = await prisma.workflow.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { order: "asc" } },
        tags: { select: { id: true, name: true, color: true } },
      },
    });
    res.json({ ok: true, data: full });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** DELETE /api/workflows/:id */
router.delete("/:id", async (req: Request, res: Response) => {
  const ownerId = ownerOf(req);
  const { id } = req.params;
  try {
    if (!(await findOwned(id, ownerId))) {
      return res.status(404).json({ ok: false, error: "Workflow not found" });
    }
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.tag.updateMany({ where: { workflowId: id, ownerId }, data: { workflowId: null } });
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });
      await tx.workflow.delete({ where: { id } });
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

export default router;

import { Router } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// GET /api/workflows  (simple list)
router.get("/api/workflows", async (_req, res) => {
  const rows = await prisma.workflow.findMany({
    select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  });
  // Map Prisma enums -> friendly lowercase if your UI expects that
  const data = rows.map(r => ({
    ...r,
    status:
      r.status === "ACTIVE" ? "active" :
      r.status === "PAUSED" ? "paused" : "draft",
  }));
  res.json({ ok: true, data });
});

// POST /api/workflows
router.post("/api/workflows", async (req, res, next) => {
  try {
    const { name } = req.body as { name: string };
    const row = await prisma.workflow.create({
      data: {
        name: name || "Untitled workflow",
        ownerId: (req as any).user?.id ?? "demo-owner",
      },
      select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
    });
    res.json({ ok: true, data: { ...row, status: "draft" } });
  } catch (e) { next(e); }
});

// PATCH /api/workflows/:id  (name/status)
router.patch("/api/workflows/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body as { name?: string; status?: "draft" | "active" | "paused" };
    const prismaStatus =
      status === "active" ? "ACTIVE" :
      status === "paused" ? "PAUSED" : undefined;

    const row = await prisma.workflow.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(prismaStatus ? { status: prismaStatus as Prisma.WorkflowStatus } : {}),
      },
      select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
    });
    res.json({
      ok: true,
      data: { ...row, status: row.status === "ACTIVE" ? "active" : row.status === "PAUSED" ? "paused" : "draft" },
    });
  } catch (e) { next(e); }
});

// PUT /api/workflows/:id/steps  (replace steps)
router.put("/api/workflows/:id/steps", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { steps } = req.body as { steps: Array<{ type: "SEND_TEXT" | "WAIT"; textBody?: string; waitMs?: number }> };

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // wipe old
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });

      // write new with sequential order
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await tx.workflowStep.create({
          data: {
            workflowId: id,
            order: i + 1,
            type: s.type,             // Prisma enum matches "SEND_TEXT" | "WAIT"
            textBody: s.textBody ?? null,
            waitMs: s.waitMs ?? null,
          },
        });
      }
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;

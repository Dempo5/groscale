// apps/server/src/routes/workflows.ts
import { Router } from "express";
import { PrismaClient, StepType, WorkflowStatus } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// NOTE: ownerId is optional right now. Wire to auth later if you want tenant scoping.
const ownerFrom = (req: any) => req?.user?.id ?? null;

/**
 * GET /api/workflows
 * Return minimal list (good for dropdowns) OR full detail if ?full=1
 */
router.get("/", async (req, res) => {
  const full = String(req.query.full || "") === "1";
  const ownerId = ownerFrom(req);

  const where = ownerId ? { ownerId } : {};
  if (!full) {
    const rows = await prisma.workflow.findMany({
      where,
      select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json(rows);
  }

  const rows = await prisma.workflow.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  res.json(rows);
});

/**
 * POST /api/workflows
 * body: { name: string }
 */
router.post("/", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { name } = (req.body || {}) as { name?: string };
  if (!name?.trim()) return res.status(400).json({ ok: false, error: "name required" });

  const data: any = { name: String(name).trim(), status: "DRAFT" as WorkflowStatus };
  if (ownerId) data.ownerId = ownerId;

  const wf = await prisma.workflow.create({ data });
  res.json(wf);
});

/**
 * PATCH /api/workflows/:id
 * body: { name?: string, status?: WorkflowStatus }
 * (simple metadata update – does not touch steps)
 */
router.patch("/:id", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { id } = req.params;
  const { name, status } = (req.body || {}) as {
    name?: string;
    status?: WorkflowStatus;
  };

  const where: any = { id };
  if (ownerId) where.ownerId = ownerId;

  const wf = await prisma.workflow.update({
    where,
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  res.json(wf);
});

/**
 * PUT /api/workflows/:id/steps
 * Replaces ALL steps in a single transaction.
 * body: { steps: Array<{ type: StepType; textBody?: string|null; waitMs?: number|null }> }
 */
router.put("/:id/steps", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { id } = req.params;
  const { steps } = (req.body || {}) as {
    steps?: Array<{ type: StepType; textBody?: string | null; waitMs?: number | null }>;
  };
  if (!Array.isArray(steps)) return res.status(400).json({ ok: false, error: "steps[] required" });

  // Validate step payload lightly
  const sanitized = steps.map((s, i) => {
    const out: any = {
      order: i,
      type: s.type,
      textBody: null,
      waitMs: null,
    };
    if (s.type === "SEND_TEXT") {
      if (!s.textBody?.trim()) throw new Error(`Step ${i + 1}: textBody required for SEND_TEXT`);
      out.textBody = String(s.textBody);
    }
    if (s.type === "WAIT") {
      if (!s.waitMs || s.waitMs <= 0) throw new Error(`Step ${i + 1}: waitMs > 0 required for WAIT`);
      out.waitMs = Number(s.waitMs);
    }
    return out;
  });

  const whereWF: any = { id };
  if (ownerId) whereWF.ownerId = ownerId;

  const wf = await prisma.$transaction(async (tx) => {
    // Ensure workflow exists and (optionally) belongs to owner
    const exists = await tx.workflow.findFirst({ where: whereWF, select: { id: true } });
    if (!exists) throw new Error("Workflow not found");

    // Replace steps atomically
    await tx.workflowStep.deleteMany({ where: { workflowId: id } });
    if (sanitized.length) {
      await tx.workflowStep.createMany({
        data: sanitized.map((s) => ({ ...s, workflowId: id })),
      });
    }

    return tx.workflow.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: "asc" } } },
    });
  });

  res.json({ ok: true, data: wf });
});

/**
 * DELETE /api/workflows/:id
 */
router.delete("/:id", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { id } = req.params;

  const where: any = { id };
  if (ownerId) where.ownerId = ownerId;

  await prisma.workflow.delete({ where });
  res.json({ ok: true });
});

export default router;

// apps/server/src/routes/workflows.ts
import { Router } from "express";
import { PrismaClient, StepType, WorkflowStatus } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// NOTE: auth is not enforced yet (ownerId is null).
// Wire to your requireAuth + ownerId later.

router.get("/", async (_req, res) => {
  const list = await prisma.workflow.findMany({
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  res.json({ ok: true, data: list });
});

router.post("/", async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name) return res.status(400).json({ ok: false, error: "name required" });

  const wf = await prisma.workflow.create({
    data: { name, status: "DRAFT" },
  });
  res.json({ ok: true, data: wf });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, status } = req.body as { name?: string; status?: WorkflowStatus };
  const wf = await prisma.workflow.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(status ? { status } : {}),
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  res.json({ ok: true, data: wf });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  await prisma.workflow.delete({ where: { id } });
  res.json({ ok: true });
});

router.post("/:id/steps", async (req, res) => {
  const { id } = req.params;
  const { type, textBody, waitMs } = req.body as {
    type: StepType; textBody?: string; waitMs?: number;
  };

  // determine next order
  const count = await prisma.workflowStep.count({ where: { workflowId: id } });

  if (type === "SEND_TEXT" && !textBody) {
    return res.status(400).json({ ok: false, error: "textBody required for SEND_TEXT" });
  }
  if (type === "WAIT" && !(waitMs && waitMs > 0)) {
    return res.status(400).json({ ok: false, error: "waitMs > 0 required for WAIT" });
  }

  const step = await prisma.workflowStep.create({
    data: {
      workflowId: id,
      order: count,
      type,
      textBody: type === "SEND_TEXT" ? textBody : null,
      waitMs: type === "WAIT" ? waitMs : null,
    },
  });
  res.json({ ok: true, data: step });
});

router.patch("/:id/steps/:stepId", async (req, res) => {
  const { id, stepId } = req.params;
  const { textBody, waitMs, order } = req.body as {
    textBody?: string; waitMs?: number; order?: number;
  };

  const updated = await prisma.workflowStep.update({
    where: { id: stepId },
    data: {
      ...(textBody !== undefined ? { textBody } : {}),
      ...(waitMs !== undefined ? { waitMs } : {}),
      ...(order !== undefined ? { order } : {}),
    },
  });
  res.json({ ok: true, data: updated });
});

router.delete("/:id/steps/:stepId", async (req, res) => {
  const { stepId } = req.params;
  await prisma.workflowStep.delete({ where: { id: stepId } });
  res.json({ ok: true });
});

export default router;

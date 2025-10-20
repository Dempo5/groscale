import { Router } from "express";
import { PrismaClient, WorkflowStatus, StepType } from "@prisma/client";

const prisma = new PrismaClient();
const r = Router();

/** GET /api/workflows?full=1 */
r.get("/", async (req, res) => {
  const full = String(req.query.full || "") === "1";
  const rows = await prisma.workflow.findMany({
    orderBy: { createdAt: "desc" },
    include: full ? { steps: { orderBy: { order: "asc" } } } : undefined,
  });
  res.json({ ok: true, data: rows });
});

/** POST /api/workflows { name } */
r.post("/", async (req, res) => {
  const name = String(req.body?.name || "").trim() || "Untitled workflow";
  const wf = await prisma.workflow.create({
    data: { name, status: WorkflowStatus.DRAFT },
  });
  res.status(201).json({ ok: true, data: wf });
});

/** PATCH /api/workflows/:id { name?, status? } */
r.patch("/:id", async (req, res) => {
  const id = String(req.params.id);
  const patch: any = {};
  if (typeof req.body?.name === "string") patch.name = req.body.name;
  if (typeof req.body?.status === "string")
    patch.status = req.body.status as WorkflowStatus;

  const wf = await prisma.workflow.update({ where: { id }, data: patch });
  res.json({ ok: true, data: wf });
});

/** PUT /api/workflows/:id/steps { steps:[ ... ] } */
r.put("/:id/steps", async (req, res) => {
  const id = String(req.params.id);
  const incoming: any[] = Array.isArray(req.body?.steps) ? req.body.steps : [];

  const rows = incoming.map((s, i) =>
    s?.type === "WAIT"
      ? {
          order: i + 1,
          type: StepType.WAIT,
          waitMs: Number(s.waitMs) || 0,
          textBody: null,
          workflowId: id,
        }
      : {
          order: i + 1,
          type: StepType.SEND_TEXT,
          textBody: String(s.textBody || ""),
          waitMs: null,
          workflowId: id,
        }
  );

  await prisma.$transaction(async (tx) => {
    await tx.workflowStep.deleteMany({ where: { workflowId: id } });
    if (rows.length) await tx.workflowStep.createMany({ data: rows });
  });

  const wf = await prisma.workflow.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  res.json({ ok: true, data: wf });
});

/** DELETE /api/workflows/:id */
r.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  await prisma.$transaction(async (tx) => {
    await tx.workflowStep.deleteMany({ where: { workflowId: id } });
    await tx.workflow.delete({ where: { id } });
  });
  res.json({ ok: true });
});

export default r;

import { Router } from "express";
import { PrismaClient, WorkflowStatus, StepType } from "@prisma/client";

const prisma = new PrismaClient();
const r = Router();

/** GET /api/workflows
 *  Returns array of workflows (no steps) or ?full=1 to include steps.
 */
r.get("/", async (req, res) => {
  const full = String(req.query.full || "") === "1";
  const rows = await prisma.workflow.findMany({
    orderBy: { createdAt: "desc" },
    include: full ? { steps: { orderBy: { order: "asc" } } } : undefined,
  });
  res.json({ ok: true, data: rows });
});

/** POST /api/workflows
 *  Body: { name: string }
 */
r.post("/", async (req, res) => {
  const name = String(req.body?.name || "").trim() || "Untitled workflow";
  const wf = await prisma.workflow.create({
    data: { name, status: WorkflowStatus.DRAFT },
  });
  res.status(201).json({ ok: true, data: wf });
});

/** PATCH /api/workflows/:id
 *  Body: { name?: string, status?: "DRAFT" | "ACTIVE" | "PAUSED" }
 */
r.patch("/:id", async (req, res) => {
  const id = String(req.params.id);
  const patch: any = {};
  if (typeof req.body?.name === "string") patch.name = req.body.name;
  if (typeof req.body?.status === "string") patch.status = req.body.status as WorkflowStatus;

  const wf = await prisma.workflow.update({ where: { id }, data: patch });
  res.json({ ok: true, data: wf });
});

/** PUT /api/workflows/:id/steps
 *  Body: { steps: Array<{ type:"SEND_TEXT", textBody:string } | { type:"WAIT", waitMs:number }> }
 *  Replaces the step list atomically.
 */
r.put("/:id/steps", async (req, res) => {
  const id = String(req.params.id);
  const incoming = Array.isArray(req.body?.steps) ? req.body.steps : [];

  // Normalize user payload into DB rows
  const toRows = (list: any[]) =>
    list.map((s, i) => {
      if (s?.type === "WAIT") {
        return {
          order: i + 1,
          type: StepType.WAIT,
          waitMs: Number(s.waitMs) || 0,
          textBody: null,
        };
      }
      // default to SEND_TEXT
      return {
        order: i + 1,
        type: StepType.SEND_TEXT,
        textBody: String(s.textBody || ""),
        waitMs: null,
      };
    });

  const rows = toRows(incoming);

  await prisma.$transaction(async (tx) => {
    await tx.workflowStep.deleteMany({ where: { workflowId: id } });
    if (rows.length) {
      await tx.workflowStep.createMany({
        data: rows.map((r) => ({ workflowId: id, ...r })),
      });
    }
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

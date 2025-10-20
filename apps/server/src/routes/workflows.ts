import { Router } from "express";
import type { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
export const workflows = Router();

// Prisma v5: enums live under Prisma.$Enums
const { WorkflowStatus, StepType } = Prisma.$Enums;

/**
 * GET /api/workflows?full=1
 * List workflows (optionally include steps)
 */
workflows.get("/", async (req: Request, res: Response) => {
  try {
    const full = String(req.query.full || "") === "1";
    const data = await prisma.workflow.findMany({
      orderBy: { createdAt: "desc" },
      include: full ? { steps: true } : undefined,
    });
    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

/**
 * POST /api/workflows
 * body: { name: string }
 */
workflows.post("/", async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || "Untitled workflow");
    const row = await prisma.workflow.create({
      data: { name, status: WorkflowStatus.DRAFT },
    });
    res.json({ ok: true, data: row });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

/**
 * PATCH /api/workflows/:id
 * body: { name?: string, status?: "ACTIVE" | "PAUSED" | "DRAFT" }
 */
workflows.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const patch: Prisma.WorkflowUpdateInput = {};

    if (typeof req.body?.name === "string") patch.name = req.body.name;

    if (typeof req.body?.status === "string") {
      const s = String(req.body.status).toUpperCase();
      if (s === "ACTIVE" || s === "PAUSED" || s === "DRAFT") {
        patch.status = s as typeof WorkflowStatus.ACTIVE; // enum value
      }
    }

    const row = await prisma.workflow.update({ where: { id }, data: patch });
    res.json({ ok: true, data: row });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

/**
 * PUT /api/workflows/:id/steps
 * body: { steps: Array<{ type: "SEND_TEXT" | "WAIT"; textBody?: string; waitMs?: number }> }
 * Replaces all steps for the workflow
 */
workflows.put("/:id/steps", async (req: Request, res: Response) => {
  const { id } = req.params;

  const steps: Array<{ type: string; textBody?: string; waitMs?: number }> =
    Array.isArray(req.body?.steps) ? req.body.steps : [];

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });

      if (steps.length) {
        await tx.workflowStep.createMany({
          data: steps.map((s, i) => ({
            workflowId: id,
            order: i + 1,
            type: s.type === "WAIT" ? StepType.WAIT : StepType.SEND_TEXT,
            textBody: s.type === "SEND_TEXT" ? (s.textBody ?? "") : null,
            waitMs: s.type === "WAIT" ? (s.waitMs ?? 0) : null,
          })),
        });
      }
    });

    const full = await prisma.workflow.findUnique({
      where: { id },
      include: { steps: true },
    });

    res.json({ ok: true, data: full });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

/**
 * DELETE /api/workflows/:id
 */
workflows.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });
      await tx.workflow.delete({ where: { id } });
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

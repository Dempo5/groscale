import { Router } from "express";
import { WorkflowStatus, StepType } from "@prisma/client";
import { prisma } from "../db.js"; // ✅ use the same prisma as tags.ts

const r = Router();

/** Helper: sanitize output for dropdowns */
function toLite(w: any) {
  return { id: w.id, name: w.name, status: w.status };
}

/** Optionally resolve an owner (mirrors your tags.ts approach if you add auth later) */
async function getOwnerId(req: any): Promise<string | null> {
  // If you attach req.user later, return that id; for now, you can return null to include all
  return req?.user?.id ? String(req.user.id) : null;
}

/** GET /api/workflows?full=1&lite=1
 *  - full=1: include steps
 *  - lite=1: return minimal shape { ok, workflows:[{id,name,status}] } for selects
 */
r.get("/", async (req, res) => {
  try {
    const includeSteps = String(req.query.full || "") === "1";
    const lite = String(req.query.lite || "") === "1";
    const ownerId = await getOwnerId(req);

    const rows = await prisma.workflow.findMany({
      where: ownerId ? { ownerId } : undefined, // optional isolation
      orderBy: { createdAt: "desc" },
      include: includeSteps ? { steps: { orderBy: { order: "asc" } } } : undefined,
    });

    if (lite) {
      // minimal payload for dropdowns
      return res.json({ ok: true, workflows: rows.map(toLite) });
    }

    return res.json({ ok: true, data: rows });
  } catch (e) {
    console.error("list workflows error:", e);
    res.status(500).json({ ok: false, error: "Failed to list workflows" });
  }
});

/** POST /api/workflows { name } */
r.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim() || "Untitled workflow";
    const ownerId = await getOwnerId(req); // optional: attach owner later
    const row = await prisma.workflow.create({
      data: { name, ownerId }, // ownerId can be null per your schema
    });
    res.json({ ok: true, data: row });
  } catch (e) {
    console.error("create workflow error:", e);
    res.status(500).json({ ok: false, error: "Failed to create workflow" });
  }
});

/** PATCH /api/workflows/:id { name?, status? } */
r.patch("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const patch: any = {};

    if (typeof req.body?.name === "string") patch.name = req.body.name;

    if (typeof req.body?.status === "string") {
      const map: Record<string, WorkflowStatus> = {
        draft: "DRAFT",
        active: "ACTIVE",
        paused: "PAUSED",
        DRAFT: "DRAFT",
        ACTIVE: "ACTIVE",
        PAUSED: "PAUSED",
      };
      const s = map[req.body.status];
      if (s) patch.status = s;
    }

    const row = await prisma.workflow.update({ where: { id }, data: patch });
    res.json({ ok: true, data: row });
  } catch (e) {
    console.error("update workflow error:", e);
    res.status(500).json({ ok: false, error: "Failed to update workflow" });
  }
});

/** PUT /api/workflows/:id/steps  { steps:[...] } */
r.put("/:id/steps", async (req, res) => {
  try {
    const id = String(req.params.id);
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

    const clean = steps.map((s: any, i: number) => {
      if (s?.type === "SEND_TEXT") {
        return { type: StepType.SEND_TEXT, order: i + 1, textBody: String(s.textBody || "") };
      }
      if (s?.type === "WAIT") {
        const wait = Number(s.waitMs ?? 0) || 0;
        return { type: StepType.WAIT, order: i + 1, waitMs: wait };
      }
      throw new Error(`Invalid step at index ${i}`);
    });

    await prisma.$transaction([
      prisma.workflowStep.deleteMany({ where: { workflowId: id } }),
      prisma.workflow.update({
        where: { id },
        data: { steps: { create: clean } },
      }),
    ]);

    const full = await prisma.workflow.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    res.json({ ok: true, data: full });
  } catch (e) {
    console.error("replace steps error:", e);
    res.status(500).json({ ok: false, error: "Failed to replace steps" });
  }
});

/** DELETE /api/workflows/:id */
r.delete("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.workflowStep.deleteMany({ where: { workflowId: id } });
    await prisma.workflow.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error("delete workflow error:", e);
    res.status(500).json({ ok: false, error: "Failed to delete workflow" });
  }
});

export default r;

import { Router, type Response, type NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth.js";

const prisma = new PrismaClient();
const router = Router();

/** Optional auth: never rejects; just passes through and preserves req.userId if previous middleware set it. */
function maybeAuth(req: any, _res: Response, next: NextFunction) {
  // If your auth middleware already attaches req.userId for ALL requests,
  // you can remove this and just use requireAuth where needed.
  next();
}

/** GET /api/workflows
 * - If logged in: return {ownerId = userId} OR {ownerId = null}
 * - If not logged in: return {ownerId = null}
 * Returns a plain array so the web app can consume directly.
 */
router.get("/", maybeAuth, async (req: any, res: Response) => {
  const uid = req.userId ?? null;

  const rows = await prisma.workflow.findMany({
    where: uid
      ? { OR: [{ ownerId: uid }, { ownerId: null }] }
      : { ownerId: null },
    select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  res.json(rows);
});

/** GET /api/workflows?full=1
 * Full objects (with steps) for the Workflows page editor.
 */
router.get("/", maybeAuth, async (req: any, res: Response) => {
  if (!("full" in req.query)) return; // the lightweight handler above already responded
  const uid = req.userId ?? null;

  const rows = await prisma.workflow.findMany({
    where: uid
      ? { OR: [{ ownerId: uid }, { ownerId: null }] }
      : { ownerId: null },
    include: { steps: true },
    orderBy: { updatedAt: "desc" },
  });

  res.json({ ok: true, data: rows });
});

/** POST /api/workflows
 * Create workflow. If authenticated, attach ownerId so it always shows up for you.
 */
router.post("/", maybeAuth, async (req: any, res: Response) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ ok: false, error: "Name required" });
  }

  const row = await prisma.workflow.create({
    data: {
      name,
      status: "DRAFT",
      ownerId: req.userId ?? null, // attach owner when available
    },
    select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
  });

  res.json({ ok: true, data: row });
});

/** PATCH /api/workflows/:id
 * Update name/status. Requires auth for safety.
 */
router.patch("/:id", requireAuth, async (req: any, res: Response) => {
  const id = req.params.id;
  const { name, status } = req.body ?? {};
  const body: any = {};
  if (name !== undefined) body.name = String(name);
  if (status !== undefined) {
    const map: Record<string, "DRAFT" | "ACTIVE" | "PAUSED"> = {
      draft: "DRAFT",
      active: "ACTIVE",
      paused: "PAUSED",
      DRAFT: "DRAFT",
      ACTIVE: "ACTIVE",
      PAUSED: "PAUSED",
    };
    body.status = map[String(status)] ?? "DRAFT";
  }

  const row = await prisma.workflow.update({
    where: { id },
    data: body,
    select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
  });

  res.json({ ok: true, data: row });
});

/** PUT /api/workflows/:id/steps
 * Replace all steps atomically. Requires auth.
 */
router.put("/:id/steps", requireAuth, async (req: any, res: Response) => {
  const id = req.params.id;
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

  await prisma.$transaction([
    prisma.workflowStep.deleteMany({ where: { workflowId: id } }),
    prisma.workflowStep.createMany({
      data: steps.map((s: any, i: number) => ({
        workflowId: id,
        order: i,
        type: s.type === "WAIT" ? "WAIT" : "SEND_TEXT",
        textBody: s.type === "SEND_TEXT" ? String(s.textBody ?? "") : null,
        waitMs: s.type === "WAIT" ? Number(s.waitMs ?? 0) : null,
      })),
    }),
  ]);

  res.json({ ok: true });
});

/** DELETE /api/workflows/:id */
router.delete("/:id", requireAuth, async (req: any, res: Response) => {
  const id = req.params.id;
  await prisma.workflow.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;

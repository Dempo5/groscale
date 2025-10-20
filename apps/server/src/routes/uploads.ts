import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { requireAuth } from "../middleware/auth.js";           // you already have this
// If you also have a "requireAuthOptional" you can use that for GET.
// If not, this small helper makes req.userId optional:
import type { Request, Response, NextFunction } from "express";

const prisma = new PrismaClient();
const router = Router();

// Optional auth middleware: sets req.userId when token present; never rejects.
function maybeAuth(req: any, _res: Response, next: NextFunction) {
  try {
    // if your requireAuth exposes a decode helper, use that here instead:
    const hdr = req.headers.authorization || "";
    const m = hdr.match(/^Bearer\s+(.+)/i);
    if (m) {
      // your existing decode in middleware/auth.js
      // e.g., req.userId = verifyAndGetUserId(m[1]);
      // if you don't have one handy, just leave this as is and keep GET open.
    }
  } catch {}
  next();
}

/**
 * GET /api/workflows
 * Show lightweight list for pickers.
 * - If logged in: return rows owned by the user OR with ownerId null.
 * - If not logged in: return rows with ownerId null.
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

  // return a plain array (your web client already unwraps either shape)
  res.json(rows);
});

/**
 * GET /api/workflows?full=1
 * Full objects (e.g., for the Workflows page editor).
 */
router.get("/", maybeAuth, async (req: any, res: Response) => {
  if (!("full" in req.query)) return; // this route handled above
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

/**
 * POST /api/workflows
 * Create a workflow; attach ownerId if authenticated.
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
      ownerId: req.userId ?? null,   // << attach owner if we have one
    },
    select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
  });

  res.json({ ok: true, data: row });
});

/**
 * PATCH /api/workflows/:id
 * Update basic metadata; map friendly status (draft/active/paused) if the client sends it.
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

/**
 * PUT /api/workflows/:id/steps
 * Replace all steps atomically.
 */
router.put("/:id/steps", requireAuth, async (req: any, res: Response) => {
  const id = req.params.id;
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

  // Replace: delete existing then create many
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

/**
 * DELETE /api/workflows/:id
 */
router.delete("/:id", requireAuth, async (req: any, res: Response) => {
  const id = req.params.id;
  await prisma.workflow.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;

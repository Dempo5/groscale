import { Router } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// GET tags
router.get("/api/tags", async (_req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  res.json({ ok: true, tags });
});

// POST create tag
router.post("/api/tags", async (req, res, next) => {
  try {
    const { name, color, workflowId } = req.body as { name: string; color?: string | null; workflowId?: string | null };
    const tag = await prisma.tag.create({
      data: {
        name,
        color: color ?? null,
        workflowId: workflowId ?? null,
        // TODO: set real ownerId from auth; using placeholder for now
        ownerId: (req as any).user?.id ?? "demo-owner",
      },
    });
    res.json({ ok: true, tag });
  } catch (e) { next(e); }
});

// PATCH update tag
router.patch("/api/tags/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, color, workflowId } = req.body as { name?: string; color?: string | null; workflowId?: string | null };

    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(color !== undefined ? { color: color ?? null } : {}),
        ...(workflowId !== undefined ? { workflowId: workflowId ?? null } : {}),
      },
    });
    res.json({ ok: true, tag });
  } catch (e) { next(e); }
});

// DELETE tag
router.delete("/api/tags/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.tag.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;

import { Router } from "express";
import type { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

function toDTO(t: any) {
  return {
    id: t.id,
    name: t.name,
    color: t.color ?? null,
    workflowId: t.workflowId ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** GET /api/tags */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    res.json({ ok: true, tags: rows.map(toDTO) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

/** POST /api/tags { name, color?, workflowId? } */
router.post("/", async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Name required" });

    const row = await prisma.tag.create({
      data: {
        name,
        color: req.body?.color ?? null,
        workflowId: req.body?.workflowId ?? null,
      },
    });
    res.json({ ok: true, tag: toDTO(row) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

/** PATCH /api/tags/:id { name?, color?, workflowId? } */
router.patch("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const patch: any = {};
    if (Object.prototype.hasOwnProperty.call(req.body, "name")) patch.name = req.body.name;
    if (Object.prototype.hasOwnProperty.call(req.body, "color")) patch.color = req.body.color ?? null;
    if (Object.prototype.hasOwnProperty.call(req.body, "workflowId")) patch.workflowId = req.body.workflowId ?? null;

    const row = await prisma.tag.update({ where: { id }, data: patch });
    res.json({ ok: true, tag: toDTO(row) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

/** DELETE /api/tags/:id */
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.leadTag.deleteMany({ where: { tagId: id } });
      await tx.tag.delete({ where: { id } });
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

export default router;
import { Router, type Request, type Response } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

/** toDTO keeps response shape stable for the frontend */
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
router.get("/", async (req: Request, res: Response) => {
  try {
    const ownerId = (req as AuthedRequest).userId!;

    const tags = await prisma.tag.findMany({
      where: { ownerId },
      orderBy: { name: "asc" },
    });

    res.json({ ok: true, tags: tags.map(toDTO) });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** POST /api/tags { name, color?, workflowId? } */
router.post("/", async (req: Request, res: Response) => {
  try {
    const ownerId = (req as AuthedRequest).userId!;

    const tag = await prisma.tag.create({
      data: {
        ownerId,
        name: String(req.body?.name || "").trim(),
        color: (req.body?.color ?? null) || null,
        workflowId: (req.body?.workflowId ?? null) || null,
      },
    });

    res.json({ ok: true, tag: toDTO(tag) });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** PATCH /api/tags/:id */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const ownerId = (req as AuthedRequest).userId!;
    const { id } = req.params;

    const existing = await prisma.tag.findFirst({
      where: {
        id,
        ownerId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: "Tag not found",
      });
    }

    const data: any = {};

    if (req.body?.name !== undefined) {
      data.name = String(req.body.name);
    }

    if (req.body?.color !== undefined) {
      data.color = req.body.color ?? null;
    }

    if (req.body?.workflowId !== undefined) {
      data.workflowId = req.body.workflowId || null;
    }

    const tag = await prisma.tag.update({
      where: { id },
      data,
    });

    res.json({ ok: true, tag: toDTO(tag) });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** DELETE /api/tags/:id */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const ownerId = (req as AuthedRequest).userId!;
    const { id } = req.params;

    const existing = await prisma.tag.findFirst({
      where: {
        id,
        ownerId,
      },
    });

    if (!existing) {
      return res.status(404).json({
        ok: false,
        error: "Tag not found",
      });
    }

    await prisma.leadTag.deleteMany({
      where: { tagId: id },
    });

    await prisma.tag.delete({
      where: { id },
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

export default router;

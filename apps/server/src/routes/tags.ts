// CRUD for Tags (name-only today; owner-scoped).
// If your Tag model also has `color` or `workflowId`, this will pass them through when present.
import { Router } from "express";
import { prisma } from "../../prisma";

const router = Router();

// auth helper — adapt if your auth attaches user differently
function getOwnerId(req: any) {
  return req?.user?.id ?? "system";
}

// GET /api/tags  -> [{id,name,(color?),(workflowId?)}]
router.get("/", async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const tags = await prisma.tag.findMany({
      where: { ownerId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ...(("color" in (prisma.tag as any).fields) ? { color: true } : {}), ...(("workflowId" in (prisma.tag as any).fields) ? { workflowId: true } : {}) } as any
    });
    res.json({ ok: true, tags });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to load tags" });
  }
});

// POST /api/tags { name, color?, workflowId? }
router.post("/", async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const { name, color, workflowId } = req.body || {};
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ ok: false, error: "name required" });
    }

    // allow idempotent create by (ownerId,name)
    const tag = await prisma.tag.upsert({
      where: { ownerId_name: { ownerId, name: String(name).trim() } },
      create: { ownerId, name: String(name).trim(), ...(color ? { color } : {}), ...(workflowId ? { workflowId } : {}) } as any,
      update: { ...(color ? { color } : {}), ...(workflowId ? { workflowId } : {}) } as any,
      select: { id: true, name: true, ...(("color" in (prisma.tag as any).fields) ? { color: true } : {}), ...(("workflowId" in (prisma.tag as any).fields) ? { workflowId: true } : {}) } as any
    });

    res.json({ ok: true, tag });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to create tag" });
  }
});

// PATCH /api/tags/:id { name?, color?, workflowId? }
router.patch("/:id", async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const id = String(req.params.id);
    const { name, color, workflowId } = req.body || {};

    // enforce ownership
    const exists = await prisma.tag.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!exists) return res.status(404).json({ ok: false, error: "tag not found" });

    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(workflowId !== undefined ? { workflowId } : {})
      } as any,
      select: { id: true, name: true, ...(("color" in (prisma.tag as any).fields) ? { color: true } : {}), ...(("workflowId" in (prisma.tag as any).fields) ? { workflowId: true } : {}) } as any
    });

    res.json({ ok: true, tag });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to update tag" });
  }
});

// DELETE /api/tags/:id
router.delete("/:id", async (req, res) => {
  try {
    const ownerId = getOwnerId(req);
    const id = String(req.params.id);

    // enforce ownership
    const exists = await prisma.tag.findFirst({ where: { id, ownerId }, select: { id: true } });
    if (!exists) return res.status(404).json({ ok: false, error: "tag not found" });

    // remove lead links first (if you have join table)
    await prisma.leadTag.deleteMany({ where: { tagId: id } }).catch(() => {});

    await prisma.tag.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "Failed to delete tag" });
  }
});

export default router;

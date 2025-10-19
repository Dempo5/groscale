import { Router } from "express";
import { prisma } from "../../prisma";

const router = Router();

// helper to get owner
const ownerFrom = (req: any) => (req.user?.id ?? "system");

// ---- List
router.get("/", async (req, res) => {
  const ownerId = ownerFrom(req);
  const q = String(req.query.q || "").trim();
  const data = await prisma.tag.findMany({
    where: { ownerId, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, color: true, workflowId: true },
  });
  res.json(data);
});

// ---- Create
router.post("/", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { name, color, workflowId } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ ok: false, error: "name required" });

  const tag = await prisma.tag.create({
    data: { ownerId, name: String(name).trim(), color: color || null, workflowId: workflowId || null },
    select: { id: true, name: true, color: true, workflowId: true },
  });
  res.json(tag);
});

// ---- Update
router.patch("/:id", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { id } = req.params;
  const { name, color, workflowId } = req.body || {};
  const tag = await prisma.tag.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(color !== undefined ? { color: color || null } : {}),
      ...(workflowId !== undefined ? { workflowId: workflowId || null } : {}),
    },
    select: { id: true, name: true, color: true, workflowId: true },
  });
  // Ensure tag belongs to owner
  const ok = await prisma.tag.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!ok) return res.status(403).json({ ok: false, error: "forbidden" });
  res.json(tag);
});

// ---- Delete
router.delete("/:id", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { id } = req.params;
  const tag = await prisma.tag.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!tag) return res.status(404).json({ ok: false, error: "not found" });
  await prisma.tag.delete({ where: { id } });
  res.json({ ok: true });
});

// ---- Bulk apply a tag to many leads (and enqueue workflow if the tag has one)
router.post("/:id/apply", async (req, res) => {
  const ownerId = ownerFrom(req);
  const { id } = req.params;
  const { leadIds = [] } = req.body || {};
  if (!Array.isArray(leadIds) || !leadIds.length) {
    return res.status(400).json({ ok: false, error: "leadIds required" });
  }

  const tag = await prisma.tag.findFirst({
    where: { id, ownerId },
    select: { id: true, workflowId: true },
  });
  if (!tag) return res.status(404).json({ ok: false, error: "tag not found" });

  // create LeadTag links (skip existing)
  await prisma.$transaction(async (tx) => {
    for (const leadId of leadIds) {
      await tx.leadTag.upsert({
        where: { leadId_tagId: { leadId, tagId: tag.id } },
        create: { leadId, tagId: tag.id },
        update: {},
      });
    }
  });

  // enqueue workflow job (if configured)
  if (tag.workflowId) {
    await prisma.job.create({
      data: {
        ownerId,
        type: "START_WORKFLOW",
        payload: { workflowId: tag.workflowId, leadIds },
      },
    });
  }

  res.json({ ok: true, applied: leadIds.length, workflowQueued: !!tag.workflowId });
});

export default router;

// apps/server/src/routes/lead-tags.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../prisma.js";

const r = Router();

const toTagDTO = (t: any) => ({
  id: t.id,
  name: t.name,
  color: t.color ?? null,
  workflowId: t.workflowId ?? null,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

/**
 * GET /api/leads/:leadId/tags
 * List applied tags (no createdAt on join table, so no time-based sort).
 */
r.get("/:leadId/tags", async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const rows = await prisma.leadTag.findMany({
      where: { leadId },
      include: { tag: true },
    });

    res.json({
      ok: true,
      data: rows.map((lt) => ({
        leadId: lt.leadId,
        tagId: lt.tagId,
        tag: toTagDTO(lt.tag),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/**
 * POST /api/leads/:leadId/tags { tagId }
 * Attach a tag. Since we don’t have timestamps on the join row,
 * we emulate “latest wins” for the *response* by returning the new tag first.
 */
r.post("/:leadId/tags", async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const tagId = String(req.body?.tagId || "");
    if (!tagId) return res.status(400).json({ ok: false, error: "tagId required" });

    const [lead, tag] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId } }),
      prisma.tag.findUnique({ where: { id: tagId } }),
    ]);
    if (!lead) return res.status(404).json({ ok: false, error: "lead not found" });
    if (!tag) return res.status(404).json({ ok: false, error: "tag not found" });

    // idempotent: ensure a single row exists
    await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId, tagId } },
      create: { leadId, tagId },
      update: {},
    });

    // build response list where the *newly attached* tag is first (so UI can treat it as “latest”)
    const all = await prisma.leadTag.findMany({
      where: { leadId },
      include: { tag: true },
    });

    const reordered = [
      { leadId, tagId, tag: toTagDTO(tag) },
      ...all
        .filter((x) => !(x.tagId === tagId))
        .map((x) => ({ leadId: x.leadId, tagId: x.tagId, tag: toTagDTO(x.tag) })),
    ];

    res.json({ ok: true, data: reordered });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/**
 * DELETE /api/leads/:leadId/tags/:tagId
 */
r.delete("/:leadId/tags/:tagId", async (req: Request, res: Response) => {
  try {
    const { leadId, tagId } = req.params;
    await prisma.leadTag.delete({
      where: { leadId_tagId: { leadId, tagId } },
    });
    res.json({ ok: true });
  } catch (e: any) {
    // idempotent deletes
    if (String((e as any)?.code) === "P2025") return res.json({ ok: true });
    res.status(500).json({ ok: false, error: (e as any)?.message || "failed" });
  }
});

export default r;

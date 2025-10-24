// apps/server/src/routes/lead-tags.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../prisma.js";

const r = Router();

// Helper to shape payload
const toTagDTO = (t: any) => ({
  id: t.id,
  name: t.name,
  color: t.color ?? null,
  workflowId: t.workflowId ?? null,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

// GET /api/leads/:leadId/tags  -> list applied tags (newest first)
r.get("/:leadId/tags", async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const rows = await prisma.leadTag.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
      include: { tag: true },
    });

    res.json({
      ok: true,
      data: rows.map((lt) => ({
        leadId: lt.leadId,
        tagId: lt.tagId,
        createdAt: lt.createdAt,
        tag: toTagDTO(lt.tag),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

// POST /api/leads/:leadId/tags { tagId }  -> attach tag (idempotent)
r.post("/:leadId/tags", async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const tagId = String(req.body?.tagId || "");
    if (!tagId) return res.status(400).json({ ok: false, error: "tagId required" });

    // ensure lead & tag exist
    const [lead, tag] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId } }),
      prisma.tag.findUnique({ where: { id: tagId } }),
    ]);
    if (!lead) return res.status(404).json({ ok: false, error: "lead not found" });
    if (!tag) return res.status(404).json({ ok: false, error: "tag not found" });

    // upsert so repeated attaches are safe, but timestamp updates to make it "latest"
    const lt = await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId, tagId } },
      create: { leadId, tagId },
      update: { createdAt: new Date() }, // move to top as "most recent"
      include: { tag: true },
    });

    res.json({
      ok: true,
      data: {
        leadId: lt.leadId,
        tagId: lt.tagId,
        createdAt: lt.createdAt,
        tag: toTagDTO(lt.tag),
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

// DELETE /api/leads/:leadId/tags/:tagId  -> detach tag
r.delete("/:leadId/tags/:tagId", async (req: Request, res: Response) => {
  try {
    const { leadId, tagId } = req.params;
    await prisma.leadTag.delete({
      where: { leadId_tagId: { leadId, tagId } },
    });
    res.json({ ok: true });
  } catch (e: any) {
    // make deletes idempotent
    if (String(e?.code) === "P2025") return res.json({ ok: true });
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

export default r;

// apps/server/src/routes/leads.ts
import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";

const router = Router();

const STAGES = ["NEW", "CONTACTED", "POSITIVE_RESPONSE", "QUOTED", "APPOINTMENT", "SOLD", "NOT_INTERESTED"];
const PAGE = 50;

/**
 * GET /api/leads?q=&stage=&tagId=&cursor=
 * Search by name/email/phone, filter by stage or tag, 50 at a time.
 */
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const ownerId = req.userId!;
    const q = String(req.query.q || "").trim();
    const stage = String(req.query.stage || "").toUpperCase();
    const tagId = String(req.query.tagId || "");
    const cursor = String(req.query.cursor || "");

    const digits = q.replace(/\D/g, "");
    const where: any = { ownerId };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ];
    }
    if (STAGES.includes(stage)) where.stage = stage;
    if (tagId) where.tags = { some: { tagId } };

    const [total, rows] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: PAGE + 1, // one extra tells us if there's another page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          stage: true,
          city: true,
          state: true,
          createdAt: true,
          tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          threads: {
            orderBy: { lastMessageAt: "desc" },
            take: 1,
            select: { id: true, lastMessageAt: true },
          },
        },
      }),
    ]);

    const hasMore = rows.length > PAGE;
    const page = hasMore ? rows.slice(0, PAGE) : rows;

    res.json({
      ok: true,
      total,
      nextCursor: hasMore ? page[page.length - 1]?.id : null,
      data: page.map((l: any) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        stage: l.stage,
        city: l.city,
        state: l.state,
        createdAt: l.createdAt,
        tags: l.tags.map((t: any) => t.tag),
        threadId: l.threads[0]?.id ?? null,
        lastMessageAt: l.threads[0]?.lastMessageAt ?? null,
      })),
    });
  } catch (err: any) {
    console.error("list leads error", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/** POST /api/leads — add one lead by hand */
router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim() || null;
    const phone = String(req.body?.phone || "").trim() || null;
    if (!name) return res.status(400).json({ ok: false, error: "Name is required" });
    if (!email && !phone) return res.status(400).json({ ok: false, error: "Add a phone number or an email" });

    const lead = await prisma.lead.create({
      data: { name, email, phone, ownerId: req.userId! },
    });
    res.status(201).json({ ok: true, data: lead });
  } catch (err: any) {
    console.error("create lead error", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/** POST /api/leads/bulk/stage { ids, stage } — move several leads at once */
router.post("/bulk/stage", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const ownerId = req.userId!;
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
    const stage = String(req.body?.stage || "").toUpperCase();
    if (!ids.length) return res.status(400).json({ ok: false, error: "No leads selected" });
    if (!STAGES.includes(stage)) return res.status(400).json({ ok: false, error: "Unknown stage" });

    // only this user's leads, and only the ones actually changing
    const leads: { id: string; stage: string }[] = await prisma.lead.findMany({
      where: { id: { in: ids }, ownerId, stage: { not: stage as any } },
      select: { id: true, stage: true },
    });

    await prisma.$transaction([
      prisma.lead.updateMany({ where: { id: { in: leads.map((l) => l.id) } }, data: { stage: stage as any } }),
      prisma.stageChange.createMany({
        data: leads.map((l) => ({ leadId: l.id, fromStage: l.stage as any, toStage: stage as any })),
      }),
    ]);

    res.json({ ok: true, changed: leads.length });
  } catch (err: any) {
    console.error("bulk stage error", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/** POST /api/leads/bulk/tag { ids, tagId, remove? } */
router.post("/bulk/tag", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const ownerId = req.userId!;
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
    const tagId = String(req.body?.tagId || "");
    const remove = req.body?.remove === true;
    if (!ids.length) return res.status(400).json({ ok: false, error: "No leads selected" });

    const tag = await prisma.tag.findFirst({ where: { id: tagId, ownerId }, select: { id: true } });
    if (!tag) return res.status(404).json({ ok: false, error: "Tag not found" });

    const owned: { id: string }[] = await prisma.lead.findMany({ where: { id: { in: ids }, ownerId }, select: { id: true } });

    if (remove) {
      const { count } = await prisma.leadTag.deleteMany({
        where: { tagId, leadId: { in: owned.map((l) => l.id) } },
      });
      return res.json({ ok: true, changed: count });
    }

    const { count } = await prisma.leadTag.createMany({
      data: owned.map((l) => ({ leadId: l.id, tagId })),
      skipDuplicates: true,
    });
    res.json({ ok: true, changed: count });
  } catch (err: any) {
    console.error("bulk tag error", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/** POST /api/leads/:id/thread — open this lead's conversation, creating it if needed */
router.post("/:id/thread", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const ownerId = req.userId!;
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ownerId },
      select: { id: true, phone: true },
    });
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    if (!lead.phone) return res.status(400).json({ ok: false, error: "This lead has no phone number" });

    const existing = await prisma.messageThread.findFirst({
      where: { leadId: lead.id, ownerId },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true },
    });
    if (existing) return res.json({ ok: true, data: { threadId: existing.id } });

    const created = await prisma.messageThread.create({
      data: { ownerId, leadId: lead.id },
      select: { id: true },
    });
    res.json({ ok: true, data: { threadId: created.id } });
  } catch (err: any) {
    console.error("open thread error", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;

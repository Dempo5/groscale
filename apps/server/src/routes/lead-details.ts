// apps/server/src/routes/lead-details.ts
// Lead details for the inbox's right panel: fields, stage + history, notes.
// Every route checks the lead belongs to the logged-in user.
import { Router, type Request, type Response } from "express";
import { prisma } from "../prisma.js";
import type { AuthedRequest } from "../middleware/auth.js";

const router = Router();

const STAGES = [
  "NEW",
  "CONTACTED",
  "POSITIVE_RESPONSE",
  "QUOTED",
  "APPOINTMENT",
  "SOLD",
  "NOT_INTERESTED",
] as const;
type Stage = (typeof STAGES)[number];

const ownerOf = (req: Request) => (req as AuthedRequest).userId!;

async function ownedLead(id: string, ownerId: string) {
  return prisma.lead.findFirst({ where: { id, ownerId }, select: { id: true, stage: true } });
}

// "", null -> null; otherwise a whole number within range, or undefined if invalid
function intOrNull(v: unknown, max: number): number | null | undefined {
  if (v === "" || v === null) return null;
  const n = Math.round(Number(String(v).replace(/[$,\s]/g, "")));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
}
function strOrNull(v: unknown, maxLen: number): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, maxLen) : null;
}

const DETAIL_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  stage: true,
  dob: true,
  householdSize: true,
  income: true,
  quoteMonthly: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  createdAt: true,
} as const;

/** GET /api/leads/:id/details */
router.get("/:id/details", async (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ownerId },
      select: {
        ...DETAIL_SELECT,
        stageChanges: { orderBy: { createdAt: "desc" }, take: 50 },
        notes: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    res.json({ ok: true, data: lead });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** PATCH /api/leads/:id  { name?, email?, dob?, householdSize?, income?, quoteMonthly?, address?, city?, state?, zip? } */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    if (!(await ownedLead(req.params.id, ownerId))) {
      return res.status(404).json({ ok: false, error: "Lead not found" });
    }
    const b = req.body || {};
    const data: Record<string, any> = {};

    const strings: [string, number][] = [
      ["name", 120], ["email", 191], ["dob", 20], ["address", 200], ["city", 100], ["state", 40], ["zip", 15],
    ];
    for (const [k, max] of strings) {
      if (b[k] === undefined) continue;
      const v = strOrNull(b[k], max);
      if (v === undefined) return res.status(400).json({ ok: false, error: `Invalid ${k}` });
      if (k === "name" && !v) return res.status(400).json({ ok: false, error: "Name can't be empty" });
      data[k] = v;
    }
    const ints: [string, number][] = [["householdSize", 30], ["income", 10_000_000], ["quoteMonthly", 100_000]];
    for (const [k, max] of ints) {
      if (b[k] === undefined) continue;
      const v = intOrNull(b[k], max);
      if (v === undefined) return res.status(400).json({ ok: false, error: `Invalid ${k}` });
      data[k] = v;
    }

    const lead = await prisma.lead.update({ where: { id: req.params.id }, data, select: DETAIL_SELECT });
    res.json({ ok: true, data: lead });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** POST /api/leads/:id/stage  { stage } — updates the stage and records history */
router.post("/:id/stage", async (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    const lead = await ownedLead(req.params.id, ownerId);
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

    const next = String(req.body?.stage || "").toUpperCase() as Stage;
    if (!STAGES.includes(next)) return res.status(400).json({ ok: false, error: "Unknown stage" });
    if (next === lead.stage) return res.json({ ok: true, data: null });

    // both writes succeed together or not at all
    const [, change] = await prisma.$transaction([
      prisma.lead.update({ where: { id: lead.id }, data: { stage: next } }),
      prisma.stageChange.create({ data: { leadId: lead.id, fromStage: lead.stage, toStage: next } }),
    ]);
    res.json({ ok: true, data: change });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** POST /api/leads/:id/notes  { body } */
router.post("/:id/notes", async (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    if (!(await ownedLead(req.params.id, ownerId))) {
      return res.status(404).json({ ok: false, error: "Lead not found" });
    }
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ ok: false, error: "Note is empty" });
    if (body.length > 5000) return res.status(400).json({ ok: false, error: "Note is too long" });

    const note = await prisma.note.create({ data: { leadId: req.params.id, authorId: ownerId, body } });
    res.json({ ok: true, data: note });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** DELETE /api/leads/:id/notes/:noteId */
router.delete("/:id/notes/:noteId", async (req: Request, res: Response) => {
  try {
    const ownerId = ownerOf(req);
    if (!(await ownedLead(req.params.id, ownerId))) {
      return res.status(404).json({ ok: false, error: "Lead not found" });
    }
    const { count } = await prisma.note.deleteMany({ where: { id: req.params.noteId, leadId: req.params.id } });
    if (!count) return res.status(404).json({ ok: false, error: "Note not found" });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

export default router;

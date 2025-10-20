import { Router } from "express";
import twilio from "twilio";
import { prisma } from "../prisma.js";

const router = Router();
const tw = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function getDefaultFromNumber(ownerId?: string | null): Promise<string | null> {
  const pn = await prisma.phoneNumber.findFirst({
    where: { ownerId: ownerId || undefined, isDefault: true },
    select: { number: true },
  });
  if (pn?.number) return pn.number;
  return process.env.TWILIO_FROM ?? null;
}

/**
 * GET /api/messages/thread/:leadId
 * Returns messages for a lead ordered by time.
 */
router.get("/thread/:leadId", async (req, res) => {
  const leadId = String(req.params.leadId);
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

  const thread = await prisma.messageThread.findFirst({
    where: { ownerId: lead.ownerId, leadId: leadId },
  });

  if (!thread) return res.json({ ok: true, data: [] });

  const messages = await prisma.message.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });

  res.json({ ok: true, data: messages });
});

/**
 * POST /api/messages/send
 * body: { leadId: string, body: string }
 */
router.post("/send", async (req, res) => {
  try {
    const leadId = String(req.body?.leadId || "");
    const body = String(req.body?.body || "");

    if (!leadId || !body) return res.status(400).json({ ok: false, error: "leadId & body required" });

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead?.phone) return res.status(400).json({ ok: false, error: "Lead missing phone" });

    const fromNumber = await getDefaultFromNumber(lead.ownerId);
    if (!fromNumber) return res.status(400).json({ ok: false, error: "No default from number configured" });

    // upsert/find thread
    const thread = await prisma.messageThread.upsert({
      where: { ownerId_leadId: { ownerId: lead.ownerId, leadId: lead.id } } as any,
      update: { lastMessageAt: new Date() },
      create: { ownerId: lead.ownerId, leadId: lead.id, lastMessageAt: new Date() },
    });

    // store queued
    const dbMsg = await prisma.message.create({
      data: {
        threadId: thread.id,
        direction: "OUTBOUND",
        body,
        status: "QUEUED",
        toNumber: lead.phone,
        fromNumber,
      },
    });

    // send via Twilio
    try {
      const twRes = await tw.messages.create({ to: lead.phone!, from: fromNumber, body });
      await prisma.message.update({
        where: { id: dbMsg.id },
        data: { status: "SENT", externalSid: twRes.sid },
      });
    } catch (e: any) {
      await prisma.message.update({
        where: { id: dbMsg.id },
        data: { status: "FAILED", error: String(e?.message || e) },
      });
      return res.status(500).json({ ok: false, error: "Twilio send failed" });
    }

    // return latest thread messages
    const messages = await prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
    });

    res.json({ ok: true, data: messages });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "send failed" });
  }
});

export default router;
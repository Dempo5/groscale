import { Router } from "express";
import { prisma } from "../prisma.js";
import twilioLib from "twilio";

const router = Router();

const hasTwilioCreds =
  !!process.env.TWILIO_ACCOUNT_SID &&
  !!process.env.TWILIO_AUTH_TOKEN &&
  !!process.env.TWILIO_MESSAGING_SERVICE_SID;

const twilio = hasTwilioCreds
  ? twilioLib(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  : null;

const MSG_SVC = process.env.TWILIO_MESSAGING_SERVICE_SID || "";

/** List recent threads (optionally scoped to owner) */
router.get("/threads", async (req, res) => {
  const ownerId = (req as any)?.user?.id ?? undefined;

  const threads = await prisma.messageThread.findMany({
    where: ownerId ? { ownerId } : undefined,
    orderBy: { lastMessageAt: "desc" },
    include: {
      lead: { select: { id: true, name: true, email: true, phone: true } },
      messages: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });
  res.json({ ok: true, threads });
});

/** Get (or create) a thread for a lead + all messages */
router.get("/thread/:leadId", async (req, res) => {
  const leadId = String(req.params.leadId);
  let thread = await prisma.messageThread.findFirst({
    where: { leadId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!thread) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { ownerId: true },
    });
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

    thread = await prisma.messageThread.create({
      data: { ownerId: lead.ownerId, leadId, lastMessageAt: new Date() },
    });
    (thread as any).messages = [];
  }

  res.json({ ok: true, thread });
});

/** Send an outbound message to a lead (Twilio optional; dry-run if missing creds) */
router.post("/send", async (req, res) => {
  const { leadId, body } = req.body || {};
  if (!leadId || !body) return res.status(400).json({ ok: false, error: "leadId and body required" });

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, ownerId: true, phone: true },
  });
  if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
  if (!lead.phone) return res.status(400).json({ ok: false, error: "Lead has no phone" });

  let thread = await prisma.messageThread.findFirst({ where: { leadId: lead.id } });
  if (!thread) {
    thread = await prisma.messageThread.create({
      data: { ownerId: lead.ownerId, leadId: lead.id },
    });
  }

  // create QUEUED record
  const queued = await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "OUTBOUND",
      body,
      status: "QUEUED",
      toNumber: lead.phone,
    },
  });

  try {
    if (twilio && MSG_SVC) {
      const resp = await twilio.messages.create({
        to: lead.phone!,
        messagingServiceSid: MSG_SVC,
        body,
      });
      await prisma.message.update({
        where: { id: queued.id },
        data: { status: "SENT", externalSid: resp.sid },
      });
    } else {
      // dry-run for testing without Twilio
      await prisma.message.update({
        where: { id: queued.id },
        data: { status: "DELIVERED" },
      });
    }

    await prisma.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() },
    });

    res.json({ ok: true, messageId: queued.id, threadId: thread.id });
  } catch (e: any) {
    await prisma.message.update({
      where: { id: queued.id },
      data: { status: "FAILED", error: String(e?.message || e) },
    });
    res.status(500).json({ ok: false, error: "Send failed" });
  }
});

export default router;

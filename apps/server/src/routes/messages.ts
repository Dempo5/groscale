// apps/server/src/routes/messages.ts
import { Router } from "express";
import { prisma } from "../prisma.js";

// Twilio client (optional: only used when env is present)
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
const haveTwilio = TWILIO_SID && TWILIO_AUTH && TWILIO_MESSAGING_SERVICE_SID;

let twilio: any = null;
if (haveTwilio) {
  // lazy import to avoid bundling if not configured
  // @ts-ignore
  twilio = (await import("twilio")).default(TWILIO_SID, TWILIO_AUTH);
}

const r = Router();

/* List threads (left rail) */
r.get("/threads", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const rows = await prisma.messageThread.findMany({
    where: { ownerId },
    orderBy: { lastMessageAt: "desc" },
    include: { lead: { select: { name: true, email: true, phone: true } } },
  });
  res.json({
    ok: true,
    data: rows.map((t) => ({
      id: t.id,
      ownerId: t.ownerId,
      leadId: t.leadId,
      leadName: t.lead?.name ?? null,
      leadEmail: t.lead?.email ?? null,
      leadPhone: t.lead?.phone ?? null,
      phoneNumberSid: (t as any).phoneNumberSid ?? null,
      lastMessageAt: t.lastMessageAt ?? null,
    })),
  });
});

/* Get messages in a thread */
r.get("/:threadId", async (req, res) => {
  const { threadId } = req.params as { threadId: string };
  const data = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ ok: true, data });
});

/* Start a thread by phone (no fake bubbles) */
r.post("/start", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const { phone, name, leadId, firstMessage } = (req.body ?? {}) as {
    phone?: string; name?: string; leadId?: string; firstMessage?: string;
  };
  if (!phone) return res.status(400).json({ ok: false, error: "phone required" });

  const lead =
    leadId
      ? await prisma.lead.findUnique({ where: { id: leadId } })
      : await prisma.lead.create({ data: { name: name || phone, email: null, phone, ownerId } });

  const thread = await prisma.messageThread.create({
    data: { ownerId, leadId: lead!.id },
  });

  if (firstMessage && firstMessage.trim()) {
    await prisma.message.create({
      data: { threadId: thread.id, direction: "OUTBOUND", body: firstMessage.trim(), status: "QUEUED" },
    });
  }

  res.json({ ok: true, thread });
});

/* Send a message into an existing thread (Twilio send) */
r.post("/send", async (req, res) => {
  const { threadId, body } = (req.body ?? {}) as { threadId?: string; body?: string };
  if (!threadId || !body || !body.trim()) {
    return res.status(400).json({ ok: false, error: "threadId/body required" });
  }

  // Look up destination phone from the thread's lead
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: { lead: { select: { phone: true } } },
  });
  if (!thread || !thread.lead?.phone) {
    return res.status(400).json({ ok: false, error: "thread/lead phone not found" });
  }

  // Create DB message as QUEUED first
  const pending = await prisma.message.create({
    data: {
      threadId,
      direction: "OUTBOUND",
      body: body.trim(),
      status: "QUEUED",
    },
  });

  // If Twilio isn’t configured, just acknowledge (useful for staging)
  if (!haveTwilio) {
    return res.json({ ok: true, id: pending.id, info: "Twilio not configured; message queued only." });
  }

  try {
    const msg = await twilio.messages.create({
      messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
      to: thread.lead.phone,
      body: body.trim(),
      // status callback to update SENT/DELIVERED/FAILED
      statusCallback: `${process.env.PUBLIC_BASE_URL || ""}/api/twilio/status`,
    });

    await prisma.message.update({
      where: { id: pending.id },
      data: {
        status: "SENT",
        externalSid: msg.sid,
        toNumber: msg.to ?? thread.lead.phone,
        fromNumber: msg.from ?? null,
      },
    });

    // also bump thread's lastMessageAt
    await prisma.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });

    res.json({ ok: true, id: pending.id, sid: msg.sid });
  } catch (err: any) {
    await prisma.message.update({
      where: { id: pending.id },
      data: { status: "FAILED", error: err?.message || "send failed" },
    });
    res.status(502).json({ ok: false, error: err?.message || "send failed" });
  }
});

export default r;

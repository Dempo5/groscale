// src/routes/messages.ts
import { Router } from "express";
import { prisma } from "../prisma";

const r = Router();

// list threads
r.get("/threads", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const rows = await prisma.messageThread.findMany({
    where: { ownerId },
    orderBy: { lastMessageAt: "desc" },
    include: { lead: { select: { name: true, email: true, phone: true } } },
  });
  const data = rows.map(t => ({
    id: t.id,
    ownerId: t.ownerId,
    leadId: t.leadId,
    leadName: t.lead?.name ?? null,
    leadEmail: t.lead?.email ?? null,
    leadPhone: t.lead?.phone ?? null,
    phoneNumberSid: t.phoneNumberSid,
    lastMessageAt: t.lastMessageAt,
  }));
  res.json({ ok: true, data });
});

// get messages in thread
r.get("/:threadId", async (req, res) => {
  const { threadId } = req.params;
  const data = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ ok: true, data });
});

// start thread by phone
r.post("/start", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const { phone, name, leadId, firstMessage } = req.body || {};
  if (!phone) return res.status(400).json({ ok: false, error: "phone required" });

  // create or connect a lead
  const lead = leadId
    ? await prisma.lead.findUnique({ where: { id: leadId } })
    : await prisma.lead.create({ data: { name: name || phone, email: null, phone, ownerId } });

  const thread = await prisma.messageThread.create({
    data: { ownerId, leadId: lead!.id },
  });

  if (firstMessage) {
    await prisma.message.create({
      data: {
        threadId: thread.id,
        direction: "OUTBOUND",
        body: firstMessage,
        status: "QUEUED",
      },
    });
    // your actual SMS send happens elsewhere or you can enqueue here
  }

  res.json({ ok: true, thread });
});

// send into existing thread
r.post("/send", async (req, res) => {
  const { threadId, body } = req.body || {};
  if (!threadId || !body) return res.status(400).json({ ok: false, error: "threadId/body required" });

  const msg = await prisma.message.create({
    data: { threadId, direction: "OUTBOUND", body, status: "QUEUED" },
  });

  // enqueue to Twilio/etc here; update status later from webhook
  res.json({ ok: true, id: msg.id });
});

export default r;

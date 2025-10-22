import { Router } from "express";
import { prisma } from "../prisma.js";

const r = Router();

/** Create an OUTBOUND message without sending via Twilio */
r.post("/debug/send", async (req, res) => {
  const { leadId, body, toNumber } = req.body || {};
  if (!leadId || !body) return res.status(400).json({ ok: false, error: "leadId and body required" });

  // find or create thread for this lead
  let thread = await prisma.messageThread.findFirst({ where: { leadId } });
  if (!thread) {
    // owner: take lead.ownerId
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } });
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

    thread = await prisma.messageThread.create({
      data: { ownerId: lead.ownerId, leadId, lastMessageAt: new Date() },
    });
  }

  const msg = await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "OUTBOUND",
      body,
      status: "DELIVERED", // mark as delivered in dry-run
      toNumber,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  res.json({ ok: true, message: msg, threadId: thread.id });
});

/** Simulate an INBOUND message (like a webhook would) */
r.post("/debug/inbound", async (req, res) => {
  const { leadId, body, fromNumber } = req.body || {};
  if (!leadId || !body) return res.status(400).json({ ok: false, error: "leadId and body required" });

  let thread = await prisma.messageThread.findFirst({ where: { leadId } });
  if (!thread) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } });
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });
    thread = await prisma.messageThread.create({
      data: { ownerId: lead.ownerId, leadId, lastMessageAt: new Date() },
    });
  }

  const msg = await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "INBOUND",
      body,
      status: "RECEIVED",
      fromNumber,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  res.json({ ok: true, message: msg, threadId: thread.id });
});

export default r;

// apps/server/src/routes/twilio.ts
import { Router } from "express";
import { prisma } from "../prisma.js";

const r = Router();

/* Delivery status updates */
r.post("/status", async (req, res) => {
  // Twilio posts application/x-www-form-urlencoded; index.ts already attaches urlencoded middleware
  const { MessageSid, MessageStatus } = req.body as any;
  if (!MessageSid) return res.sendStatus(204);

  const statusMap: Record<string, string> = {
    queued: "QUEUED",
    sending: "SENT",
    sent: "SENT",
    delivered: "DELIVERED",
    failed: "FAILED",
    undelivered: "FAILED",
    received: "RECEIVED",
  };

  await prisma.message.updateMany({
    where: { externalSid: MessageSid },
    data: { status: (statusMap[`${MessageStatus}`.toLowerCase()] as any) || "SENT" },
  });

  res.sendStatus(204);
});

/* Inbound SMS (from customer) */
r.post("/inbound", async (req, res) => {
  const { From, To, Body } = req.body as any;
  if (!From || !Body) return res.sendStatus(204);

  // Find the most recent thread for this phone
  const lead = await prisma.lead.findFirst({ where: { phone: From } });
  if (!lead) return res.sendStatus(204);

  const thread = await prisma.messageThread.findFirst({
    where: { leadId: lead.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!thread) return res.sendStatus(204);

  await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "INBOUND",
      body: Body,
      status: "RECEIVED",
      toNumber: To ?? null,
      fromNumber: From ?? null,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // respond with empty TwiML
  res.type("text/xml").send("<Response/>");
});

export default r;

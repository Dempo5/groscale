import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

// Twilio posts x-www-form-urlencoded
router.use("/inbound", (req, res, next) => {
  // only for this endpoint
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const urlencoded = require("express").urlencoded;
  return urlencoded({ extended: false })(req, res, next);
});

/**
 * POST /api/twilio/inbound
 * Twilio webhook: Body, From, To, MessageSid
 */
router.post("/inbound", async (req, res) => {
  try {
    const from = String(req.body.From || "");
    const to = String(req.body.To || "");
    const body = String(req.body.Body || "");
    const sid = String(req.body.MessageSid || "");

    if (!from || !to || !sid) {
      return res.status(400).send("missing required fields");
    }

    // Find a lead by phone (best effort)
    let lead = await prisma.lead.findFirst({ where: { phone: from } });

    // If not found, create a bare lead under "system" owner for demo
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          ownerId: "system",
          name: from,
          phone: from,
        },
      });
    }

    // Upsert/find a thread
    const thread = await prisma.messageThread.upsert({
      where: { ownerId_leadId: { ownerId: lead.ownerId, leadId: lead.id } } as any,
      update: { lastMessageAt: new Date() },
      create: { ownerId: lead.ownerId, leadId: lead.id, lastMessageAt: new Date() },
    });

    // Store inbound message
    await prisma.message.create({
      data: {
        threadId: thread.id,
        direction: "INBOUND",
        body,
        status: "RECEIVED",
        externalSid: sid,
        toNumber: to,
        fromNumber: from,
      },
    });

    res.status(200).send("OK"); // Twilio expects 2xx quickly
  } catch (e) {
    // never throw at Twilio—just 200
    res.status(200).send("OK");
  }
});

export default router;

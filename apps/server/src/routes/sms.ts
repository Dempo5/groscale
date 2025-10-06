import { Router } from "express";
import twilio from "twilio";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

const from = process.env.TWILIO_FROM;               // +14075549872
const acc  = process.env.TWILIO_ACCOUNT_SID!;
const tok  = process.env.TWILIO_AUTH_TOKEN!;
const tw   = twilio(acc, tok);

router.post("/send", async (req, res) => {
  try {
    const { leadId, body } = req.body || {};
    if (!leadId || !body) return res.status(400).json({ error: "leadId and body are required" });

    // find the lead's phone
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead?.phone) return res.status(404).json({ error: "lead not found or missing phone" });

    if (!from) return res.status(500).json({ error: "TWILIO_FROM not set" }); // must be +E164

    const msg = await tw.messages.create({ to: lead.phone, from, body });
    return res.json({ sid: msg.sid, status: msg.status, to: msg.to });
  } catch (e:any) {
    return res.status(500).json({ error: e.message || "send failed" });
  }
});

export default router;

import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../prisma.js";
import Twilio from "twilio";

const router = Router();

// Twilio sends application/x-www-form-urlencoded; index.ts already mounts urlencoded for this router.

router.post("/inbound", async (req: Request, res: Response) => {
  // If you want signature verification, wire Twilio webhook signing here.
  const from = String(req.body.From || "").trim();
  const to = String(req.body.To || "").trim();
  const body = String(req.body.Body || "").trim();

  if (!from || !body) {
    return res.status(400).type("text/xml").send("<Response/>");
  }

  // Find lead by phone (your leads use E.164 in /uploads)
  const lead = await prisma.lead.findFirst({
    where: { OR: [{ phone: from }, { phone: from.replace(/[^\d+]/g, "") }] },
    select: { id: true, ownerId: true },
  });

  const ownerId = lead?.ownerId ?? "system";

  await prisma.message.create({
    data: {
      ownerId,
      leadId: lead?.id,
      to,
      from,
      direction: "IN",
      body,
      status: "received",
    },
  });

  // Optional: auto-tagging / workflow trigger on inbound
  // (Add here later)

  res.type("text/xml").send("<Response/>"); // Twilio expects TwiML (empty is fine)
});

export default router;

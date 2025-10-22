import { Router } from "express";
import twilio from "twilio";
import { prisma } from "../prisma.js";

const router = Router();

const hasTwilio =
  !!process.env.TWILIO_ACCOUNT_SID &&
  !!process.env.TWILIO_AUTH_TOKEN &&
  (!!process.env.TWILIO_FROM || !!process.env.TWILIO_MESSAGING_SERVICE_SID);

const client = hasTwilio
  ? twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  : null;

const E164 = (v?: string) => {
  if (!v) return undefined;
  let t = v.replace(/[^\d+]/g, "");
  if (!t.startsWith("+") && /^\d{10}$/.test(t)) t = "+1" + t;
  return /^\+\d{7,15}$/.test(t) ? t : undefined;
};

/**
 * POST /api/messages/send
 * body: { to: string; body: string; leadId?: string }
 */
router.post("/send", async (req, res) => {
  const ownerId = (req as any)?.user?.id ?? "system";
  const to = E164(req.body?.to);
  const text = String(req.body?.body ?? "").trim();
  const leadId = req.body?.leadId ? String(req.body.leadId) : null;

  if (!to || !text) {
    return res
      .status(400)
      .json({ ok: false, error: "to (E.164) and body are required" });
  }

  // pick from / service
  const from = process.env.TWILIO_FROM || undefined;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;

  // create local record first
  const msg = await prisma.message.create({
    data: {
      ownerId,
      leadId: leadId || undefined,
      to,
      from: from || messagingServiceSid || "twilio",
      direction: "OUT",
      body: text,
      status: hasTwilio ? "queued" : "sent",
    },
  });

  if (!hasTwilio) {
    // dry run
    return res.json({ ok: true, message: msg, dryRun: true });
  }

  try {
    const tw = await client!.messages.create({
      to,
      from,
      messagingServiceSid,
      body: text,
      statusCallback: undefined, // optional: add a status callback URL later
    });

    const updated = await prisma.message.update({
      where: { id: msg.id },
      data: { sid: tw.sid, status: "sent" },
    });

    return res.json({ ok: true, message: updated });
  } catch (err: any) {
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: "failed", error: String(err?.message || err) },
    });
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default router;

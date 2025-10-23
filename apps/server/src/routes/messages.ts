import { Router } from "express";
import twilio from "twilio";
import { prisma } from "../prisma"; // make sure this exports a singleton PrismaClient

const r = Router();
const tw = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

// POST /api/messages/send { threadId, body }
r.post("/send", async (req, res) => {
  const { threadId, body } = req.body || {};
  if (!threadId || !body) {
    return res.status(400).json({ ok: false, error: "threadId and body required" });
  }

  // 1) find thread + lead
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: { lead: true },
  });
  if (!thread) return res.status(404).json({ ok: false, error: "thread not found" });
  if (!thread.lead?.phone) return res.status(400).json({ ok: false, error: "lead has no phone" });

  const to = thread.lead.phone;
  // decide the 'from' – from DB number or env fallback
  const from =
    thread.phoneNumberSid
      ? (await prisma.phoneNumber.findUnique({ where: { sid: thread.phoneNumberSid } }))?.number
      : process.env.TWILIO_FROM;

  if (!from) return res.status(400).json({ ok: false, error: "no FROM number configured" });

  // 2) create our local message
  const msg = await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "OUTBOUND",
      body,
      status: "QUEUED",
      toNumber: to,
      fromNumber: from,
    },
  });

  // 3) send via Twilio (with status callback to update)
  const statusCallback = `${process.env.PUBLIC_BASE_URL}/api/messages/status-callback`;

  try {
    const twRes = await tw.messages.create({
      to,
      from,
      body,
      statusCallback,
    });

    // store SID immediately
    await prisma.message.update({
      where: { id: msg.id },
      data: { externalSid: twRes.sid, status: "SENT" },
    });

    // touch thread timestamp
    await prisma.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() },
    });

    return res.json({ ok: true, id: msg.id });
  } catch (e: any) {
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: "FAILED", error: e?.message?.slice(0, 500) ?? "send failed" },
    });
    return res.status(500).json({ ok: false, error: e?.message || "Twilio send failed" });
  }
});

/**
 * Twilio status webhook to keep delivery states fresh.
 * Configure the Messaging Status Callback to point here:
 *   PUBLIC_BASE_URL + /api/messages/status-callback
 */
r.post("/status-callback", async (req, res) => {
  // Twilio posts application/x-www-form-urlencoded
  const sid = (req.body.MessageSid || req.body.SmsSid) as string | undefined;
  const twStatus = (req.body.MessageStatus || "").toLowerCase(); // queued/sent/delivered/failed/undelivered

  if (sid) {
    let status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED" = "SENT";
    if (twStatus === "delivered") status = "DELIVERED";
    else if (twStatus === "failed" || twStatus === "undelivered") status = "FAILED";
    else if (twStatus === "queued" || twStatus === "accepted") status = "QUEUED";
    else if (twStatus === "sent") status = "SENT";

    await prisma.message.updateMany({
      where: { externalSid: sid },
      data: { status },
    });
  }
  res.type("text/plain").send("OK");
});

/**
 * Optional: Twilio inbound webhook to create threads/messages on incoming texts.
 * Set your Messaging *Request URL* to: PUBLIC_BASE_URL + /api/messages/inbound
 */
r.post("/inbound", async (req, res) => {
  // x-www-form-urlencoded fields from Twilio
  const from = req.body.From as string;
  const to = req.body.To as string;
  const body = (req.body.Body as string) || "";

  // find or create a lead and thread for this From
  let lead = await prisma.lead.findFirst({ where: { phone: from } });
  if (!lead) {
    lead = await prisma.lead.create({ data: { phone: from, name: from, email: null, ownerId: "system" } });
  }

  let thread = await prisma.messageThread.findFirst({
    where: { leadId: lead.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!thread) {
    thread = await prisma.messageThread.create({
      data: { leadId: lead.id, ownerId: "system" },
    });
  }

  await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "INBOUND",
      body,
      status: "RECEIVED",
      toNumber: to,
      fromNumber: from,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Twilio expects a valid TwiML or a 200; a blank 200 is fine if you don't auto-reply
  res.type("text/xml").send("<Response/>");
});

export default r;

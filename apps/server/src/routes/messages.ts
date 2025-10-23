// apps/server/src/routes/messages.ts
import { Router } from "express";
import { prisma } from "../prisma.js";

const r = Router();

/* -------------------------- helpers & config -------------------------- */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_MESSAGING_SERVICE_SID =
  process.env.TWILIO_MESSAGING_SERVICE_SID || "";
const haveTwilio = !!(TWILIO_SID && TWILIO_AUTH && TWILIO_MESSAGING_SERVICE_SID);

// Public origin for building absolute callback URLs (no trailing slash)
const SERVER_BASE_URL =
  (process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(
    /\/+$/,
    ""
  );

// Build absolute URL (falls back to relative if base missing, but Twilio needs absolute)
function absUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return SERVER_BASE_URL ? `${SERVER_BASE_URL}${path}` : path;
}

// Lazy Twilio client (no top-level await)
let twilioClient: any | null = null;
async function ensureTwilio() {
  if (twilioClient || !haveTwilio) return twilioClient;
  const twilioMod = await import("twilio");
  twilioClient = twilioMod.default(TWILIO_SID, TWILIO_AUTH);
  return twilioClient;
}

/* ------------------------------ routes ------------------------------- */

/** List threads for current owner (left rail) */
r.get("/threads", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const rows = await prisma.messageThread.findMany({
    where: { ownerId },
    orderBy: { lastMessageAt: "desc" },
    include: { lead: { select: { name: true, email: true, phone: true } } },
  });

  const data = rows.map((t) => ({
    id: t.id,
    ownerId: t.ownerId,
    leadId: t.leadId,
    leadName: t.lead?.name ?? null,
    leadEmail: t.lead?.email ?? null,
    leadPhone: t.lead?.phone ?? null,
    phoneNumberSid: (t as any).phoneNumberSid ?? null,
    lastMessageAt: t.lastMessageAt ?? null,
  }));

  res.json({ ok: true, data });
});

/** Get messages inside a thread */
r.get("/:threadId", async (req, res) => {
  const { threadId } = req.params as { threadId: string };
  const data = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ ok: true, data });
});

/** Start a thread by phone (creates lead if needed) */
r.post("/start", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const { phone, name, leadId, firstMessage } = (req.body ?? {}) as {
    phone?: string;
    name?: string;
    leadId?: string;
    firstMessage?: string;
  };

  if (!phone) return res.status(400).json({ ok: false, error: "phone required" });

  const lead =
    leadId
      ? await prisma.lead.findUnique({ where: { id: leadId } })
      : await prisma.lead.create({
          data: { name: name || phone, email: null, phone, ownerId },
        });

  const thread = await prisma.messageThread.create({
    data: { ownerId, leadId: lead!.id },
  });

  if (firstMessage && firstMessage.trim()) {
    await prisma.message.create({
      data: {
        threadId: thread.id,
        direction: "OUTBOUND",
        body: firstMessage.trim(),
        status: "QUEUED",
      },
    });
  }

  res.json({ ok: true, thread });
});

/** Send an outbound message into an existing thread (Twilio if configured) */
r.post("/send", async (req, res) => {
  const { threadId, body } = (req.body ?? {}) as {
    threadId?: string;
    body?: string;
  };
  if (!threadId || !body || !body.trim()) {
    return res.status(400).json({ ok: false, error: "threadId/body required" });
  }

  // Look up destination phone
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: { lead: { select: { phone: true } } },
  });
  if (!thread || !thread.lead?.phone) {
    return res
      .status(400)
      .json({ ok: false, error: "thread or lead phone not found" });
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

  // If Twilio isn’t configured, acknowledge and keep it queued (useful for staging)
  if (!haveTwilio) {
    return res.json({
      ok: true,
      id: pending.id,
      info: "Twilio not configured; message queued only.",
    });
  }

  // Ensure absolute callback URL (fixes “not a valid URL”)
  const statusCallback = absUrl("/api/twilio/status");

  try {
    const client = await ensureTwilio();
    if (!client) throw new Error("Twilio not configured");

    const msg = await client.messages.create({
      // Use Messaging Service SID if provided (recommended by Twilio)
      messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
      to: thread.lead.phone,
      body: body.trim(),
      statusCallback,
    });

    // Mark as SENT and store Twilio metadata
    await prisma.message.update({
      where: { id: pending.id },
      data: {
        status: "SENT",
        externalSid: msg.sid,
        toNumber: msg.to ?? thread.lead.phone,
        fromNumber: msg.from ?? null,
      },
    });

    // bump thread last activity
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

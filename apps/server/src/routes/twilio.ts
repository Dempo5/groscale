// apps/server/src/routes/twilio.ts
import { Router, type Request } from "express";
import { prisma } from "../prisma.js";

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
let twilioValidate: ((...args: any[]) => boolean) | null = null;

/** Lazy-load Twilio's request validator if token present */
async function ensureValidator() {
  if (!TWILIO_AUTH_TOKEN || twilioValidate) return twilioValidate;
  const mod = await import("twilio");
  twilioValidate = mod.validateRequest as any;
  return twilioValidate;
}

const r = Router();

/* ------------------------------------------------------------------ */
/* utils                                                              */
/* ------------------------------------------------------------------ */

function getFirst<T = string>(v: any): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? (v[0] as T) : (v as T);
}

function asE164(input?: string): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/\D+/g, "");
  if (!digits) return undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  return input.startsWith("+") ? input : `+${digits}`;
}

/** Optional signature check (only if TWILIO_AUTH_TOKEN is present) */
async function verifyTwilio(req: Request): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) return true; // disabled
  const validator = await ensureValidator();
  if (!validator) return true;

  const sig = (req.headers["x-twilio-signature"] as string) || "";
  // Recreate absolute URL Twilio targeted (your proxy forwards it)
  const base =
    (process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(
      /\/+$/,
      ""
    ) || "";
  const url = `${base}${req.originalUrl}`;
  // validator needs a plain object (body is already urlencoded -> object)
  const ok = (twilioValidate as any)(TWILIO_AUTH_TOKEN, sig, url, req.body);
  return !!ok;
}

/* ------------------------------------------------------------------ */
/* Delivery Status Callback                                            */
/* ------------------------------------------------------------------ */
r.post("/status", async (req, res) => {
  if (!(await verifyTwilio(req))) return res.sendStatus(403);

  const sid =
    getFirst<string>(req.body?.MessageSid) ||
    getFirst<string>(req.body?.SmsSid) ||
    "";
  if (!sid) return res.sendStatus(204);

  const raw =
    getFirst<string>(req.body?.MessageStatus) ||
    getFirst<string>(req.body?.SmsStatus) ||
    "";

  const statusMap: Record<string, string> = {
    queued: "QUEUED",
    accepted: "QUEUED",
    sending: "SENT",
    sent: "SENT",
    delivered: "DELIVERED",
    read: "DELIVERED",
    failed: "FAILED",
    undelivered: "FAILED",
    received: "RECEIVED",
  };
  const norm = statusMap[raw.toLowerCase()] || "SENT";

  await prisma.message.updateMany({
    where: { externalSid: sid },
    data: { status: norm },
  });

  return res.sendStatus(204);
});

/* ------------------------------------------------------------------ */
/* Inbound SMS/MMS                                                     */
/* ------------------------------------------------------------------ */
r.post("/inbound", async (req, res) => {
  if (!(await verifyTwilio(req))) return res.sendStatus(403);

  const From = asE164(getFirst<string>(req.body?.From));
  const To = asE164(getFirst<string>(req.body?.To));
  const Body = getFirst<string>(req.body?.Body)?.toString() ?? "";
  const Sid =
    getFirst<string>(req.body?.MessageSid) ||
    getFirst<string>(req.body?.SmsSid) ||
    undefined;

  if (!From || !Body.trim()) {
    // Nothing we can do—ack with empty TwiML so Twilio stops retrying.
    return res.type("text/xml").send("<Response/>");
  }

  // Find or create the lead by inbound phone
  let lead = await prisma.lead.findFirst({ where: { phone: From } });
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        ownerId: "system", // adjust if you support multi-tenant owner routing
        name: From,
        phone: From,
        email: null,
      },
    });
  }

  // Use the most recent thread for this lead or create one
  let thread = await prisma.messageThread.findFirst({
    where: { leadId: lead.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!thread) {
    thread = await prisma.messageThread.create({
      data: { ownerId: lead.ownerId || "system", leadId: lead.id },
    });
  }

  // Idempotency: if Twilio provided a SID and we’ve already stored it, skip insert
  if (Sid) {
    const dup = await prisma.message.findFirst({
      where: { externalSid: Sid },
      select: { id: true },
    });
    if (dup) {
      // Still update thread timestamp so UI floats this thread
      await prisma.messageThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date() },
      });
      return res.type("text/xml").send("<Response/>");
    }
  }

  await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "INBOUND",
      body: Body,
      status: "RECEIVED",
      toNumber: To ?? null,
      fromNumber: From ?? null,
      externalSid: Sid ?? null,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // Acknowledge with empty TwiML
  return res.type("text/xml").send("<Response/>");
});

export default r;

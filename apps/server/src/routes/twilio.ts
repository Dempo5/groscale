// apps/server/src/routes/twilio.ts
import { Router, type Request } from "express";
import { prisma } from "../prisma.js";

// version-proof enum
type MsgStatus = import("@prisma/client").Message["status"];

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
let twilioValidate: ((...args: any[]) => boolean) | null = null;

async function ensureValidator() {
  if (twilioValidate) return twilioValidate;
  if (!TWILIO_AUTH_TOKEN) return null;
  const mod = await import("twilio");
  twilioValidate = (mod as any).validateRequest as any;
  return twilioValidate;
}

// --- helpers ---
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
function fullUrlFromReq(req: Request) {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host  = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
  return `${proto}://${host}${req.originalUrl}`;
}
async function verifyTwilio(req: Request): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) return true; // allow in dev
  const validator = await ensureValidator();
  if (!validator) return true;
  const sig = (req.headers["x-twilio-signature"] as string) || "";
  const base =
    (process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "") || null;
  const url = base ? `${base}${req.originalUrl}` : fullUrlFromReq(req);
  return !!(twilioValidate as any)(TWILIO_AUTH_TOKEN, sig, url, req.body);
}

const r = Router();

/* ------ status callback ------ */
r.post("/status", async (req, res) => {
  if (!(await verifyTwilio(req))) return res.sendStatus(403);

  const sid =
    getFirst<string>(req.body?.MessageSid) ||
    getFirst<string>(req.body?.SmsSid) || "";

  if (!sid) return res.sendStatus(204);

  const raw =
    getFirst<string>(req.body?.MessageStatus) ||
    getFirst<string>(req.body?.SmsStatus) || "";

  const statusMap: Record<string, MsgStatus> = {
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
  const norm: MsgStatus = statusMap[raw.toLowerCase()] || "SENT";

  await prisma.message.updateMany({
    where: { externalSid: sid },
    data: { status: norm },
  });

  res.sendStatus(204);
});

/* ------ inbound SMS/MMS ------ */
r.post("/inbound", async (req, res) => {
  if (!(await verifyTwilio(req))) return res.sendStatus(403);

  const From = asE164(getFirst<string>(req.body?.From));
  const To   = asE164(getFirst<string>(req.body?.To));
  const Body = getFirst<string>(req.body?.Body)?.toString() ?? "";
  const Sid  = getFirst<string>(req.body?.MessageSid) ||
               getFirst<string>(req.body?.SmsSid) || undefined;

  if (!From || !Body.trim()) {
    return res.type("text/xml").send("<Response/>");
  }

  let lead = await prisma.lead.findFirst({ where: { phone: From } });
  if (!lead) {
    lead = await prisma.lead.create({
      data: { ownerId: "system", name: From, phone: From, email: null },
    });
  }

  let thread = await prisma.messageThread.findFirst({
    where: { leadId: lead.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!thread) {
    thread = await prisma.messageThread.create({
      data: { ownerId: lead.ownerId || "system", leadId: lead.id },
    });
  }

  if (Sid) {
    const dup = await prisma.message.findFirst({
      where: { externalSid: Sid },
      select: { id: true },
    });
    if (dup) {
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

  res.type("text/xml").send("<Response/>");
});

export default r;

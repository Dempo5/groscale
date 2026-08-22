// apps/server/src/routes/twilio.ts
import { Router, type Request } from "express";
import { prisma } from "../prisma.js";

// version-proof enum
type MsgStatus = import("@prisma/client").Message["status"];

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";

let twilioValidate: ((...args: any[]) => boolean) | null = null;

async function ensureValidator() {
  if (twilioValidate) return twilioValidate;

  if (!TWILIO_AUTH_TOKEN) {
    return null;
  }

  const mod = await import("twilio");
  twilioValidate = (mod as any).validateRequest as any;

  return twilioValidate;
}

/* ------------------------------ helpers ------------------------------ */

function getFirst<T = string>(v: any): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? (v[0] as T) : (v as T);
}

function asE164(input?: string): string | undefined {
  if (!input) return undefined;

  const digits = input.replace(/\D+/g, "");

  if (!digits) return undefined;

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.startsWith("1") && digits.length === 11) {
    return `+${digits}`;
  }

  return input.startsWith("+") ? input : `+${digits}`;
}

function fullUrlFromReq(req: Request) {
  const proto =
    (req.headers["x-forwarded-proto"] as string) ||
    req.protocol ||
    "https";

  const host =
    (req.headers["x-forwarded-host"] as string) ||
    req.get("host") ||
    "";

  return `${proto}://${host}${req.originalUrl}`;
}

/**
 * Validate that the request really came from Twilio.
 *
 * IMPORTANT:
 * Missing TWILIO_AUTH_TOKEN now FAILS CLOSED instead of allowing
 * arbitrary requests through.
 */
async function verifyTwilio(req: Request): Promise<boolean> {
  if (!TWILIO_AUTH_TOKEN) {
    console.error(
      "[twilio] TWILIO_AUTH_TOKEN is missing; rejecting webhook request"
    );

    return false;
  }

  const validator = await ensureValidator();

  if (!validator) {
    console.error("[twilio] Unable to load Twilio request validator");
    return false;
  }

  const signature =
    (req.headers["x-twilio-signature"] as string) || "";

  if (!signature) {
    console.warn("[twilio] Missing X-Twilio-Signature");
    return false;
  }

  const base = (
    process.env.SERVER_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    ""
  ).replace(/\/+$/, "");

  const url = base
    ? `${base}${req.originalUrl}`
    : fullUrlFromReq(req);

  try {
    return !!validator(
      TWILIO_AUTH_TOKEN,
      signature,
      url,
      req.body
    );
  } catch (err) {
    console.error("[twilio] Signature validation failed", err);
    return false;
  }
}

const r = Router();

/* ------------------------- status callback ------------------------- */

r.post("/status", async (req, res) => {
  if (!(await verifyTwilio(req))) {
    return res.sendStatus(403);
  }

  const sid =
    getFirst<string>(req.body?.MessageSid) ||
    getFirst<string>(req.body?.SmsSid) ||
    "";

  if (!sid) {
    return res.sendStatus(204);
  }

  const raw =
    getFirst<string>(req.body?.MessageStatus) ||
    getFirst<string>(req.body?.SmsStatus) ||
    "";

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

  const norm: MsgStatus =
    statusMap[raw.toLowerCase()] || "SENT";

  await prisma.message.updateMany({
    where: {
      externalSid: sid,
    },
    data: {
      status: norm,
    },
  });

  res.sendStatus(204);
});

/* -------------------------- inbound SMS/MMS -------------------------- */

r.post("/inbound", async (req, res) => {
  if (!(await verifyTwilio(req))) {
    return res.sendStatus(403);
  }

  const From = asE164(
    getFirst<string>(req.body?.From)
  );

  const To = asE164(
    getFirst<string>(req.body?.To)
  );

  const Body =
    getFirst<string>(req.body?.Body)?.toString() ?? "";

  const Sid =
    getFirst<string>(req.body?.MessageSid) ||
    getFirst<string>(req.body?.SmsSid) ||
    undefined;

  if (!From || !To) {
    return res
      .type("text/xml")
      .send("<Response/>");
  }

  /*
   * Find which GroScale user owns the Twilio number
   * that received this message.
   */
  const phoneNumber = await prisma.phoneNumber.findUnique({
    where: {
      number: To,
    },
    select: {
      sid: true,
      ownerId: true,
    },
  });

  if (!phoneNumber?.ownerId) {
    console.error(
      `[twilio] No GroScale owner found for Twilio number ${To}`
    );

    return res
      .type("text/xml")
      .send("<Response/>");
  }

  const ownerId = phoneNumber.ownerId;

  /*
   * Find this customer's lead ONLY inside the correct
   * GroScale account.
   */
  let lead = await prisma.lead.findFirst({
    where: {
      ownerId,
      phone: From,
    },
  });

  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        ownerId,
        name: From,
        phone: From,
        email: null,
      },
    });
  }

  /*
   * Find a conversation between this owner, this lead,
   * and this specific Twilio number.
   */
  let thread = await prisma.messageThread.findFirst({
    where: {
      ownerId,
      leadId: lead.id,
      phoneNumberSid: phoneNumber.sid,
    },
    orderBy: {
      lastMessageAt: "desc",
    },
  });

  if (!thread) {
    thread = await prisma.messageThread.create({
      data: {
        ownerId,
        leadId: lead.id,
        phoneNumberSid: phoneNumber.sid,
      },
    });
  }

  /*
   * Twilio can occasionally retry webhooks.
   * externalSid is unique, so don't store duplicates.
   */
  if (Sid) {
    const duplicate = await prisma.message.findUnique({
      where: {
        externalSid: Sid,
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      await prisma.messageThread.update({
        where: {
          id: thread.id,
        },
        data: {
          lastMessageAt: new Date(),
        },
      });

      return res
        .type("text/xml")
        .send("<Response/>");
    }
  }

  await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "INBOUND",
      body: Body,
      status: "RECEIVED",
      toNumber: To,
      fromNumber: From,
      externalSid: Sid ?? null,
    },
  });

  await prisma.messageThread.update({
    where: {
      id: thread.id,
    },
    data: {
      lastMessageAt: new Date(),
    },
  });

  res
    .type("text/xml")
    .send("<Response/>");
});

export default r;

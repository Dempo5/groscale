import { Router } from "express";
import twilio from "twilio";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  SERVER_BASE_URL,
  TWILIO_MESSAGING_SERVICE_SID, // optional default MS
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !SERVER_BASE_URL) {
  console.warn("[numbers] Missing required envs: TWILIO_* or SERVER_BASE_URL");
}

const client = twilio(TWILIO_ACCOUNT_SID!, TWILIO_AUTH_TOKEN!);

const toBool = (v: any) => v === true || v === "true" || v === "1";

// --- helper: set inbound webhook on the number
async function ensureInbound(pnSid: string) {
  const inbound = `${SERVER_BASE_URL}/api/twilio/webhook/inbound`;
  await client.incomingPhoneNumbers(pnSid).update({ smsUrl: inbound, smsMethod: "POST" });
}

// --- GET /api/numbers/available
router.get("/available", async (req, res) => {
  try {
    const country = (req.query.country as string) || "US";
    const areaCode = req.query.areaCode as string | undefined;
    const contains = req.query.contains as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
    const sms = toBool(req.query.sms);
    const mms = toBool(req.query.mms);
    const voice = toBool(req.query.voice);

    const filter: any = {
      limit,
      areaCode,
      contains,
      smsEnabled: sms || undefined,
      mmsEnabled: mms || undefined,
      voiceEnabled: voice || undefined,
    };

    const list = await client.availablePhoneNumbers(country).local.list(filter);
    const rows = list.map(n => ({
      friendlyName: n.friendlyName,
      phoneNumber: n.phoneNumber!,
      locality: n.locality,
      region: n.region,
      isoCountry: n.isoCountry,
      postalCode: n.postalCode,
      capabilities: n.capabilities,
    }));
    res.json({ ok: true, data: rows });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "Search failed" });
  }
});

// --- GET /api/numbers/mine  (list owned numbers)
router.get("/mine", async (_req, res) => {
  const rows = await prisma.phoneNumber.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ ok: true, data: rows });
});

// --- POST /api/numbers/default  { sid: "PN..." }
router.post("/default", async (req, res) => {
  const { sid } = req.body as { sid: string };
  if (!sid) return res.status(400).json({ ok: false, error: "sid required" });

  await prisma.$transaction([
    prisma.phoneNumber.updateMany({ data: { isDefault: false } }),
    prisma.phoneNumber.update({ where: { sid }, data: { isDefault: true } }),
  ]);

  res.json({ ok: true });
});

// --- POST /api/numbers/purchase
// { country, phoneNumber, makeDefault?, messagingServiceSid? }
router.post("/purchase", async (req, res) => {
  try {
    const { country, phoneNumber, makeDefault, messagingServiceSid } = req.body as {
      country: string; phoneNumber: string; makeDefault?: boolean; messagingServiceSid?: string;
    };
    if (!country || !phoneNumber) {
      return res.status(400).json({ ok: false, error: "country and phoneNumber required" });
    }

    // 1) Buy at Twilio
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
      smsUrl: `${SERVER_BASE_URL}/api/twilio/webhook/inbound`,
      smsMethod: "POST",
    });

    // 2) Attach to messaging service (optional)
    const msid = messagingServiceSid || TWILIO_MESSAGING_SERVICE_SID;
    if (msid) {
      await client.messaging.v1.services(msid).phoneNumbers.create({ phoneNumberSid: purchased.sid });
    } else {
      await ensureInbound(purchased.sid);
    }

    // 3) Upsert in DB
    const saved = await prisma.phoneNumber.upsert({
  where: { sid: purchased.sid },
  create: {
    sid: purchased.sid,
    number: purchased.phoneNumber!,
    friendlyName: purchased.friendlyName ?? null,
    capabilities: purchased.capabilities as any,
    isDefault: !!makeDefault,
    ownerId: null, // 👈 important: Prisma wants this field declared
  },
  update: {
    number: purchased.phoneNumber!,
    friendlyName: purchased.friendlyName ?? null,
    capabilities: purchased.capabilities as any,
    isDefault: !!makeDefault,
    ownerId: null,
  },
});

    // If makeDefault => unset others
    if (makeDefault) {
      await prisma.phoneNumber.updateMany({
        where: { sid: { not: saved.sid } },
        data: { isDefault: false },
      });
    }

    res.json({
      ok: true,
      number: {
        sid: saved.sid,
        number: saved.number,
        friendlyName: saved.friendlyName,
        capabilities: saved.capabilities,
        isDefault: saved.isDefault,
      },
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message || "Purchase failed" });
  }
});

export default router;
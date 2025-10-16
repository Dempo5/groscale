import { Router } from "express";
import twilio from "twilio";

const router = Router();

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

// --- helpers -------------------------------------------------

async function ensureInboundOnNumber(pnSid: string) {
  const inbound = `${SERVER_BASE_URL}/api/twilio/webhook/inbound`;
  await client.incomingPhoneNumbers(pnSid).update({
    smsUrl: inbound,
    smsMethod: "POST",
  });
}

async function attachToMessagingService(pnSid: string, msid: string) {
  await client.messaging.v1.services(msid)
    .phoneNumbers
    .create({ phoneNumberSid: pnSid });
}

function toBool(v: any) {
  return v === true || v === "true" || v === "1";
}

// --- routes --------------------------------------------------

// GET /api/numbers/available?country=US&sms=true&areaCode=949&limit=20&contains=555
router.get("/available", async (req, res) => {
  try {
    const country = (req.query.country as string) || "US";
    const sms = toBool(req.query.sms);
    const mms = toBool(req.query.mms);
    const voice = toBool(req.query.voice);
    const areaCode = req.query.areaCode as string | undefined;
    const contains = req.query.contains as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);

    const filter: any = {
      limit,
      contains,
      areaCode,
      smsEnabled: sms || undefined,
      mmsEnabled: mms || undefined,
      voiceEnabled: voice || undefined,
    };

    const list = await client
      .availablePhoneNumbers(country)
      .local
      .list(filter);

    const rows = list.map(n => ({
      friendlyName: n.friendlyName,
      phoneNumber: n.phoneNumber,
      locality: n.locality,
      region: n.region,
      isoCountry: n.isoCountry,
      lata: n.lata,
      rateCenter: n.rateCenter,
      postalCode: n.postalCode,
      capabilities: n.capabilities, // {sms, mms, voice}
    }));

    res.json({ ok: true, data: rows });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Search failed" });
  }
});

// POST /api/numbers/purchase
// { country: "US", phoneNumber: "+19495551234", makeDefault?: true, messagingServiceSid?: "MG..." }
router.post("/purchase", async (req, res) => {
  try {
    const { country, phoneNumber, makeDefault, messagingServiceSid } = req.body as {
      country: string;
      phoneNumber: string;
      makeDefault?: boolean;
      messagingServiceSid?: string;
    };
    if (!country || !phoneNumber) {
      return res.status(400).json({ ok: false, error: "country and phoneNumber required" });
    }

    // Purchase number
    const inbound = `${SERVER_BASE_URL}/api/twilio/webhook/inbound`;
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
      smsUrl: inbound,
      smsMethod: "POST",
    });

    // Attach to MS if provided (or default env)
    const msid = messagingServiceSid || TWILIO_MESSAGING_SERVICE_SID;
    if (msid) {
      await attachToMessagingService(purchased.sid, msid);
    } else {
      // ensure inbound otherwise
      await ensureInboundOnNumber(purchased.sid);
    }

    // Upsert into DB (adjust to your ORM)
    // Example Prisma:
    // const saved = await prisma.phone_numbers.upsert({
    //   where: { sid: purchased.sid },
    //   update: {
    //     number: purchased.phoneNumber,
    //     friendly_name: purchased.friendlyName ?? null,
    //     capabilities: purchased.capabilities as any,
    //     is_default: !!makeDefault,
    //   },
    //   create: {
    //     sid: purchased.sid,
    //     number: purchased.phoneNumber,
    //     friendly_name: purchased.friendlyName ?? null,
    //     capabilities: purchased.capabilities as any,
    //     is_default: !!makeDefault,
    //   },
    // });

    // If making default, unset others (Prisma example)
    // if (makeDefault) {
    //   await prisma.phone_numbers.updateMany({
    //     data: { is_default: false },
    //     where: { sid: { not: purchased.sid } },
    //   });
    //   await prisma.phone_numbers.update({
    //     where: { sid: purchased.sid },
    //     data: { is_default: true },
    //   });
    // }

    res.json({
      ok: true,
      number: {
        sid: purchased.sid,
        number: purchased.phoneNumber,
        friendlyName: purchased.friendlyName,
        capabilities: purchased.capabilities,
        isDefault: !!makeDefault,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message || "Purchase failed" });
  }
});

export default router;
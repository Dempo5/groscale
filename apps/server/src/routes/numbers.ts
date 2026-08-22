import { Router } from "express";
import twilio from "twilio";
import { prisma } from "../prisma.js";
import type { AuthedRequest } from "../middleware/auth.js";

const router = Router();

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  SERVER_BASE_URL,
  TWILIO_MESSAGING_SERVICE_SID,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !SERVER_BASE_URL) {
  console.warn(
    "[numbers] Missing required envs: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or SERVER_BASE_URL"
  );
}

function getTwilioClient() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio is not configured");
  }

  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

/* ------------------------------ helpers ------------------------------ */

const toBool = (v: any) =>
  v === true || v === "true" || v === "1";

function inboundWebhookUrl() {
  if (!SERVER_BASE_URL) {
    throw new Error("SERVER_BASE_URL is not configured");
  }

  const base = SERVER_BASE_URL.replace(/\/+$/, "");

  return `${base}/api/twilio/inbound`;
}

async function ensureInbound(pnSid: string) {
  const client = getTwilioClient();

  await client.incomingPhoneNumbers(pnSid).update({
    smsUrl: inboundWebhookUrl(),
    smsMethod: "POST",
  });
}

/* ---------------- GET /api/numbers/available ---------------- */

router.get("/available", async (req, res) => {
  try {
    const client = getTwilioClient();

    const country =
      (req.query.country as string) || "US";

    const areaCode =
      req.query.areaCode as string | undefined;

    const contains =
      req.query.contains as string | undefined;

    const requestedLimit = parseInt(
      (req.query.limit as string) || "20",
      10
    );

    const limit = Math.min(
      Number.isFinite(requestedLimit) ? requestedLimit : 20,
      50
    );

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

    const list = await client
      .availablePhoneNumbers(country)
      .local.list(filter);

    const rows = list.map((n: any) => ({
      friendlyName: n.friendlyName,
      phoneNumber: n.phoneNumber as string,
      locality: n.locality,
      region: n.region,
      isoCountry: n.isoCountry,
      postalCode: n.postalCode,
      capabilities: n.capabilities,
    }));

    res.json({
      ok: true,
      data: rows,
    });
  } catch (e: any) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e?.message || "Search failed",
    });
  }
});

/* ---------------- GET /api/numbers/mine ---------------- */

router.get("/mine", async (req, res) => {
  try {
    const ownerId = (req as AuthedRequest).userId!;

    const rows = await prisma.phoneNumber.findMany({
      where: {
        ownerId,
      },
      orderBy: {
        purchasedAt: "desc",
      },
    });

    res.json({
      ok: true,
      data: rows,
    });
  } catch (e: any) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e?.message || "Failed to load numbers",
    });
  }
});

/* ---------------- POST /api/numbers/default ---------------- */
/* body: { sid } */

router.post("/default", async (req, res) => {
  try {
    const ownerId = (req as AuthedRequest).userId!;
    const { sid } = req.body as { sid?: string };

    if (!sid) {
      return res.status(400).json({
        ok: false,
        error: "sid required",
      });
    }

    // Make sure this phone number actually belongs to this user.
    const number = await prisma.phoneNumber.findFirst({
      where: {
        sid,
        ownerId,
      },
      select: {
        sid: true,
      },
    });

    if (!number) {
      return res.status(404).json({
        ok: false,
        error: "Phone number not found",
      });
    }

    await prisma.$transaction([
      // Only unset THIS user's defaults.
      prisma.phoneNumber.updateMany({
        where: {
          ownerId,
        },
        data: {
          isDefault: false,
        },
      }),

      prisma.phoneNumber.update({
        where: {
          sid,
        },
        data: {
          isDefault: true,
        },
      }),
    ]);

    res.json({
      ok: true,
    });
  } catch (e: any) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e?.message || "Failed to set default number",
    });
  }
});

/* ---------------- POST /api/numbers/purchase ---------------- */
/*
  body:
  {
    country,
    phoneNumber,
    makeDefault?,
    messagingServiceSid?
  }
*/

router.post("/purchase", async (req, res) => {
  try {
    const ownerId = (req as AuthedRequest).userId!;
    const client = getTwilioClient();

    const {
      country,
      phoneNumber,
      makeDefault,
      messagingServiceSid,
    } = req.body as {
      country?: string;
      phoneNumber?: string;
      makeDefault?: boolean;
      messagingServiceSid?: string;
    };

    if (!country || !phoneNumber) {
      return res.status(400).json({
        ok: false,
        error: "country and phoneNumber required",
      });
    }

    /*
     * 1. Purchase the number from Twilio.
     *
     * IMPORTANT:
     * Correct webhook is /api/twilio/inbound
     */
    const purchased =
      await client.incomingPhoneNumbers.create({
        phoneNumber,
        smsUrl: inboundWebhookUrl(),
        smsMethod: "POST",
      });

    /*
     * 2. Optionally attach it to a Twilio Messaging Service.
     */
    const msid =
      messagingServiceSid ||
      TWILIO_MESSAGING_SERVICE_SID ||
      null;

    if (msid) {
      await client.messaging.v1
        .services(msid)
        .phoneNumbers.create({
          phoneNumberSid: purchased.sid,
        });
    }

    /*
     * Keep the inbound webhook explicitly configured on
     * the purchased number.
     */
    await ensureInbound(purchased.sid);

    /*
     * 3. Save number AND its actual GroScale owner.
     */
    const saved = await prisma.phoneNumber.upsert({
      where: {
        sid: purchased.sid,
      },

      create: {
        sid: purchased.sid,
        number: purchased.phoneNumber!,
        friendlyName: purchased.friendlyName ?? null,
        capabilities: purchased.capabilities as any,
        ownerId,
        isDefault: !!makeDefault,
        purchasedAt: new Date(),
        messagingServiceSid: msid,
      },

      update: {
        number: purchased.phoneNumber!,
        friendlyName: purchased.friendlyName ?? null,
        capabilities: purchased.capabilities as any,
        ownerId,
        isDefault: !!makeDefault,
        messagingServiceSid: msid,
      },
    });

    /*
     * 4. If this number should be the default,
     * unset ONLY this user's other defaults.
     */
    if (makeDefault) {
      await prisma.phoneNumber.updateMany({
        where: {
          ownerId,
          sid: {
            not: saved.sid,
          },
        },
        data: {
          isDefault: false,
        },
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
        messagingServiceSid: saved.messagingServiceSid,
      },
    });
  } catch (e: any) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e?.message || "Purchase failed",
    });
  }
});

export default router;

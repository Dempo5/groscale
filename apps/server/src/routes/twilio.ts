import { Router, type Request, type Response } from "express";
import { prisma } from "../prisma.js";
import twilio from "twilio";

const router = Router();

/**
 * Optional webhook validation:
 *   Set TWILIO_VALIDATE_WEBHOOK=true (and have TWILIO_AUTH_TOKEN set)
 *   to verify x-twilio-signature.
 */
const SHOULD_VALIDATE =
  String(process.env.TWILIO_VALIDATE_WEBHOOK || "").toLowerCase() === "true";
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";

/** normalize helpers */
const onlyDigits = (s: string) => s.replace(/\D+/g, "");
const last10 = (s: string) => {
  const d = onlyDigits(s);
  return d.slice(-10);
};

/** Respond with empty TwiML (OK for Twilio) */
function emptyTwiML(res: Response) {
  const twiml = new twilio.twiml.MessagingResponse();
  res.type("text/xml").send(twiml.toString());
}

/** Optional signature validation */
function validateSignature(req: Request): boolean {
  if (!SHOULD_VALIDATE || !AUTH_TOKEN) return true;
  const sig = req.get("x-twilio-signature") || "";
  // Full URL Twilio hit (public URL). Render passes X-Forwarded-Proto/Host.
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
  const url = `${proto}://${host}${req.originalUrl}`;
  return twilio.validateRequest(AUTH_TOKEN, sig, url, req.body);
}

/**
 * Twilio sends urlencoded form. Your app must mount:
 * app.use("/api/twilio", express.urlencoded({ extended: false }), twilioRouter)
 */
router.post("/inbound", async (req: Request, res: Response) => {
  try {
    if (!validateSignature(req)) {
      // If you want to silently accept in dev, just return emptyTwiML
      return res.status(403).type("text/xml").send("<Response/>");
    }

    const from = String(req.body.From || "").trim();
    const to = String(req.body.To || "").trim();
    const body = String(req.body.Body || "").trim();

    if (!from || !body) return emptyTwiML(res);

    // Find the lead by phone (stored as E.164 or raw). We try strict match,
    // or fallback to last 10 digits matching.
    const d10 = last10(from);
    const lead = await prisma.lead.findFirst({
      where: {
        OR: [
          { phone: from },
          { phone: { endsWith: d10 } }, // handles "+1xxxxxxxxxx" vs "(xxx) xxx-xxxx"
          { phone: onlyDigits(from) },  // in case numbers were saved without +1
        ],
      },
      select: { id: true, ownerId: true },
    });

    if (!lead) {
      // No matching lead; you can choose to ignore or auto-create.
      // For now, just ack to Twilio without storing.
      return emptyTwiML(res);
    }

    // Ensure a thread exists
    let thread = await prisma.messageThread.findFirst({
      where: { leadId: lead.id },
      select: { id: true },
    });
    if (!thread) {
      thread = await prisma.messageThread.create({
        data: { ownerId: lead.ownerId, leadId: lead.id },
        select: { id: true },
      });
    }

    // Store inbound message
    await prisma.message.create({
      data: {
        threadId: thread.id,
        direction: "INBOUND",
        body,
        status: "RECEIVED",
        fromNumber: from,
        toNumber: to || null,
      },
    });

    // Update thread last activity
    await prisma.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() },
    });

    return emptyTwiML(res);
  } catch (err) {
    // Never fail Twilio webhooks; just return TwiML
    return emptyTwiML(res);
  }
});

export default router;

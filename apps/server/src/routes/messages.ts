// src/routes/messages.ts
import { Router, type Request, type Response } from "express";
import { prisma } from "../prisma.js";

const router = Router();

/** ----- Common selects ----- */
const messageSelect = {
  id: true,
  createdAt: true,
  status: true,
  threadId: true,
  direction: true,
  body: true,
  error: true,
  externalSid: true,
  toNumber: true,
  fromNumber: true,
} as const;

const threadSelect = {
  id: true,
  ownerId: true,
  leadId: true,
  phoneNumberSid: true,
  lastMessageAt: true,
  lead: {
    select: { id: true, name: true, email: true, phone: true },
  },
  messages: {
    orderBy: { createdAt: "asc" as const },
    select: messageSelect,
  },
} as const;

/** Resolve ownerId (replace with auth user when you wire auth middleware) */
function getOwnerId(req: Request): string {
  // If you have auth, prefer: (req as any)?.user?.id
  return (req as any)?.user?.id ?? "system";
}

/** GET /api/messages/threads?leadId=... — list threads (optionally by lead) */
router.get("/threads", async (req: Request, res: Response) => {
  const ownerId = getOwnerId(req);
  const leadId = (req.query.leadId as string | undefined) || undefined;

  const threads = await prisma.messageThread.findMany({
    where: { ownerId, ...(leadId ? { leadId } : {}) },
    orderBy: { lastMessageAt: "desc" },
    select: threadSelect,
  });

  res.json({ ok: true, data: threads });
});

/** GET /api/messages/thread/:id — one thread with messages */
router.get("/thread/:id", async (req: Request, res: Response) => {
  const ownerId = getOwnerId(req);
  const id = req.params.id;

  const thread = await prisma.messageThread.findFirst({
    where: { id, ownerId },
    select: threadSelect,
  });

  if (!thread) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, data: thread });
});

/**
 * POST /api/messages/send
 * body: { threadId?: string, leadId?: string, body: string, toNumber?: string, fromNumberSid?: string }
 * - Creates a message (OUTBOUND, QUEUED)
 * - Creates thread if needed (when leadId provided)
 * - Twilio delivery can be handled by a worker later
 */
router.post("/send", async (req: Request, res: Response) => {
  const ownerId = getOwnerId(req);
  const { threadId, leadId, body, toNumber, fromNumberSid } = req.body || {};

  if (!body || typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ ok: false, error: "Message body required" });
  }

  // Find or create a thread
  let thread =
    threadId &&
    (await prisma.messageThread.findFirst({
      where: { id: threadId, ownerId },
      select: { id: true, leadId: true, phoneNumberSid: true },
    }));

  if (!thread) {
    if (!leadId) {
      return res
        .status(400)
        .json({ ok: false, error: "leadId (or existing threadId) required" });
    }
    // Ensure the lead belongs to this owner
    const lead = await prisma.lead.findFirst({
      where: { id: leadId },
      select: { id: true, ownerId: true },
    });
    if (!lead) return res.status(404).json({ ok: false, error: "Lead not found" });

    thread = await prisma.messageThread.create({
      data: {
        ownerId,
        leadId,
        phoneNumberSid: fromNumberSid || null,
        lastMessageAt: new Date(),
      },
      select: { id: true, leadId: true, phoneNumberSid: true },
    });
  }

  // Create the outbound message in QUEUED state
  const message = await prisma.message.create({
    data: {
      threadId: thread.id,
      direction: "OUTBOUND",
      body,
      status: "QUEUED",
      toNumber: toNumber ?? null,
      fromNumber: null, // you may fill this after you resolve the default number
    },
    select: messageSelect,
  });

  // Touch thread lastMessageAt
  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  // (Optional) enqueue a job to send via Twilio here

  res.json({ ok: true, message, threadId: thread.id });
});

export default router;

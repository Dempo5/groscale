// minimal messages router (Express)
import { Router } from "express";
import prisma from "../prisma.js"; // adjust import to your prisma instance
const router = Router();

// List threads
router.get("/threads", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const threads = await prisma.messageThread.findMany({
    where: { ownerId },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true, ownerId: true, leadId: true, phoneNumberSid: true, lastMessageAt: true,
      lead: { select: { name: true, email: true, phone: true } }
    }
  });
  res.json(threads.map(t => ({
    id: t.id,
    ownerId: t.ownerId,
    leadId: t.leadId,
    phoneNumberSid: t.phoneNumberSid,
    lastMessageAt: t.lastMessageAt,
    leadName: t.lead?.name ?? null,
    leadEmail: t.lead?.email ?? null,
    leadPhone: t.lead?.phone ?? null,
  })));
});

// Get one thread (+ messages)
router.get("/:threadId", async (req, res) => {
  const thread = await prisma.messageThread.findUnique({ where: { id: req.params.threadId } });
  if (!thread) return res.status(404).json({ error: "not found" });
  const messages = await prisma.message.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });
  res.json({ thread, messages });
});

// Start a thread (optionally send first message)
router.post("/start", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const { phone, name, body } = req.body || {};
  if (!phone) return res.status(400).json({ ok: false, error: "phone required" });

  // ensure lead exists
  const lead = await prisma.lead.upsert({
    where: { phone },
    create: { phone, name: name || phone, ownerId },
    update: {},
  });

  // ensure thread exists
  let thread = await prisma.messageThread.findFirst({ where: { ownerId, leadId: lead.id } });
  if (!thread) thread = await prisma.messageThread.create({
    data: { ownerId, leadId: lead.id }
  });

  let message = null;
  if (body && String(body).trim() !== "") {
    message = await prisma.message.create({
      data: {
        threadId: thread.id,
        direction: "OUTBOUND",
        body: String(body),
        status: "QUEUED",
      }
    });
    await prisma.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() },
    });
  }

  res.json({ ok: true, thread, message });
});

// Send a message in a thread
router.post("/send", async (req, res) => {
  const { threadId, body } = req.body || {};
  if (!threadId || !body) return res.status(400).json({ ok: false, error: "threadId and body required" });

  const message = await prisma.message.create({
    data: {
      threadId,
      direction: "OUTBOUND",
      body: String(body),
      status: "QUEUED",
    }
  });
  await prisma.messageThread.update({
    where: { id: threadId },
    data: { lastMessageAt: new Date() },
  });

  res.json({ ok: true, message });
});

export default router;

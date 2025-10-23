// apps/server/src/routes/messages.ts
import { Router } from "express";
import { prisma } from "../prisma.js"; // ESM: include .js in relative import

const r = Router();

/* List threads (left rail) */
r.get("/threads", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const rows = await prisma.messageThread.findMany({
    where: { ownerId },
    orderBy: { lastMessageAt: "desc" },
    include: { lead: { select: { name: true, email: true, phone: true } } },
  });

  res.json({
    ok: true,
    data: rows.map((t) => ({
      id: t.id,
      ownerId: t.ownerId,
      leadId: t.leadId,
      leadName: t.lead?.name ?? null,
      leadEmail: t.lead?.email ?? null,
      leadPhone: t.lead?.phone ?? null,
      phoneNumberSid: (t as any).phoneNumberSid ?? null,
      lastMessageAt: t.lastMessageAt ?? null,
    })),
  });
});

/* Get messages in a thread */
r.get("/:threadId", async (req, res) => {
  const { threadId } = req.params as { threadId: string };
  const data = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ ok: true, data });
});

/* Start a thread by phone */
r.post("/start", async (req, res) => {
  const ownerId = (req as any).user?.id || "system";
  const { phone, name, leadId, firstMessage, workflowId } = (req.body ?? {}) as {
    phone?: string;
    name?: string;
    leadId?: string;
    firstMessage?: string;
    workflowId?: string; // accepted but ignored unless your schema has it
  };

  if (!phone) return res.status(400).json({ ok: false, error: "phone required" });

  // create or connect a lead
  const lead =
    leadId
      ? await prisma.lead.findUnique({ where: { id: leadId } })
      : await prisma.lead.create({
          data: { name: name || phone, email: null, phone, ownerId },
        });

  // NOTE: do NOT include workflowId unless it exists in your Prisma model
  const thread = await prisma.messageThread.create({
    data: {
      ownerId,
      leadId: lead!.id,
      // workflowId, // ❌ remove/comment if not in schema
    },
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

/* Send a message into an existing thread */
r.post("/send", async (req, res) => {
  const { threadId, body } = (req.body ?? {}) as { threadId?: string; body?: string };
  if (!threadId || !body || !body.trim()) {
    return res.status(400).json({ ok: false, error: "threadId/body required" });
  }

  const msg = await prisma.message.create({
    data: {
      threadId,
      direction: "OUTBOUND",
      body: body.trim(),
      status: "QUEUED",
    },
  });

  res.json({ ok: true, id: msg.id });
});

export default r;

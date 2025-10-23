// apps/server/src/routes/messages.ts
import { Router } from "express";
// ESM-style import needs explicit extension under moduleResolution node16/nodenext:
import { prisma } from "../prisma.js";

const r = Router();

/* -------------------------------------------
   Start a new thread (by phone) BEFORE /:id
-------------------------------------------- */
r.post("/start", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id || "system";
    const { phone, name, leadId, firstMessage } = req.body || {};
    if (!phone) return res.status(400).json({ ok: false, error: "phone required" });

    // Create or find the lead
    const lead =
      leadId
        ? await prisma.lead.findUnique({ where: { id: leadId } })
        : await prisma.lead.create({
            data: { name: name || phone, email: null, phone, ownerId },
          });

    if (!lead) return res.status(404).json({ ok: false, error: "lead not found" });

    const thread = await prisma.messageThread.create({
      data: { ownerId, leadId: lead.id },
    });

    if (firstMessage && String(firstMessage).trim() !== "") {
      await prisma.message.create({
        data: {
          threadId: thread.id,
          direction: "OUTBOUND",
          body: String(firstMessage),
          status: "QUEUED",
        },
      });
      // enqueue SMS send here if desired
    }

    return res.json({ ok: true, thread });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});

/* -------------------------------------------
   Send message in an existing thread
-------------------------------------------- */
r.post("/send", async (req, res) => {
  try {
    const { threadId, body } = req.body || {};
    if (!threadId || !body) {
      return res.status(400).json({ ok: false, error: "threadId/body required" });
    }

    const msg = await prisma.message.create({
      data: { threadId, direction: "OUTBOUND", body: String(body), status: "QUEUED" },
    });

    // enqueue SMS send here if desired
    return res.json({ ok: true, id: msg.id });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});

/* -------------------------------------------
   List threads (for current owner)
-------------------------------------------- */
r.get("/threads", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id || "system";

    const rows = await prisma.messageThread.findMany({
      where: { ownerId },
      orderBy: { lastMessageAt: "desc" },
      include: { lead: { select: { name: true, email: true, phone: true } } },
    });

    const data = rows.map((t: (typeof rows)[number]) => ({
      id: t.id,
      ownerId: t.ownerId,
      leadId: t.leadId,
      leadName: t.lead?.name ?? null,
      leadEmail: t.lead?.email ?? null,
      leadPhone: t.lead?.phone ?? null,
      phoneNumberSid: t.phoneNumberSid,
      lastMessageAt: t.lastMessageAt,
    }));

    return res.json({ ok: true, data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});

/* -------------------------------------------
   Get messages in a thread
   (provide both /thread/:threadId and legacy /:threadId)
-------------------------------------------- */
async function getThreadHandler(req: any, res: any) {
  try {
    const threadId = req.params.threadId;
    const data = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
    });
    return res.json({ ok: true, data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
}
r.get("/thread/:threadId", getThreadHandler);
r.get("/:threadId", getThreadHandler); // backward compat (make sure this stays AFTER /start and /send)

export default r;

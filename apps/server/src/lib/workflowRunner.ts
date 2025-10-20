import twilio from "twilio";
import { prisma } from "../prisma.js";

const tw = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function getDefaultFromNumber(ownerId?: string | null): Promise<string | null> {
  // 1) Try default from DB for this owner
  const pn = await prisma.phoneNumber.findFirst({
    where: { ownerId: ownerId || undefined, isDefault: true },
    select: { number: true },
  });
  if (pn?.number) return pn.number;
  // 2) Fallback to env
  return process.env.TWILIO_FROM ?? null;
}

/**
 * Minimal “runner”: executes steps immediately, in order.
 * WAIT is currently a no-op (demo); SEND_TEXT is sent via Twilio now.
 */
export async function startWorkflow(leadId: string, workflowId: string) {
  const wf = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!wf || !wf.steps?.length) return;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.phone) return; // need a phone to send SMS

  const fromNumber = await getDefaultFromNumber(lead.ownerId);
  if (!fromNumber) return;

  // Find or create thread
  const thread = await prisma.messageThread.upsert({
    where: { ownerId_leadId: { ownerId: lead.ownerId, leadId: lead.id } } as any,
    update: { lastMessageAt: new Date() },
    create: { ownerId: lead.ownerId, leadId: lead.id, lastMessageAt: new Date() },
  });

  for (const step of wf.steps) {
    if (step.type === "SEND_TEXT" && step.textBody) {
      // create queued message
      const msg = await prisma.message.create({
        data: {
          threadId: thread.id,
          direction: "OUTBOUND",
          body: step.textBody,
          status: "QUEUED",
          toNumber: lead.phone,
          fromNumber,
        },
      });

      try {
        const twRes = await tw.messages.create({
          to: lead.phone!,
          from: fromNumber,
          body: step.textBody,
        });

        await prisma.message.update({
          where: { id: msg.id },
          data: { status: "SENT", externalSid: twRes.sid },
        });
      } catch (e: any) {
        await prisma.message.update({
          where: { id: msg.id },
          data: { status: "FAILED", error: String(e?.message || e) },
        });
        // keep going so demo doesn't fully break
      }
    }

    if (step.type === "WAIT") {
      // Demo: skip scheduling. (We can persist “next due” later.)
      continue;
    }
  }
}
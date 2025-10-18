// apps/server/src/routes/copilot.ts
import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const REPLY_WORD_LIMIT = 120;
const TIMEOUT_MS = 15_000;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set on the server");
  return new OpenAI({ apiKey: key });
}

type Tone = "friendly" | "direct" | "formal";
type CopilotBody = {
  lastMessage?: string;
  threadPreview?: string[];
  lead?: { name?: string; email?: string; phone?: string };
  tone?: Tone;
  goal?: string;
};

// --- simple fallback generator when model is unavailable ---
function fallbackDraft(input: {
  lastMessage: string;
  tone: Tone;
  leadName: string;
  goal?: string;
}) {
  const { lastMessage, tone, leadName, goal } = input;
  const polite =
    tone === "formal"
      ? "Thanks for reaching out."
      : tone === "direct"
      ? "Thanks for the note."
      : "Hey — happy to help!";

  const ask =
    "Could you share your preferred budget and current carrier? I’ll outline a couple options right away.";
  const line2 = goal ? `Once I know more, I can ${goal}.` : "I’ll follow up with clear next steps.";

  return `${polite} ${leadName ? leadName + "," : ""} I saw your message: “${lastMessage}”. ${ask} ${line2}`;
}

// --- tiny helpers ---
function normTone(t?: string): Tone {
  if (t === "direct" || t === "formal" || t === "friendly") return t;
  return "friendly";
}
function buildUserPrompt(body: CopilotBody): string {
  const tone = normTone(body.tone);
  const leadName = (body.lead?.name || "there").toString().slice(0, 80);
  const sections: string[] = [];
  if (Array.isArray(body.threadPreview) && body.threadPreview.length) {
    const preview = body.threadPreview.slice(-6).map((m, i) => `${i + 1}. ${m}`).join("\n");
    sections.push(`Thread preview (last ${Math.min(body.threadPreview.length, 6)}):\n${preview}`);
  }
  if (body.lastMessage) sections.push(`Latest lead message: "${body.lastMessage}"`);
  if (body.goal) sections.push(`Agent goal/context: ${body.goal}`);
  return `
Lead name: ${leadName}
Preferred tone: ${tone}

${sections.join("\n\n")}

Write a reply I can send now. Keep it under ${REPLY_WORD_LIMIT} words.
If you need info before specifics, ask 1–2 concise questions.
Return ONLY the message text, no prefixes.
  `.trim();
}
const is429 = (e: any) =>
  e?.status === 429 ||
  /quota|rate|429/i.test(String(e?.message || e)) ||
  /insufficient/i.test(String(e?.message || e));

// --- quick health checks ---
router.get("/ping", (_req, res) => res.json({ ok: true }));
router.get("/selfcheck", async (_req, res) => {
  try {
    const client = getClient();
    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    res.json({ ok: true, model: r.model, id: r.id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// --- main route ---
router.post("/draft", async (req, res) => {
  const body = (req.body || {}) as CopilotBody;
  const tone = normTone(body.tone);
  const leadName = body.lead?.name || "there";

  if (!body.lastMessage?.trim()) {
    return res.status(400).json({ ok: false, error: "lastMessage required" });
  }

  try {
    const client = getClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const completion = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: "You are GroScales Copilot. Short, clear, trustworthy; end with one next step." },
          { role: "user", content: buildUserPrompt(body) },
        ],
        temperature: 0.7,
        max_tokens: 220,
      },
      { signal: controller.signal }
    );

    clearTimeout(timer);

    const draft = completion.choices?.[0]?.message?.content?.trim();
    if (!draft) throw new Error("No draft generated");

    return res.json({
      ok: true,
      draft,
      meta: { id: completion.id, model: completion.model, usage: completion.usage },
    });
  } catch (e: any) {
    console.error("[Copilot] draft error:", e?.status, e?.message || e);

    // Friendly fallback for 429 / quota and similar
    if (is429(e)) {
      return res.status(200).json({
        ok: true,
        draft: fallbackDraft({
          lastMessage: body.lastMessage!,
          tone,
          leadName,
          goal: body.goal,
        }),
        meta: { fallback: true, reason: "openai_quota" },
      });
    }

    // Generic failure (keep your previous helpful default)
    return res.status(500).json({
      ok: false,
      error: e?.message || "Copilot failed to draft.",
      draft:
        "Hey — happy to help! Could you share your preferred budget and current carrier? I’ll outline a couple options right away.",
      meta: { fallback: true, reason: "error" },
    });
  }
});

export default router;

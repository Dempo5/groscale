// apps/server/src/routes/copilot.ts
import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const REPLY_WORD_LIMIT = 120;
const TIMEOUT_MS = 15_000;
const RETRIES = 2; // total attempts = RETRIES + 1

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set on the server");
  return new OpenAI({ apiKey: key });
}

// Minimal content policy — short, clear, professional, safe
const SYSTEM = `
You are GroScales Copilot. Write concise, human, trustworthy replies for insurance leads.
Rules:
- Be helpful and plain-spoken. No hype, no slang.
- Never invent facts. If unsure, ask a short clarifying question.
- Prefer short paragraphs (1–3 sentences). Use bullets only if they truly help.
- Keep PHI out of replies. Avoid promises; prefer "can" over "will".
- Mirror the requested tone: friendly | direct | formal.
- End with one simple next step or question.
`.trim();

type Tone = "friendly" | "direct" | "formal";
type CopilotBody = {
  lastMessage?: string;
  threadPreview?: string[];
  lead?: { name?: string; email?: string; phone?: string };
  tone?: Tone;
  goal?: string; // optional business goal/context
};

// ---------- Utils ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(err: any): boolean {
  const msg = String(err?.message || err).toLowerCase();
  // network/timeout/rate-limit/5xx-ish
  return (
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("overloaded") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("429")
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES && isTransient(e)) {
        await sleep(300 * Math.pow(2, attempt)); // 300ms, 600ms, ...
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

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
  if (body.lastMessage) {
    sections.push(`Latest lead message: "${body.lastMessage}"`);
  }
  if (body.goal) {
    sections.push(`Agent goal/context: ${body.goal}`);
  }

  return `
Lead name: ${leadName}
Preferred tone: ${tone}

${sections.join("\n\n")}

Write a reply I can send now. Keep it under ${REPLY_WORD_LIMIT} words.
If you need info before specifics, ask 1–2 concise questions.
Return ONLY the message text, no prefixes or quoting.
  `.trim();
}

// ---------- Health & diagnostics ----------
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
    console.error("[Copilot] selfcheck error:", e?.stack || e?.message || e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---------- Main: draft ----------
router.post("/draft", async (req, res) => {
  try {
    const body: CopilotBody = (req.body || {}) as CopilotBody;
    if (!body.lastMessage?.trim()) {
      return res.status(400).json({ ok: false, error: "lastMessage required" });
    }

    const messages = [
      { role: "system" as const, content: SYSTEM },
      { role: "user" as const, content: buildUserPrompt(body) },
    ];

    const client = getClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const completion = await withRetry(() =>
      client.chat.completions.create(
        {
          model: MODEL,
          messages,
          temperature: 0.7,
          max_tokens: 220,
        },
        { signal: controller.signal }
      )
    );

    clearTimeout(timer);

    const draft = completion.choices?.[0]?.message?.content?.trim();
    if (!draft) throw new Error("No draft generated");

    res.json({
      ok: true,
      draft,
      meta: {
        id: completion.id,
        model: completion.model,
        usage: completion.usage,
      },
    });
  } catch (e: any) {
    console.error("[Copilot] draft error:", e?.stack || e?.message || e);
    res.status(500).json({
      ok: false,
      error: e?.message || "Copilot failed to draft.",
      draft:
        "Hey — happy to help! Could you share your preferred budget and current carrier? I’ll outline a couple options right away.",
    });
  }
});

export default router;

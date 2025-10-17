// apps/server/src/routes/copilot.ts
import { Router } from "express";

// If you're using OpenAI:
//   pnpm add openai
//   add OPENAI_API_KEY=sk-... to your server .env
import OpenAI from "openai";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Minimal content policy — short, clear, professional, safe
const SYSTEM = `
You are GroScales Copilot. Write concise, human, trustworthy replies for insurance leads.
Rules:
- Be helpful and plain-spoken. No hype, no slang.
- Never invent facts. If unsure, ask a short clarifying question.
- Prefer short paragraphs (1–3 sentences). Use bullets only if needed.
- Keep PHI out of replies. Avoid promises; use "can" not "will".
- Mirror the requested tone: friendly | direct | formal.
- End with one simple next step or question.
`;

type CopilotBody = {
  lastMessage?: string;          // the latest incoming message from the lead
  threadPreview?: string[];      // optional: last few messages in order
  lead?: { name?: string; email?: string; phone?: string }; // optional context
  tone?: "friendly" | "direct" | "formal";
};

router.post("/draft", async (req, res) => {
  const body = (req.body || {}) as CopilotBody;
  const tone = body.tone || "friendly";
  const leadName = body.lead?.name || "there";

  const parts: string[] = [];
  if (body.threadPreview?.length) {
    parts.push(`Thread preview:\n${body.threadPreview.map((m, i) => `${i+1}. ${m}`).join("\n")}`);
  }
  if (body.lastMessage) {
    parts.push(`Latest lead message: "${body.lastMessage}"`);
  }

  const userPrompt = `
Lead name: ${leadName}
Preferred tone: ${tone}

${parts.join("\n\n")}

Write a reply I can send now. Keep it under 120 words. 
If you need info before giving specifics, ask 1–2 concise questions.
Return ONLY the message text, no prefixes.
  `.trim();

  try {
    // OpenAI (fast + good): gpt-4o-mini is a solid, cost-effective default
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 220,
    });

    const draft =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Thanks for reaching out—could you share a bit more so I can help?";

    res.json({ ok: true, draft });
  } catch (e: any) {
    console.error("[Copilot] draft error:", e?.message || e);
    res.status(500).json({
      ok: false,
      error: "Copilot failed to draft. Try again.",
      draft:
        "Hey — happy to help! Could you share your preferred budget and current carrier? I’ll outline a couple options right away.",
    });
  }
});

export default router;
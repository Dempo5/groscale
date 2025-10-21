import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../prisma.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/* ---------------- helpers ---------------- */

const H: Record<string, string> = {
  firstname: "first",
  "first name": "first",
  first: "first",
  lastname: "last",
  "last name": "last",
  last: "last",
  name: "name",
  "full name": "name",
  fullname: "name",
  "contact name": "name",
  email: "email",
  "e-mail": "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  cell: "phone",
  telephone: "phone",
  primaryphc: "phone",
  phone2: "phone",
  "primary phone": "phone",
  tags: "tags",
  label: "tags",
  labels: "tags",
  segments: "tags",
  note: "note",
  notes: "note",
  dob: "dob",
  "date of birth": "dob",
  city: "city",
  state: "state",
  zip: "zip",
  zipcode: "zip",
  "postal code": "zip",
  address: "address",
};

const norm = (s?: string) =>
  (s || "").replace(/\uFEFF/g, "").trim().toLowerCase().replace(/\s+/g, " ");

const nHeader = (s: string) => H[norm(s)] || norm(s);

const pickDelimiter = (txt: string) =>
  ([",", ";", "\t", "|"] as const).reduce(
    (best, ch) => {
      const rows = txt.split(/\r?\n/).slice(0, 8);
      const counts = rows.map((r) => (r.match(new RegExp(ch, "g")) || []).length);
      const avg = counts.reduce((a, b) => a + b, 0) / Math.max(counts.length, 1);
      const variance =
        counts.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(counts.length, 1);
      const score = avg - Math.sqrt(variance);
      return score > best.score ? { ch, score } : best;
    },
    { ch: ",", score: -1 as number }
  ).ch;

const asEmail = (v?: any) => {
  const t = String(v ?? "").trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(t) ? t : undefined;
};

const asPhone = (v?: any) => {
  let t = String(v ?? "").replace(/[^\d+]/g, "");
  if (!t) return;
  // If US 10-digit without +1, normalize
  if (!t.startsWith("+") && /^\d{10}$/.test(t)) t = "+1" + t;
  // If 11 digits starting with 1 (US), allow
  if (/^1\d{10}$/.test(t)) t = "+" + t;
  return /^\+?\d{7,15}$/.test(t) ? t : undefined;
};

const fullName = (name?: string, first?: string, last?: string) =>
  (name?.trim() || [first, last].filter(Boolean).join(" ").trim()) || undefined;

function safeJSON<T = any>(v: any): T | undefined {
  try {
    return v ? JSON.parse(String(v)) : undefined;
  } catch {
    return undefined;
  }
}

async function upsertTags(ownerId: string, leadId: string, names: string[]) {
  if (!names?.length) return;
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const tag = await prisma.tag.upsert({
      where: { ownerId_name: { ownerId, name } },
      create: { ownerId, name },
      update: {},
      select: { id: true },
    });
    await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId, tagId: tag.id } },
      create: { leadId, tagId: tag.id },
      update: {},
    });
  }
}

/* ---------------- route ---------------- */

router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  const ownerId = (req as any)?.user?.id ?? "system";

  const options =
    (safeJSON(req.body?.options) as
      | { ignoreDuplicates?: boolean; tags?: string[]; workflowId?: string }
      | undefined) || {};
  const mapping =
    (safeJSON(req.body?.mapping) as
      | Partial<
          Record<
            "name" | "first" | "last" | "email" | "phone" | "tags" | "note" | "city" | "state" | "zip" | "address" | "dob",
            string
          >
        >
      | undefined) || {};

  const text = req.file.buffer.toString("utf8");
  const d = pickDelimiter(text);

  let original: string[] = [];
  let rows: any[] = [];
  try {
    rows = parse(text, {
      delimiter: d,
      bom: true,
      trim: true,
      relax_column_count: true,
      columns: (hdr: string[]) => (
        (original = hdr.map((h) => String(h).replace(/\uFEFF/g, "").trim())),
        original.map(nHeader)
      ),
    });
  } catch (e: any) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid CSV", details: e?.message });
  }

  const canon = original.map(nHeader);
  const mIndex: Record<string, number> = {};
  for (const k of [
    "name",
    "first",
    "last",
    "email",
    "phone",
    "tags",
    "note",
    "city",
    "state",
    "zip",
    "address",
    "dob",
  ] as const) {
    const explicit = mapping?.[k];
    // Prefer exact header the UI picked; otherwise fall back to canonical match
    mIndex[k] =
      explicit && original.findIndex((h) => h.toLowerCase() === explicit.toLowerCase()) >= 0
        ? original.findIndex((h) => h.toLowerCase() === explicit.toLowerCase())
        : canon.indexOf(k);
  }
  const pick = (r: any, k: keyof typeof mIndex) =>
    mIndex[k] >= 0 ? r[original[mIndex[k]]] ?? r[k] : undefined;

  let inserted = 0,
    invalids = 0,
    skipped = 0,
    fileDup = 0,
    dbDup = 0;

  const seen = new Set<string>();
  const rowErrors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    const email = asEmail(pick(r, "email"));
    const phone = asPhone(pick(r, "phone"));
    if (!email && !phone) {
      invalids++;
      if (rowErrors.length < 10) rowErrors.push({ row: i + 1, reason: "missing email & phone" });
      continue;
    }

    // Name is now optional: fallback to email user part or the phone itself
    const nm =
      fullName(pick(r, "name"), pick(r, "first"), pick(r, "last")) ||
      (email ? email.split("@")[0] : undefined) ||
      phone;

    const key = email || (phone as string);
    if (seen.has(key)) {
      fileDup++;
      if (options.ignoreDuplicates) continue;
    }
    seen.add(key);

    const exists = await prisma.lead.findFirst({
      where: { ownerId, OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
      select: { id: true },
    });
    if (exists) {
      dbDup++;
      continue;
    }

    const lead = await prisma.lead.create({
      data: { ownerId, name: String(nm), email, phone },
      select: { id: true },
    });

    const rowTags = String(pick(r, "tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const allTags = Array.from(new Set([...(options.tags || []), ...rowTags]));
    if (allTags.length) await upsertTags(ownerId, lead.id, allTags);

    // workflowId will be used by your async worker later; no-op here
    inserted++;
  }

  return res.json({
    ok: true,
    inserted,
    duplicates: dbDup,
    invalids,
    skipped,
    stats: { totalRows: rows.length, fileDuplicates: fileDup, sampledErrors: rowErrors },
    meta: {
      delimiter: d,
      mappingUsed: mapping,
      workflowId: options.workflowId,
      tags: options.tags || [],
    },
  });
});

export default router;
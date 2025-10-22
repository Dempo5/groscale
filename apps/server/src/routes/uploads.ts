// apps/server/src/routes/uploads.ts
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../prisma.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/* ---------------- header canon + utils ---------------- */
const H: Record<string, string> = {
  firstname: "first", "first name": "first", first: "first",
  lastname: "last", "last name": "last", last: "last",
  name: "name", "full name": "name", fullname: "name", "contact name": "name",
  email: "email", "e-mail": "email", "email address": "email", mail: "email",
  phone: "phone", "phone number": "phone", mobile: "phone", cell: "phone",
  telephone: "phone", tel: "phone", "primary ph": "phone", "primary phone": "phone",
  ph: "phone", phone2: "phone",
  tags: "tags", label: "tags", labels: "tags", segments: "tags", groups: "tags", lists: "tags",
  note: "note", notes: "note", comment: "note", comments: "note", memo: "note",
  city: "city", town: "city",
  state: "state", province: "state", region: "state",
  zip: "zip", zipcode: "zip", "postal code": "zip", "post code": "zip",
  address: "address", addr: "address", "street address": "address", street: "address", line1: "address",
  dob: "dob", "date of birth": "dob",
};
const norm = (s?: string) => (s || "").replace(/\uFEFF/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const nHeader = (s: string) => H[norm(s)] || s.trim();
const guessDelim = (txt: string) =>
  ([",", ";", "\t", "|"] as const).reduce(
    (best, ch) => {
      const rows = txt.split(/\r?\n/).slice(0, 6);
      const counts = rows.map((r) => (r.match(new RegExp(`\\${ch}`, "g")) || []).length);
      const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
      const variance = counts.reduce((a, b) => a + (b - avg) ** 2, 0) / (counts.length || 1);
      const score = avg - Math.sqrt(variance);
      return score > best.score ? { ch, score } : best;
    },
    { ch: ",", score: -1 as number }
  ).ch;

const asEmail = (v?: any) => {
  const t = String(v ?? "").trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(t) ? t : undefined;
};

// Normalizes US and intl numbers; returns +E.164 when possible
const asPhone = (v?: any) => {
  let t = String(v ?? "").replace(/[^\d+]/g, "");
  if (!t) return;
  // strip leading 1 if 11 digits (US)
  if (!t.startsWith("+")) {
    const digits = t.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) t = "+1" + digits.slice(1);
    else if (digits.length === 10) t = "+1" + digits;
    else if (/^\d{7,15}$/.test(digits)) t = "+" + digits;
  }
  return /^\+\d{7,15}$/.test(t) ? t : undefined;
};

const fullName = (name?: string, first?: string, last?: string) => {
  const n = (name?.trim() || [first, last].filter(Boolean).join(" ").trim()).replace(/\s+/g, " ");
  return n || undefined;
};

function safeJSON<T = any>(v: any): T | undefined {
  try {
    return v ? JSON.parse(String(v)) : undefined;
  } catch {
    return undefined;
  }
}

async function ensureOwner(ownerId: string) {
  // Makes sure a user exists so Lead.ownerId foreign key never explodes when unauthenticated.
  await prisma.user.upsert({
    where: { id: ownerId },
    update: {},
    create: {
      id: ownerId,
      email: `${ownerId}@local`,
      name: "System",
      hashedPassword: "!", // placeholder
    },
  });
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

  const ownerId =
    (req as any)?.user?.id ||
    process.env.DEFAULT_OWNER_ID ||
    "system";
  await ensureOwner(ownerId);

  const options =
    (safeJSON(req.body?.options) as
      | { ignoreDuplicates?: boolean; tags?: string[]; workflowId?: string }
      | undefined) || {};

  const mapping =
    (safeJSON(req.body?.mapping) as
      | Partial<Record<"name" | "first" | "last" | "email" | "phone" | "tags" | "note", string>>
      | undefined) || {};

  const text = req.file.buffer.toString("utf8");
  const d = guessDelim(text);

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
        original.map(nHeader) // canonical keys in row objects
      ),
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: "Invalid CSV", details: e?.message });
  }

  const canon = original.map(nHeader);

  // Build index map; prefer explicit mapping when provided
  const mIndex: Record<string, number> = {};
  for (const k of ["name", "first", "last", "email", "phone", "tags", "note"] as const) {
    const explicit = mapping?.[k];
    mIndex[k] =
      explicit && original.includes(explicit) ? original.indexOf(explicit) : canon.indexOf(k);
  }

  // prefer raw header by index; otherwise use canonical key
  const pick = (r: any, k: keyof typeof mIndex) =>
    mIndex[k] >= 0 ? r[canon[mIndex[k]]] ?? r[k] : r[k];

  let inserted = 0,
    invalids = 0,
    skipped = 0,
    fileDup = 0,
    dbDup = 0;

  const seen = new Set<string>();

  for (const r of rows) {
    // Name: optional now; we’ll generate if missing
    let nm = fullName(pick(r, "name"), pick(r, "first"), pick(r, "last"));
    const email = asEmail(pick(r, "email"));
    const phone = asPhone(pick(r, "phone"));

    // require at least one contact path
    if (!email && !phone) {
      invalids++;
      continue;
    }

    if (!nm) {
      // auto-name from email local-part or last 4 of phone
      nm = email?.split("@")[0] || (phone ? `Lead ${phone.slice(-4)}` : undefined);
    }

    // file-level dedupe: prefer email, else phone
    const key = email || (phone as string);
    if (seen.has(key)) {
      fileDup++;
      if (options.ignoreDuplicates) continue;
    }
    seen.add(key);

    // DB-level dedupe
    const exists = await prisma.lead.findFirst({
      where: {
        ownerId,
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      select: { id: true },
    });
    if (exists) {
      dbDup++;
      continue;
    }

    // create lead
    const lead = await prisma.lead.create({
      data: { ownerId, name: nm!, email: email || null, phone: phone || null },
      select: { id: true },
    });

    // tags: global + per-row
    const rowTags = String(pick(r, "tags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const allTags = Array.from(new Set([...(options.tags || []), ...rowTags]));
    if (allTags.length) await upsertTags(ownerId, lead.id, allTags);

    inserted++;
  }

  return res.json({
    ok: true,
    inserted,
    duplicates: dbDup,
    invalids,
    skipped,
    stats: { totalRows: rows.length, fileDuplicates: fileDup },
    meta: { delimiter: d, mappingUsed: mapping, workflowId: options.workflowId, tags: options.tags || [] },
  });
});

export default router;

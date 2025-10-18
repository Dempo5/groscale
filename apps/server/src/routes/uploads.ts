// apps/server/src/routes/uploads.ts
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";

const router = Router();

// 50 MB limit, memory storage is fine for batches ~100k rows depending on columns
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// -------- Header synonyms (expand anytime) --------
const HMAP: Record<string, "first" | "last" | "name" | "email" | "phone" | "tags" | "note" | string> = {
  // names
  "firstname": "first",
  "first name": "first",
  "first": "first",
  "lastname": "last",
  "last name": "last",
  "last": "last",
  "name": "name",
  "full name": "name",
  "fullname": "name",
  "contact name": "name",
  // email
  "email": "email",
  "e-mail": "email",
  "email address": "email",
  // phone (common variations incl. your file)
  "phone": "phone",
  "phone number": "phone",
  "mobile": "phone",
  "cell": "phone",
  "cell phone": "phone",
  "telephone": "phone",
  "primaryphc": "phone",  // <-- your column
  "phone2": "phone",      // <-- your column
  "primary phone": "phone",
  // extras
  "tags": "tags",
  "label": "tags",
  "labels": "tags",
  "segments": "tags",
  "note": "note",
  "notes": "note",
};

function normalizeHeader(h: string): string {
  const k = (h || "")
    .replace(/\uFEFF/g, "") // strip BOM
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return HMAP[k] || k;
}

// -------- Delimiter detection --------
function guessDelimiter(sample: string): "," | ";" | "\t" | "|" {
  const cand = [",", ";", "\t", "|"] as const;
  const lines = sample.split(/\r?\n/).slice(0, 8);
  let best = cand[0], bestScore = -1;
  for (const ch of cand) {
    const counts = lines.map(l => (l.match(new RegExp(ch, "g")) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const mean = avg;
    const variance = counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance); // prefer stable + frequent
    if (score > bestScore) { bestScore = score; best = ch; }
  }
  return best;
}

// -------- Value normalizers --------
function asEmail(s?: string) {
  const t = (s || "").trim().toLowerCase();
  return t && /\S+@\S+\.\S+/.test(t) ? t : undefined;
}
function asPhone(s?: string, defaultCountry: "US" | "INTL" = "US") {
  let t = (s || "").toString().trim();
  if (!t) return undefined;
  // Keep digits and leading +
  t = t.replace(/[^\d+]/g, "");
  // Excel sometimes turns 10-digit phones into scientific notation; the line above restores digits from exported CSV text
  if (!t.startsWith("+") && defaultCountry === "US" && /^\d{10}$/.test(t)) t = "+1" + t;
  // very loose final check
  if (!/^\+?\d{7,15}$/.test(t)) return undefined;
  return t;
}
function combineName(name?: string, first?: string, last?: string) {
  const n = (name || "").trim();
  if (n) return n;
  const f = (first || "").trim();
  const l = (last || "").trim();
  const full = [f, l].filter(Boolean).join(" ").trim();
  return full || undefined;
}

// --------- DB hook (swap to your real implementation) ---------
// Upsert by email OR phone; throw with code "23505" for unique conflicts if you want them counted as duplicates.
async function upsertLead(input: {
  name: string;
  email?: string;
  phone?: string;
  tags?: string[];
  note?: string;
}) {
  // Example:
  // const key = input.email || input.phone!;
  // await prisma.lead.upsert({
  //   where: { uniqueKey: key },
  //   create: { id: cuid(), uniqueKey: key, ...input, createdAt: new Date() },
  //   update: { ...input, updatedAt: new Date() },
  // });
}

// --------- Main import endpoint (matches /api/uploads/import) ---------
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  const text = req.file.buffer.toString("utf8");
  const delimiter = guessDelimiter(text);

  let rows: any[] = [];
  try {
    rows = parse(text, {
      delimiter,
      bom: true,
      trim: true,
      relax_column_count: true,
      columns: (hdrs: string[]) => hdrs.map(normalizeHeader),
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: "Invalid CSV/headers", details: e?.message });
  }

  let inserted = 0, duplicates = 0, invalids = 0, skipped = 0;
  const seen = new Set<string>();
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};

    // Pull any recognized fields (supporting your headers)
    const first = r.first;
    const last  = r.last;
    const name  = combineName(r.name, first, last);

    // prefer 'email' and the best available phone-like column
    const email = asEmail(r.email);
    const phone = asPhone(r.phone || r["primaryPhc"] || r["phone2"] || r["phone number"] || r["mobile"] || r["cell"]);

    const tags  = (r.tags || "")
      .toString()
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    const note  = (r.note || "").toString().trim() || undefined;

    const key = email || phone;
    if (!name || !key) { invalids++; continue; }

    // de-dupe within this file
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);

    try {
      await upsertLead({ name, email, phone, tags, note });
      inserted++;
    } catch (e: any) {
      if ((e?.code || "").toString() === "23505") duplicates++;
      else { skipped++; errors.push(`row ${i + 2}: ${e?.message || "insert failed"}`); }
    }
  }

  return res.json({
    ok: true,
    inserted,
    duplicates,
    invalids,
    skipped,
    errors,
    meta: { delimiter },
  });
});

export default router;

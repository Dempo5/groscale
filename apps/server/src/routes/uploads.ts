// apps/server/src/routes/uploads.ts
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
// import { prisma } from "../../prisma"; // uncomment when DB ready

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// -------- Header synonyms --------
const HMAP: Record<string, string> = {
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
  "cell phone": "phone",
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
};

// -------- Helpers --------
function normalizeHeader(h: string): string {
  const k = (h || "").replace(/\uFEFF/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  return HMAP[k] || k;
}

function guessDelimiter(sample: string): "," | ";" | "\t" | "|" {
  const cand = [",", ";", "\t", "|"] as const;
  const lines = sample.split(/\r?\n/).slice(0, 8);
  let best = cand[0],
    bestScore = -1;
  for (const ch of cand) {
    const counts = lines.map((l) => (l.match(new RegExp(ch, "g")) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const variance =
      counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > bestScore) {
      bestScore = score;
      best = ch;
    }
  }
  return best;
}

function asEmail(s?: string) {
  const t = (s || "").trim().toLowerCase();
  return t && /\S+@\S+\.\S+/.test(t) ? t : undefined;
}

function asPhone(s?: string, defaultCountry: "US" | "INTL" = "US") {
  let t = (s || "").toString().trim();
  if (!t) return undefined;
  t = t.replace(/[^\d+]/g, "");
  if (!t.startsWith("+") && defaultCountry === "US" && /^\d{10}$/.test(t)) t = "+1" + t;
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

// Simulated DB upsert — replace with prisma.lead.upsert when DB ready
async function upsertLead(input: { name: string; email?: string; phone?: string }) {
  // await prisma.lead.upsert({
  //   where: { uniqueKey: input.email || input.phone! },
  //   create: { ...input },
  //   update: { ...input },
  // });
  return input;
}

// -------- Main route --------
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  const text = req.file.buffer.toString("utf8");
  const delimiter = guessDelimiter(text);

  let originalHeaders: string[] = [];
  let normalizedHeaders: string[] = [];
  let rows: any[] = [];

  try {
    rows = parse(text, {
      delimiter,
      bom: true,
      trim: true,
      relax_column_count: true,
      columns: (hdrs: string[]) => {
        originalHeaders = hdrs.map((h) => String(h).replace(/\uFEFF/g, "").trim());
        normalizedHeaders = originalHeaders.map(normalizeHeader);
        return normalizedHeaders;
      },
    });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: "Invalid CSV", details: e?.message });
  }

  const idx = (key: string) => normalizedHeaders.indexOf(key);
  const firstIdx = idx("first"),
    lastIdx = idx("last"),
    nameIdx = idx("name"),
    emailIdx = idx("email"),
    phoneIdx = idx("phone"),
    tagsIdx = idx("tags"),
    noteIdx = idx("note");

  const mappingUsed = {
    name: nameIdx >= 0 ? originalHeaders[nameIdx] : undefined,
    first: firstIdx >= 0 ? originalHeaders[firstIdx] : undefined,
    last: lastIdx >= 0 ? originalHeaders[lastIdx] : undefined,
    email: emailIdx >= 0 ? originalHeaders[emailIdx] : undefined,
    phone: phoneIdx >= 0 ? originalHeaders[phoneIdx] : undefined,
  };

  const totalRows = rows.length;
  let validRows = 0,
    inserted = 0,
    invalids = 0,
    dbDuplicates = 0,
    fileDuplicates = 0,
    skipped = 0;
  const seenInFile = new Set<string>();
  const errors: string[] = [];

  const samples: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = combineName(
      nameIdx >= 0 ? r["name"] : undefined,
      firstIdx >= 0 ? r["first"] : undefined,
      lastIdx >= 0 ? r["last"] : undefined
    );
    const email = asEmail(emailIdx >= 0 ? r["email"] : undefined);
    const phone = asPhone(phoneIdx >= 0 ? r["phone"] : undefined);

    if (!name || (!email && !phone)) {
      invalids++;
      continue;
    }
    validRows++;

    const key = email || phone!;
    if (seenInFile.has(key)) {
      fileDuplicates++;
      continue;
    }
    seenInFile.add(key);

    if (samples.length < 10) samples.push({ name, email, phone });

    try {
      await upsertLead({ name, email, phone });
      inserted++;
    } catch (e: any) {
      if (e?.code === "23505") dbDuplicates++;
      else {
        skipped++;
        errors.push(`row ${i + 2}: ${e?.message || "insert failed"}`);
      }
    }
  }

  return res.json({
    ok: true,
    inserted,
    duplicates: dbDuplicates,
    invalids,
    skipped,
    stats: { totalRows, validRows, fileDuplicates },
    meta: { delimiter, mappingUsed, sampleMapped: samples },
  });
});

export default router;

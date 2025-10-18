// apps/server/src/routes/uploads.ts
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../../prisma"; // adjust if needed
import { Prisma } from "@prisma/client";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// -------- Header normalization --------
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

function normalizeHeader(h: string): string {
  const k = (h || "").replace(/\uFEFF/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  return HMAP[k] || k;
}

function guessDelimiter(sample: string): "," | ";" | "\t" | "|" {
  const cand = [",", ";", "\t", "|"] as const;
  const lines = sample.split(/\r?\n/).slice(0, 8);
  let best = cand[0], bestScore = -1;
  for (const ch of cand) {
    const counts = lines.map((l) => (l.match(new RegExp(ch, "g")) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > bestScore) { bestScore = score; best = ch; }
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

// --------- Main import endpoint ---------
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  const ownerId = req.user?.id || undefined; // requires auth middleware later

  // Create upload record first
  const uploadRow = await prisma.upload.create({
    data: {
      ownerId,
      fileName: req.file.originalname,
      byteSize: req.file.size,
      status: "PROCESSING",
    },
  });

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
    await prisma.upload.update({
      where: { id: uploadRow.id },
      data: { status: "FAILED", error: e.message },
    });
    return res.status(400).json({ ok: false, error: "Invalid CSV/headers", details: e?.message });
  }

  const firstIdx = normalizedHeaders.indexOf("first");
  const lastIdx = normalizedHeaders.indexOf("last");
  const nameIdx = normalizedHeaders.indexOf("name");
  const emailIdx = normalizedHeaders.indexOf("email");
  const phoneIdx = normalizedHeaders.indexOf("phone");

  let inserted = 0;
  let invalids = 0;
  let fileDuplicates = 0;
  let dbDuplicates = 0;
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
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

    const key = `${email || phone}`;
    if (seen.has(key)) {
      fileDuplicates++;
      continue;
    }
    seen.add(key);

    try {
      await prisma.lead.create({
        data: {
          name,
          email,
          phone,
          ownerId: ownerId ?? "system", // fallback if not logged in
        },
      });
      inserted++;
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        dbDuplicates++;
      } else {
        console.error(`Insert failed row ${i + 2}:`, e.message);
      }
    }
  }

  const totalRows = rows.length;
  const validRows = totalRows - invalids;

  const status =
    inserted > 0 && invalids > 0
      ? "PARTIAL"
      : inserted > 0
      ? "SUCCESS"
      : "FAILED";

  await prisma.upload.update({
    where: { id: uploadRow.id },
    data: {
      leads: validRows,
      duplicates: dbDuplicates,
      invalids,
      status,
    },
  });

  return res.json({
    ok: true,
    inserted,
    duplicates: dbDuplicates,
    invalids,
    stats: { totalRows, validRows, fileDuplicates },
    meta: { delimiter, mappingUsed: originalHeaders },
  });
});

export default router;

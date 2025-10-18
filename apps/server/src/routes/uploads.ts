// apps/server/src/routes/uploads.ts
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../../prisma";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ---------------- Header normalization ----------------
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

async function upsertTagsAndLink(ownerId: string, leadId: string, names: string[]) {
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

// ---------------- Main: /api/uploads/import ----------------
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  const ownerId = (req as any)?.user?.id || "system";

  // parse UI-provided mapping/options
  let clientMapping: any = {};
  let clientOptions: any = {};
  try {
    if (req.body?.mapping) clientMapping = JSON.parse(String(req.body.mapping));
    if (req.body?.options) clientOptions = JSON.parse(String(req.body.options));
  } catch {}

  const ignoreDuplicates = !!clientOptions?.ignoreDuplicates;
  const workflowId: string | undefined = clientOptions?.workflowId || undefined;
  const globalTags: string[] = Array.isArray(clientOptions?.tags) ? clientOptions.tags : [];

  // create upload row (PROCESSING)
  const uploadRow = await prisma.upload.create({
    data: {
      ownerId,
      fileName: req.file.originalname || "upload.csv",
      byteSize: req.file.size,
      status: "PROCESSING",
      // store chosen workflow + raw options on the upload for transparency
      reportUrl: JSON.stringify({ workflowId, options: clientOptions }),
    },
  });

  // parse CSV text
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
      data: { status: "FAILED", error: e?.message || "Invalid CSV/headers" },
    });
    return res.status(400).json({ ok: false, error: "Invalid CSV/headers", details: e?.message });
  }

  // quick lookup helpers
  const firstIdx = normalizedHeaders.indexOf("first");
  const lastIdx  = normalizedHeaders.indexOf("last");
  const nameIdx  = normalizedHeaders.indexOf("name");
  const emailIdx = normalizedHeaders.indexOf("email");
  const phoneIdx = normalizedHeaders.indexOf("phone");
  const tagsIdx  = normalizedHeaders.indexOf("tags");
  const noteIdx  = normalizedHeaders.indexOf("note");

  function getVal(row: any, canonical: "name" | "first" | "last" | "email" | "phone" | "tags" | "note") {
    const chosen = (clientMapping?.[canonical] || "").toString().trim();
    if (chosen) return row[normalizeHeader(chosen)] ?? row[chosen];
    switch (canonical) {
      case "first": return firstIdx >= 0 ? row["first"] : undefined;
      case "last":  return lastIdx  >= 0 ? row["last"]  : undefined;
      case "name":  return nameIdx  >= 0 ? row["name"]  : undefined;
      case "email": return emailIdx >= 0 ? row["email"] : undefined;
      case "phone": return phoneIdx >= 0 ? row["phone"] : undefined;
      case "tags":  return tagsIdx  >= 0 ? row["tags"]  : undefined;
      case "note":  return noteIdx  >= 0 ? row["note"]  : undefined;
    }
  }

  // stats
  let inserted = 0;
  let invalids = 0;
  let fileDuplicates = 0;
  let dbDuplicates = 0;
  let skipped = 0;

  const seenInFile = new Set<string>();
  const sampleMapped: Array<{ name?: string; email?: string; phone?: string; tags?: string[]; note?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const first = getVal(r, "first");
    const last  = getVal(r, "last");
    const nm    = getVal(r, "name");
    const email = asEmail(getVal(r, "email"));
    const phone = asPhone(getVal(r, "phone"), "US");
    const tagsFromRow = (getVal(r, "tags") || "")
      .toString().split(",").map((t: string) => t.trim()).filter(Boolean);
    const note  = (getVal(r, "note") || "").toString().trim() || undefined;
    const name  = combineName(nm, first, last);

    if (sampleMapped.length < 10) {
      sampleMapped.push({ name, email, phone, tags: tagsFromRow.length ? tagsFromRow : undefined, note });
    }

    if (!name || (!email && !phone)) { invalids++; continue; }

    const key = email || phone!;
    if (seenInFile.has(key)) {
      fileDuplicates++;
      if (ignoreDuplicates) continue;
    } else {
      seenInFile.add(key);
    }

    try {
      // real duplicate check
      const exists = await prisma.lead.findFirst({
        where: {
          ownerId,
          OR: [
            ...(email ? [{ email }] : []),
            ...(phone ? [{ phone }] : []),
          ],
        },
        select: { id: true },
      });
      if (exists) { dbDuplicates++; continue; }

      const lead = await prisma.lead.create({
        data: { name, email, phone, ownerId },
        select: { id: true },
      });

      // link tags (global + row)
      const merged = Array.from(new Set([...(globalTags || []), ...tagsFromRow]));
      if (merged.length) await upsertTagsAndLink(ownerId, lead.id, merged);

      inserted++;
    } catch (e: any) {
      console.error(`Insert failed row ${i + 2}:`, e?.message || e);
      skipped++;
    }
  }

  const totalRows = rows.length;
  const validRows = totalRows - invalids;
  const status =
    inserted > 0 && (invalids > 0 || dbDuplicates > 0) ? "PARTIAL" :
    inserted > 0 ? "SUCCESS" : "FAILED";

  await prisma.upload.update({
    where: { id: uploadRow.id },
    data: {
      leads: inserted,            // number actually inserted
      duplicates: dbDuplicates,   // already in DB
      invalids,
      status,
      // keep a small JSON summary in reportUrl for download later if you want
      reportUrl: JSON.stringify({
        delimiter, totalRows, validRows, fileDuplicates,
        mappingUsed: {
          name:  clientMapping?.name  || (nameIdx  >= 0 ? originalHeaders[nameIdx]  : undefined),
          first: clientMapping?.first || (firstIdx >= 0 ? originalHeaders[firstIdx] : undefined),
          last:  clientMapping?.last  || (lastIdx  >= 0 ? originalHeaders[lastIdx]  : undefined),
          email: clientMapping?.email || (emailIdx >= 0 ? originalHeaders[emailIdx] : undefined),
          phone: clientMapping?.phone || (phoneIdx >= 0 ? originalHeaders[phoneIdx] : undefined),
          tags:  clientMapping?.tags  || (tagsIdx  >= 0 ? originalHeaders[tagsIdx]  : undefined),
          note:  clientMapping?.note  || (noteIdx  >= 0 ? originalHeaders[noteIdx]  : undefined),
        },
        globalTags, workflowId,
      }),
    },
  });

  const emailHits = sampleMapped.filter(s => s.email).length;
  const phoneHits = sampleMapped.filter(s => s.phone).length;

  return res.json({
    ok: true,
    inserted,
    duplicates: dbDuplicates,
    invalids,
    skipped,
    stats: { totalRows, validRows, fileDuplicates },
    confidence: {
      emailDetected: emailHits >= 3,
      phoneDetected: phoneHits >= 3,
      note: `sample emails=${emailHits}, phones=${phoneHits}`,
    },
    meta: {
      delimiter,
      mappingUsed: {
        name:  clientMapping?.name  || (nameIdx  >= 0 ? originalHeaders[nameIdx]  : undefined),
        first: clientMapping?.first || (firstIdx >= 0 ? originalHeaders[firstIdx] : undefined),
        last:  clientMapping?.last  || (lastIdx  >= 0 ? originalHeaders[lastIdx]  : undefined),
        email: clientMapping?.email || (emailIdx >= 0 ? originalHeaders[emailIdx] : undefined),
        phone: clientMapping?.phone || (phoneIdx  >= 0 ? originalHeaders[phoneIdx]  : undefined),
        tags:  clientMapping?.tags  || (tagsIdx  >= 0 ? originalHeaders[tagsIdx]  : undefined),
        note:  clientMapping?.note  || (noteIdx  >= 0 ? originalHeaders[noteIdx]  : undefined),
      },
      sampleMapped,
      requestTags: globalTags,
      workflowId,
      ignoreDuplicates,
    },
  });
});

export default router;

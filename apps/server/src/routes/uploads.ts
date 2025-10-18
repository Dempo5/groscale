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

/* ---------------- Header canon + synonyms (expand any time) ---------------- */
const HMAP: Record<string, string> = {
  // core
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
  // nice-to-have (not yet stored in DB, but we parse for future)
  dob: "dob",
  "date of birth": "dob",
  city: "city",
  state: "state",
  "postal code": "zip",
  zipcode: "zip",
  zip: "zip",
  address: "address",
  // meta
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

/* ------------------------ Light delimiter detection ----------------------- */
function guessDelimiter(sample: string): "," | ";" | "\t" | "|" {
  const cand = [",", ";", "\t", "|"] as const;
  const lines = sample.split(/\r?\n/).slice(0, 8);
  let best = cand[0];
  let bestScore = -1;
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

/* ----------------------------- Value helpers ----------------------------- */
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

/* --------------------------- Tag upsert + linking ------------------------- */
async function upsertTagsAndLink(ownerId: string, leadId: string, names: string[]) {
  if (!names?.length) return;
  for (const raw of names) {
    const nm = raw.trim();
    if (!nm) continue;

    const tag = await prisma.tag.upsert({
      where: { ownerId_name: { ownerId, name: nm } }, // @@unique([ownerId, name])
      create: { ownerId, name: nm },
      update: {},
      select: { id: true },
    });

    await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId, tagId: tag.id } }, // @@id([leadId, tagId])
      create: { leadId, tagId: tag.id },
      update: {},
    });
  }
}

/* --------------------------------- Route --------------------------------- */
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  // In your app, use auth middleware (req.user.id). Fallback keeps dev easy.
  const ownerId = (req as any)?.user?.id || "system";

  // Create Upload history row
  const uploadRow = await prisma.upload.create({
    data: {
      ownerId,
      fileName: req.file.originalname || "upload.csv",
      byteSize: req.file.size,
      status: "PROCESSING",
    },
  });

  // Parse optional mapping/options (sent by wizard)
  let clientMapping: any = {};
  let clientOptions: any = {};
  try {
    if (req.body?.mapping) clientMapping = JSON.parse(String(req.body.mapping));
    if (req.body?.options) clientOptions = JSON.parse(String(req.body.options));
  } catch {
    // ignore
  }
  const ignoreDuplicates = !!clientOptions?.ignoreDuplicates;
  const requestTags: string[] = Array.isArray(clientOptions?.tags) ? clientOptions.tags : [];
  const chosenWorkflowId: string | undefined = clientOptions?.workflowId || undefined;

  // Parse CSV
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

  // Quick index lookups for default mapping
  const idx = (name: string) => normalizedHeaders.indexOf(name);
  const firstIdx = idx("first");
  const lastIdx = idx("last");
  const nameIdx = idx("name");
  const emailIdx = idx("email");
  const phoneIdx = idx("phone");
  const tagsIdx = idx("tags");
  const noteIdx = idx("note");
  // extra parsed (not stored yet)
  const dobIdx = idx("dob");
  const cityIdx = idx("city");
  const stateIdx = idx("state");
  const zipIdx = idx("zip");
  const addressIdx = idx("address");

  // Helper to pull from client mapping OR from normalized header
  function getVal(row: any, canonical: string) {
    const col = (clientMapping?.[canonical] || "").toString().trim();
    if (col) return row[col];
    switch (canonical) {
      case "first": return firstIdx >= 0 ? row["first"] : undefined;
      case "last": return lastIdx >= 0 ? row["last"] : undefined;
      case "name": return nameIdx >= 0 ? row["name"] : undefined;
      case "email": return emailIdx >= 0 ? row["email"] : undefined;
      case "phone": return phoneIdx >= 0 ? row["phone"] : undefined;
      case "tags": return tagsIdx >= 0 ? row["tags"] : undefined;
      case "note": return noteIdx >= 0 ? row["note"] : undefined;
      case "dob": return dobIdx >= 0 ? row["dob"] : undefined;
      case "city": return cityIdx >= 0 ? row["city"] : undefined;
      case "state": return stateIdx >= 0 ? row["state"] : undefined;
      case "zip": return zipIdx >= 0 ? row["zip"] : undefined;
      case "address": return addressIdx >= 0 ? row["address"] : undefined;
      default: return undefined;
    }
  }

  // Stats
  const seenInFile = new Set<string>();
  let inserted = 0;
  let invalids = 0;
  let dbDuplicates = 0;
  let fileDuplicates = 0;
  let skipped = 0;

  const mappedSamples: Array<{
    name?: string; email?: string; phone?: string; tags?: string[]; note?: string;
    dob?: string; city?: string; state?: string; zip?: string; address?: string;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};

    const first = getVal(r, "first");
    const last = getVal(r, "last");
    const nm = getVal(r, "name");
    const email = asEmail(getVal(r, "email"));
    const phone = asPhone(getVal(r, "phone"), "US");
    const name = combineName(nm, first, last);

    const rowTags = (getVal(r, "tags") || "")
      .toString()
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    const note = (getVal(r, "note") || "").toString().trim() || undefined;

    // parsed only for preview/future
    const dob = (getVal(r, "dob") || "").toString().trim() || undefined;
    const city = (getVal(r, "city") || "").toString().trim() || undefined;
    const state = (getVal(r, "state") || "").toString().trim() || undefined;
    const zip = (getVal(r, "zip") || "").toString().trim() || undefined;
    const address = (getVal(r, "address") || "").toString().trim() || undefined;

    if (mappedSamples.length < 10) {
      mappedSamples.push({
        name, email, phone, tags: rowTags.length ? rowTags : undefined, note,
        dob, city, state, zip, address,
      });
    }

    if (!name || (!email && !phone)) {
      invalids++;
      continue;
    }

    const key = email || phone!;
    if (seenInFile.has(key)) {
      fileDuplicates++;
      if (ignoreDuplicates) continue;
    } else {
      seenInFile.add(key);
    }

    try {
      // check DB dupes (per owner)
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

      if (exists) {
        dbDuplicates++;
        continue;
      }

      const lead = await prisma.lead.create({
        data: { name, email, phone, ownerId },
        select: { id: true },
      });

      // merge UI tags + row tags
      const mergedTags = Array.from(new Set([...(requestTags || []), ...rowTags]));
      if (mergedTags.length) {
        await upsertTagsAndLink(ownerId, lead.id, mergedTags);
      }

      // future: attach to workflow chosenWorkflowId (no join table in schema yet)
      // you can enqueue a send-text job here later.

      inserted++;
    } catch (e: any) {
      console.error(`Insert failed at row ${i + 2}:`, e?.message || e);
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
      leads: inserted,            // what actually landed in DB
      duplicates: dbDuplicates,   // already present in DB
      invalids,
      status,
    },
  });

  const emailHits = mappedSamples.filter(s => s.email).length;
  const phoneHits = mappedSamples.filter(s => s.phone).length;
  const confidence = {
    emailDetected: emailHits >= 3,
    phoneDetected: phoneHits >= 3,
    note: `sample emails=${emailHits}, phones=${phoneHits}`,
  };

  return res.json({
    ok: true,
    inserted,
    duplicates: dbDuplicates,
    invalids,
    skipped,
    stats: { totalRows, validRows, fileDuplicates },
    meta: {
      delimiter,
      originalHeaders,
      normalizedHeaders,
      mappingUsed: {
        name:  clientMapping?.name  || (nameIdx  >= 0 ? originalHeaders[nameIdx]  : undefined),
        first: clientMapping?.first || (firstIdx >= 0 ? originalHeaders[firstIdx] : undefined),
        last:  clientMapping?.last  || (lastIdx  >= 0 ? originalHeaders[lastIdx]  : undefined),
        email: clientMapping?.email || (emailIdx >= 0 ? originalHeaders[emailIdx] : undefined),
        phone: clientMapping?.phone || (phoneIdx >= 0 ? originalHeaders[phoneIdx] : undefined),
        tags:  clientMapping?.tags  || (tagsIdx  >= 0 ? originalHeaders[tagsIdx]  : undefined),
        note:  clientMapping?.note  || (noteIdx  >= 0 ? originalHeaders[noteIdx]  : undefined),
        dob:   clientMapping?.dob   || (dobIdx   >= 0 ? originalHeaders[dobIdx]   : undefined),
        city:  clientMapping?.city  || (cityIdx  >= 0 ? originalHeaders[cityIdx]  : undefined),
        state: clientMapping?.state || (stateIdx >= 0 ? originalHeaders[stateIdx] : undefined),
        zip:   clientMapping?.zip   || (zipIdx   >= 0 ? originalHeaders[zipIdx]   : undefined),
        address: clientMapping?.address || (addressIdx >= 0 ? originalHeaders[addressIdx] : undefined),
      },
      sampleMapped: mappedSamples,
      requestTags,
      ignoreDuplicates,
      chosenWorkflowId,
    },
    confidence,
  });
});

export default router;
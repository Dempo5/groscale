// apps/server/src/routes/uploads.ts
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../../prisma";
import { Prisma } from "@prisma/client";

const router = Router();

/** 50 MB; memory is fine for staged imports */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/* ------------------------- header normalization ------------------------- */
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
  "phone #": "phone",
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

  dob: "dob",
  "date of birth": "dob",
  birthday: "dob",

  city: "city",
  state: "state",
  "postal code": "zip",
  zipcode: "zip",
  zip: "zip",
  address: "address",
  "address 1": "address",
  "street": "address",
};

function normalizeHeader(h: string): string {
  const k = (h || "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return HMAP[k] || k;
}

function guessDelimiter(sample: string): "," | ";" | "\t" | "|" {
  const cands = [",", ";", "\t", "|"] as const;
  const lines = sample.split(/\r?\n/).slice(0, 12);
  let best = cands[0], bestScore = -1;
  for (const ch of cands) {
    const counts = lines.map(l => (l.match(new RegExp(`${ch}(?=(?:[^"]*"[^"]*")*[^"]*$)`, "g")) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > bestScore) { bestScore = score; best = ch; }
  }
  return best;
}

/* ----------------------------- value helpers ---------------------------- */
function asEmail(s?: string) {
  const t = (s || "").trim().toLowerCase();
  return t && /\S+@\S+\.\S+/.test(t) ? t : undefined;
}
function asPhone(s?: string, defaultCountry: "US" | "INTL" = "US") {
  let t = (s || "").toString().trim();
  if (!t) return undefined;
  // keep digits and +, fix CSV-in-Excel artifacts
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

/* ------------------------- tag + workflow helpers ----------------------- */
async function upsertTagsAndLink(ownerId: string, leadId: string, names: string[]) {
  if (!names?.length) return;
  for (const raw of names) {
    const nm = raw.trim();
    if (!nm) continue;

    const tag = await prisma.tag.upsert({
      where: { ownerId_name: { ownerId, name: nm } },
      update: {},
      create: { ownerId, name: nm },
      select: { id: true },
    });

    await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId, tagId: tag.id } },
      update: {},
      create: { leadId, tagId: tag.id },
    });
  }
}

/* ------------------------------ import route ---------------------------- */
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  const ownerId = (req as any)?.user?.id || "system";

  // Create upload history row early (PROCESSING)
  const uploadRow = await prisma.upload.create({
    data: {
      ownerId,
      fileName: req.file.originalname || "upload.csv",
      byteSize: req.file.size,
      status: "PROCESSING",
    },
  });

  // Options coming from the wizard
  let clientMapping: Record<string, string> = {};
  let clientOptions: any = {};
  try {
    if (req.body?.mapping) clientMapping = JSON.parse(String(req.body.mapping));
    if (req.body?.options) clientOptions = JSON.parse(String(req.body.options));
  } catch { /* ignore */ }

  const ignoreDuplicates = !!clientOptions?.ignoreDuplicates;
  const workflowId: string | undefined = clientOptions?.workflowId || undefined;
  const requestTags: string[] = Array.isArray(clientOptions?.tags) ? clientOptions.tags : [];

  // Parse CSV
  const text = req.file.buffer.toString("utf8");
  const delimiter = guessDelimiter(text);

  let origHeaders: string[] = [];
  let normHeaders: string[] = [];
  let rows: any[] = [];

  try {
    rows = parse(text, {
      delimiter,
      bom: true,
      trim: true,
      relax_column_count: true,
      skip_empty_lines: true,
      columns: (hdrs: string[]) => {
        origHeaders = hdrs.map(h => String(h).replace(/\uFEFF/g, "").trim());
        normHeaders = origHeaders.map(normalizeHeader);
        return normHeaders;
      },
    });
  } catch (e: any) {
    await prisma.upload.update({
      where: { id: uploadRow.id },
      data: { status: "FAILED", error: e?.message || "Invalid CSV/headers" },
    });
    return res.status(400).json({ ok: false, error: "Invalid CSV/headers", details: e?.message });
  }

  // column lookups
  const idx = (canon: string) => normHeaders.indexOf(canon);

  const iFirst = idx("first");
  const iLast = idx("last");
  const iName = idx("name");
  const iEmail = idx("email");
  const iPhone = idx("phone");
  const iTags = idx("tags");
  const iNote = idx("note");

  const getVal = (row: any, canon: string) => {
    const chosen = (clientMapping?.[canon] || "").toString().trim();
    if (chosen) {
      // client sent original header; map it to normalized key
      const oIndex = origHeaders.findIndex(h => h === chosen);
      const nKey = normHeaders[oIndex];
      return row[nKey];
    }
    switch (canon) {
      case "first": return iFirst >= 0 ? row["first"] : undefined;
      case "last": return iLast >= 0 ? row["last"] : undefined;
      case "name": return iName >= 0 ? row["name"] : undefined;
      case "email": return iEmail >= 0 ? row["email"] : undefined;
      case "phone": return iPhone >= 0 ? row["phone"] : undefined;
      case "tags": return iTags >= 0 ? row["tags"] : undefined;
      case "note": return iNote >= 0 ? row["note"] : undefined;
      default: return undefined;
    }
  };

  // Stats
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

    const rowTags = (getVal(r, "tags") || "")
      .toString()
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    const name = combineName(nm, first, last);
    const note = (getVal(r, "note") || "").toString().trim() || undefined;

    if (sampleMapped.length < 10) {
      sampleMapped.push({ name, email, phone, tags: rowTags.length ? rowTags : undefined, note });
    }

    if (!name || (!email && !phone)) { invalids++; continue; }

    const key = email || phone!;
    if (seenInFile.has(key)) { fileDuplicates++; if (ignoreDuplicates) continue; }
    else seenInFile.add(key);

    try {
      // DB duplicate check
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
        data: { ownerId, name, email, phone },
        select: { id: true },
      });

      // Merge UI + row tags
      const mergedTags = Array.from(new Set([...(requestTags || []), ...rowTags]));
      if (mergedTags.length) await upsertTagsAndLink(ownerId, lead.id, mergedTags);

      // (Optional) enqueue workflow here if you want immediate automation kickoff
      // if (workflowId) await enqueueLeadIntoWorkflow(lead.id, workflowId);

      inserted++;
    } catch (e: any) {
      // Prisma unique error (if you later put unique constraints)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") dbDuplicates++;
      else skipped++;
    }
  }

  const totalRows = rows.length;
  const status =
    inserted > 0 && (invalids > 0 || dbDuplicates > 0) ? "PARTIAL" :
    inserted > 0 ? "SUCCESS" : "FAILED";

  await prisma.upload.update({
    where: { id: uploadRow.id },
    data: {
      leads: inserted,              // honest: how many got in
      duplicates: dbDuplicates,     // “already existed in DB”
      invalids,
      status,
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
    stats: { totalRows, fileDuplicates },
    meta: {
      delimiter,
      mappingUsed: {
        name:  clientMapping?.name  || (iName  >= 0 ? origHeaders[iName]  : undefined),
        first: clientMapping?.first || (iFirst >= 0 ? origHeaders[iFirst] : undefined),
        last:  clientMapping?.last  || (iLast  >= 0 ? origHeaders[iLast]  : undefined),
        email: clientMapping?.email || (iEmail >= 0 ? origHeaders[iEmail] : undefined),
        phone: clientMapping?.phone || (iPhone >= 0 ? origHeaders[iPhone] : undefined),
        tags:  clientMapping?.tags  || (iTags  >= 0 ? origHeaders[iTags]  : undefined),
        note:  clientMapping?.note  || (iNote  >= 0 ? origHeaders[iNote]  : undefined),
      },
      sampleMapped,
      requestTags,
      workflowId,
      ignoreDuplicates,
    },
    confidence: {
      emailDetected: emailHits >= 3,
      phoneDetected: phoneHits >= 3,
    },
  });
});

export default router;
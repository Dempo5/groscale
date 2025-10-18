// apps/server/src/routes/uploads.ts
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { prisma } from "../../prisma";
import type { Prisma } from "@prisma/client";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// -------- Header normalization (rich) --------
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
  "phone #": "phone",
  "phone number": "phone",
  mobile: "phone",
  cell: "phone",
  "cell phone": "phone",
  telephone: "phone",
  primaryphc: "phone",
  phone2: "phone",
  "primary phone": "phone",

  // extras
  dob: "dob",
  "date of birth": "dob",
  "birth date": "dob",
  birthdate: "dob",
  "d.o.b": "dob",

  city: "city",
  state: "state",

  zip: "zip",
  zipcode: "zip",
  "zip code": "zip",
  postal: "zip",
  "postal code": "zip",

  address: "address",
  addr: "address",
  "street address": "address",

  "date added": "dateAdded",
  "created at": "dateAdded",
  created: "dateAdded",

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

// ---- tags helper
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

// --------- Main import endpoint ---------
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "file required" });

  const ownerId = (req as any)?.user?.id || "system";

  const uploadRow = await prisma.upload.create({
    data: {
      ownerId,
      fileName: req.file.originalname || "upload.csv",
      byteSize: req.file.size,
      status: "PROCESSING",
    },
  });

  // mapping + options from client (wizard)
  let clientMapping: any = {};
  let clientOptions: any = {};
  try {
    if (req.body?.mapping) clientMapping = JSON.parse(String(req.body.mapping));
    if (req.body?.options) clientOptions = JSON.parse(String(req.body.options));
  } catch {
    // ignore malformed
  }
  const ignoreDuplicates = !!clientOptions?.ignoreDuplicates;
  const requestTags: string[] = Array.isArray(clientOptions?.tags) ? clientOptions.tags : [];
  const workflowId: string | undefined = clientOptions?.workflowId || undefined;

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

  // indexes
  const idx = (key: string) => normalizedHeaders.indexOf(key);
  const firstIdx = idx("first"), lastIdx = idx("last"), nameIdx = idx("name");
  const emailIdx = idx("email"), phoneIdx = idx("phone");
  const dobIdx = idx("dob"), cityIdx = idx("city"), stateIdx = idx("state"), zipIdx = idx("zip"), addressIdx = idx("address");
  const tagsIdx = idx("tags"), noteIdx = idx("note"), dateAddedIdx = idx("dateAdded");

  const getVal = (row: any, canonical: string) => {
    const chosen = (clientMapping?.[canonical] || "").toString().trim();
    if (chosen) return row[normalizeHeader(chosen)];
    switch (canonical) {
      case "first": return firstIdx >= 0 ? row["first"] : undefined;
      case "last": return lastIdx >= 0 ? row["last"] : undefined;
      case "name": return nameIdx >= 0 ? row["name"] : undefined;
      case "email": return emailIdx >= 0 ? row["email"] : undefined;
      case "phone": return phoneIdx >= 0 ? row["phone"] : undefined;
      case "dob": return dobIdx >= 0 ? row["dob"] : undefined;
      case "city": return cityIdx >= 0 ? row["city"] : undefined;
      case "state": return stateIdx >= 0 ? row["state"] : undefined;
      case "zip": return zipIdx >= 0 ? row["zip"] : undefined;
      case "address": return addressIdx >= 0 ? row["address"] : undefined;
      case "tags": return tagsIdx >= 0 ? row["tags"] : undefined;
      case "note": return noteIdx >= 0 ? row["note"] : undefined;
      case "dateAdded": return dateAddedIdx >= 0 ? row["dateAdded"] : undefined;
    }
  };

  let inserted = 0, invalids = 0, fileDuplicates = 0, dbDuplicates = 0, skipped = 0;
  const seenInFile = new Set<string>();
  const mappedSamples: Array<Record<string, any>> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};

    const first = getVal(r, "first");
    const last = getVal(r, "last");
    const nm = getVal(r, "name");
    const email = asEmail(getVal(r, "email"));
    const phone = asPhone(getVal(r, "phone"), "US");

    const name = combineName(nm, first, last);

    const perRowTags = (getVal(r, "tags") || "")
      .toString()
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    const extras: Record<string, string> = {};
    const addExtra = (k: string) => {
      const v = (getVal(r, k) || "").toString().trim();
      if (v) extras[k] = v;
    };
    addExtra("dob");
    addExtra("city");
    addExtra("state");
    addExtra("zip");
    addExtra("address");
    addExtra("dateAdded");

    const rawNote = (getVal(r, "note") || "").toString().trim();
    const extrasLine = Object.keys(extras).length
      ? " | " + Object.entries(extras).map(([k, v]) => `${k}:${v}`).join(" · ")
      : "";
    const note = (rawNote || "") + extrasLine;

    if (mappedSamples.length < 10) {
      mappedSamples.push({ name, email, phone, ...extras, tags: perRowTags, note: rawNote || undefined });
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
        data: { ownerId, name, email, phone },
        select: { id: true },
      });

      const mergedTags = Array.from(new Set([...(requestTags || []), ...perRowTags]));
      if (mergedTags.length) await upsertTagsAndLink(ownerId, lead.id, mergedTags);

      // if you later add Lead.meta Json? to schema, store `extras` there.
      if (note) {
        await prisma.messageThread.create({
          // Create a “system note” thread just so notes aren’t lost (optional).
          data: {
            ownerId,
            leadId: lead.id,
            lastMessageAt: new Date(),
            messages: {
              create: [{
                direction: "OUTBOUND",
                body: `NOTE: ${note}`,
                status: "SENT",
              }],
            },
          },
        }).catch(() => void 0);
      }

      // If you later model workflow enrollment, use `workflowId` here.
      // For now we simply ignore it rather than faking counts.

      inserted++;
    } catch (e: any) {
      const code = (e as Prisma.PrismaClientKnownRequestError)?.code || "";
      if (code === "P2002") dbDuplicates++;
      else skipped++;
    }
  }

  const totalRows = rows.length;
  const validRows = totalRows - invalids;
  const status = inserted > 0 && (invalids > 0 || dbDuplicates > 0) ? "PARTIAL"
               : inserted > 0 ? "SUCCESS" : "FAILED";

  await prisma.upload.update({
    where: { id: uploadRow.id },
    data: {
      leads: inserted,          // actual inserted count
      duplicates: dbDuplicates, // “already uploaded”
      invalids,
      status,
    },
  });

  const emailHits = mappedSamples.filter(s => s.email).length;
  const phoneHits = mappedSamples.filter(s => s.phone).length;

  return res.json({
    ok: true,
    inserted,
    duplicates: dbDuplicates,
    invalids,
    skipped,
    stats: { totalRows, validRows, fileDuplicates },
    meta: {
      delimiter,
      mappingUsed: clientMapping,
      sampleMapped: mappedSamples,
      requestTags,
      ignoreDuplicates,
      workflowId,
    },
    confidence: {
      emailDetected: emailHits >= 3,
      phoneDetected: phoneHits >= 3,
      note: `sample emails=${emailHits}, phones=${phoneHits}`,
    },
  });
});

export default router;

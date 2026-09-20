// apps/server/src/routes/uploads.ts
import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/* ---------------- header canon + utils ---------------- */

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
  mail: "email",

  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  cell: "phone",
  telephone: "phone",
  tel: "phone",
  "primary ph": "phone",
  "primary phone": "phone",
  ph: "phone",
  phone2: "phone",

  tags: "tags",
  label: "tags",
  labels: "tags",
  segments: "tags",
  groups: "tags",
  lists: "tags",

  note: "note",
  notes: "note",
  comment: "note",
  comments: "note",
  memo: "note",

  city: "city",
  town: "city",

  state: "state",
  province: "state",
  region: "state",

  zip: "zip",
  zipcode: "zip",
  "postal code": "zip",
  "post code": "zip",

  address: "address",
  addr: "address",
  "street address": "address",
  street: "address",
  line1: "address",

  dob: "dob",
  "date of birth": "dob",
  birthdate: "dob",
  birthday: "dob",

  household: "household",
  "household size": "household",
  "hh size": "household",
  "family size": "household",

  income: "income",
  "annual income": "income",
  "household income": "income",
  "yearly income": "income",
};

const norm = (s?: string) =>
  (s || "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const nHeader = (s: string) => H[norm(s)] || s.trim();

const guessDelim = (txt: string) =>
  ([",", ";", "\t", "|"] as const).reduce(
    (best, ch) => {
      const rows = txt.split(/\r?\n/).slice(0, 6);

      const counts = rows.map(
        (r) =>
          (r.match(new RegExp(`\\${ch}`, "g")) || []).length
      );

      const avg =
        counts.reduce((a, b) => a + b, 0) /
        (counts.length || 1);

      const variance =
        counts.reduce(
          (a, b) => a + (b - avg) ** 2,
          0
        ) / (counts.length || 1);

      const score = avg - Math.sqrt(variance);

      return score > best.score
        ? { ch, score }
        : best;
    },
    { ch: ",", score: -1 as number }
  ).ch;

const asEmail = (v?: any) => {
  const t = String(v ?? "")
    .trim()
    .toLowerCase();

  return /\S+@\S+\.\S+/.test(t)
    ? t
    : undefined;
};

// Normalizes US and international numbers to +E.164 when possible
const asPhone = (v?: any) => {
  let t = String(v ?? "").replace(/[^\d+]/g, "");

  if (!t) return undefined;

  if (!t.startsWith("+")) {
    const digits = t.replace(/\D/g, "");

    if (
      digits.length === 11 &&
      digits.startsWith("1")
    ) {
      t = "+1" + digits.slice(1);
    } else if (digits.length === 10) {
      t = "+1" + digits;
    } else if (/^\d{7,15}$/.test(digits)) {
      t = "+" + digits;
    }
  }

  return /^\+\d{7,15}$/.test(t)
    ? t
    : undefined;
};

const fullName = (
  name?: string,
  first?: string,
  last?: string
) => {
  const n = (
    name?.trim() ||
    [first, last]
      .filter(Boolean)
      .join(" ")
      .trim()
  ).replace(/\s+/g, " ");

  return n || undefined;
};

function safeJSON<T = any>(v: any): T | undefined {
  try {
    return v
      ? JSON.parse(String(v))
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Break large operations into chunks so we don't create
 * enormous SQL statements.
 */
function chunk<T>(
  items: T[],
  size = 1000
): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

type PreparedLead = {
  id: string;
  ownerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  rowNumber: number;
  note: string | null;
  dob: string | null;
  householdSize: number | null;
  income: number | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

// "" -> null, trimmed and length-capped
const cell = (v: unknown, max: number) => {
  const t = String(v ?? "").trim();
  return t ? t.slice(0, max) : null;
};
// "$52,000" -> 52000; anything unparseable -> null
const wholeNumber = (v: unknown, max: number) => {
  const n = Math.round(Number(String(v ?? "").replace(/[$,\s]/g, "")));
  return String(v ?? "").trim() && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/* ---------------- batch duplicate lookup ---------------- */

async function findExistingContacts(
  ownerId: string,
  leads: PreparedLead[]
) {
  const existingEmails = new Set<string>();
  const existingPhones = new Set<string>();

  for (const group of chunk(leads, 500)) {
    const emails = Array.from(
      new Set(
        group
          .map((lead) => lead.email)
          .filter((v): v is string => !!v)
      )
    );

    const phones = Array.from(
      new Set(
        group
          .map((lead) => lead.phone)
          .filter((v): v is string => !!v)
      )
    );

    const OR: any[] = [];

    if (emails.length) {
      OR.push({
        email: {
          in: emails,
        },
      });
    }

    if (phones.length) {
      OR.push({
        phone: {
          in: phones,
        },
      });
    }

    if (!OR.length) continue;

    const existing = await prisma.lead.findMany({
      where: {
        ownerId,
        OR,
      },
      select: {
        email: true,
        phone: true,
      },
    });

    for (const lead of existing) {
      if (lead.email) {
        existingEmails.add(
          lead.email.toLowerCase()
        );
      }

      if (lead.phone) {
        existingPhones.add(lead.phone);
      }
    }
  }

  return {
    existingEmails,
    existingPhones,
  };
}

/* ---------------- batch tag handling ---------------- */

async function attachTags(
  ownerId: string,
  leads: PreparedLead[]
) {
  const tagNames = Array.from(
    new Set(
      leads.flatMap((lead) => lead.tags)
    )
  );

  if (!tagNames.length) {
    return;
  }

  /*
   * Get tags that already exist.
   */
  const existingTags: {
    id: string;
    name: string;
  }[] = [];

  for (const names of chunk(tagNames, 500)) {
    const found = await prisma.tag.findMany({
      where: {
        ownerId,
        name: {
          in: names,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    existingTags.push(...found);
  }

  const existingNames = new Set(
    existingTags.map((tag) => tag.name)
  );

  /*
   * Create all missing tags in batches.
   *
   * ownerId + name is unique in Prisma, so
   * skipDuplicates protects against races.
   */
  const missingTagNames = tagNames.filter(
    (name) => !existingNames.has(name)
  );

  for (const names of chunk(missingTagNames, 500)) {
    await prisma.tag.createMany({
      data: names.map((name) => ({
        ownerId,
        name,
      })),
      skipDuplicates: true,
    });
  }

  /*
   * Fetch the final tag IDs after creation.
   */
  const allTags: {
    id: string;
    name: string;
  }[] = [];

  for (const names of chunk(tagNames, 500)) {
    const found = await prisma.tag.findMany({
      where: {
        ownerId,
        name: {
          in: names,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    allTags.push(...found);
  }

  const tagIdByName = new Map(
    allTags.map((tag) => [
      tag.name,
      tag.id,
    ])
  );

  /*
   * Build every lead ↔ tag relationship in memory.
   */
  const relations: {
    leadId: string;
    tagId: string;
  }[] = [];

  for (const lead of leads) {
    for (const tagName of lead.tags) {
      const tagId = tagIdByName.get(tagName);

      if (!tagId) continue;

      relations.push({
        leadId: lead.id,
        tagId,
      });
    }
  }

  /*
   * Insert relationships in batches instead of
   * one query per lead/tag.
   */
  for (const group of chunk(relations, 1000)) {
    await prisma.leadTag.createMany({
      data: group,
      skipDuplicates: true,
    });
  }
}

/* ---------------- route ---------------- */

router.post(
  "/import",
  requireAuth,
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "file required",
      });
    }

    const ownerId = req.userId!;

    const options =
      (safeJSON(req.body?.options) as
        | {
            ignoreDuplicates?: boolean;
            consent?: boolean;
            tags?: string[];
            workflowId?: string;
          }
        | undefined) || {};

    const mapping =
      (safeJSON(req.body?.mapping) as
        | Partial<
            Record<
              | "name"
              | "first"
              | "last"
              | "email"
              | "phone"
              | "tags"
              | "note"
              | "dob"
              | "household"
              | "income"
              | "address"
              | "city"
              | "state"
              | "zip",
              string
            >
          >
        | undefined) || {};

    const text =
      req.file.buffer.toString("utf8");

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
          (original = hdr.map((h) =>
            String(h)
              .replace(/\uFEFF/g, "")
              .trim()
          )),
          original.map(nHeader)
        ),
      });
    } catch (e: any) {
      return res.status(400).json({
        ok: false,
        error: "Invalid CSV",
        details: e?.message,
      });
    }

    const canon = original.map(nHeader);

    /*
     * Build index map.
     * Prefer explicit frontend mapping when provided.
     */
    const mIndex: Record<string, number> = {};

    for (const k of [
      "name",
      "first",
      "last",
      "email",
      "phone",
      "tags",
      "note",
      "dob",
      "household",
      "income",
      "address",
      "city",
      "state",
      "zip",
    ] as const) {
      const explicit = mapping?.[k];

      mIndex[k] =
        explicit &&
        original.includes(explicit)
          ? original.indexOf(explicit)
          : canon.indexOf(k);
    }

    /*
     * Prefer raw header by index;
     * otherwise use canonical key.
     */
    const pick = (
      r: any,
      k: keyof typeof mIndex
    ) =>
      mIndex[k] >= 0
        ? r[canon[mIndex[k]]] ?? r[k]
        : r[k];

    let inserted = 0;
    let invalids = 0;
    let skipped = 0;
    let fileDup = 0;
    let dbDup = 0;

    // Rows we didn't import, with the reason, so the user can fix and retry.
    const SKIPPED_CAP = 2000;
    type SkippedRow = { row: number; name: string; phone: string; email: string; reason: string };
    const skippedRows: SkippedRow[] = [];
    let skippedTruncated = false;

    const noteSkipped = (row: SkippedRow) => {
      if (skippedRows.length < SKIPPED_CAP) skippedRows.push(row);
      else skippedTruncated = true;
    };

    const seen = new Set<string>();

    /*
     * STEP 1:
     * Parse and validate the entire CSV in memory.
     *
     * NO DATABASE CALLS inside this loop.
     */
    const prepared: PreparedLead[] = [];

    for (const [index, r] of rows.entries()) {
      const rowNumber = index + 2; // +1 for the header, +1 for 1-based rows
      let nm = fullName(
        pick(r, "name"),
        pick(r, "first"),
        pick(r, "last")
      );

      const email = asEmail(
        pick(r, "email")
      );

      const phone = asPhone(
        pick(r, "phone")
      );

      // Require at least one contact path
      if (!email && !phone) {
        invalids++;
        noteSkipped({
          row: rowNumber,
          name: nm || "",
          phone: String(pick(r, "phone") ?? ""),
          email: String(pick(r, "email") ?? ""),
          reason: pick(r, "phone") || pick(r, "email")
            ? "Phone number and email are not valid"
            : "No phone number or email",
        });
        continue;
      }

      if (!nm) {
        nm =
          email?.split("@")[0] ||
          (phone
            ? `Lead ${phone.slice(-4)}`
            : undefined);
      }

      /*
       * Preserve the original importer behavior:
       * prefer email as the file duplicate key,
       * otherwise use phone.
       */
      const key = email || (phone as string);

      if (seen.has(key)) {
        fileDup++;
        noteSkipped({
          row: rowNumber,
          name: nm || "",
          phone: phone || "",
          email: email || "",
          reason: "Duplicate row inside this file",
        });

        if (options.ignoreDuplicates) {
          skipped++;
          continue;
        }
      }

      seen.add(key);

      const rowTags = String(
        pick(r, "tags") || ""
      )
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const allTags = Array.from(
        new Set([
          ...(options.tags || [])
            .map((t) => String(t).trim())
            .filter(Boolean),

          ...rowTags,
        ])
      );

      prepared.push({
        id: randomUUID(),
        ownerId,
        name: nm!,
        email: email || null,
        phone: phone || null,
        tags: allTags,
        rowNumber,
        note: cell(pick(r, "note"), 5000),
        dob: cell(pick(r, "dob"), 20),
        householdSize: wholeNumber(pick(r, "household"), 30),
        income: wholeNumber(pick(r, "income"), 10_000_000),
        address: cell(pick(r, "address"), 200),
        city: cell(pick(r, "city"), 100),
        state: cell(pick(r, "state"), 40),
        zip: cell(pick(r, "zip"), 15),
      });
    }

    /*
     * STEP 2:
     * Find ALL database duplicates in batches.
     *
     * Previously this happened once for every row.
     */
    const {
      existingEmails,
      existingPhones,
    } = await findExistingContacts(
      ownerId,
      prepared
    );

    /*
     * Also prevent duplicates inside this same import batch.
     *
     * This recreates what the old sequential DB lookup
     * effectively did after inserting an earlier row.
     */
    const acceptedEmails = new Set<string>();
    const acceptedPhones = new Set<string>();

    const newLeads: PreparedLead[] = [];

    for (const lead of prepared) {
      const emailExists =
        !!lead.email &&
        (
          existingEmails.has(
            lead.email.toLowerCase()
          ) ||
          acceptedEmails.has(
            lead.email.toLowerCase()
          )
        );

      const phoneExists =
        !!lead.phone &&
        (
          existingPhones.has(lead.phone) ||
          acceptedPhones.has(lead.phone)
        );

      if (emailExists || phoneExists) {
        dbDup++;
        noteSkipped({
          row: lead.rowNumber,
          name: lead.name,
          phone: lead.phone || "",
          email: lead.email || "",
          reason: "Already in GroScales",
        });
        continue;
      }

      newLeads.push(lead);

      if (lead.email) {
        acceptedEmails.add(
          lead.email.toLowerCase()
        );
      }

      if (lead.phone) {
        acceptedPhones.add(lead.phone);
      }
    }

    /*
     * STEP 3:
     * Insert leads in batches.
     *
     * No longer one prisma.lead.create() per CSV row.
     */
    for (const group of chunk(newLeads, 1000)) {
      const result =
        await prisma.lead.createMany({
          data: group.map((lead) => ({
            id: lead.id,
            ownerId: lead.ownerId,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            dob: lead.dob,
            householdSize: lead.householdSize,
            income: lead.income,
            address: lead.address,
            city: lead.city,
            state: lead.state,
            zip: lead.zip,
          })),
        });

      inserted += result.count;
    }

    // A "notes" column becomes a real note on each new lead.
    const withNotes = newLeads.filter((l) => l.note);
    for (const group of chunk(withNotes, 1000)) {
      await prisma.note.createMany({
        data: group.map((l) => ({ leadId: l.id, authorId: ownerId, body: l.note! })),
      });
    }

    /*
     * STEP 4:
     * Batch-create tags and LeadTag relationships.
     */
    if (newLeads.length) {
      await attachTags(
        ownerId,
        newLeads
      );
    }

    const record = await prisma.upload.create({
      data: {
        ownerId,
        fileName: req.file.originalname || "upload.csv",
        byteSize: req.file.size ?? 0,
        leads: inserted,
        duplicates: dbDup,
        fileDuplicates: fileDup,
        invalids,
        consent: options.consent === true,
        skipped: skippedRows as any,
        skippedTruncated,
        status: skippedRows.length ? "PARTIAL" : "SUCCESS",
      },
      select: { id: true, createdAt: true },
    });

    return res.json({
      ok: true,
      uploadId: record.id,
      createdAt: record.createdAt,
      inserted,
      duplicates: dbDup,
      invalids,
      skipped,

      stats: {
        totalRows: rows.length,
        fileDuplicates: fileDup,
      },

      meta: {
        delimiter: d,
        mappingUsed: mapping,
        workflowId: options.workflowId,
        tags: options.tags || [],
      },
    });
  }
);

/** GET /api/uploads — recent uploads for this user */
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rows = await prisma.upload.findMany({
      where: { ownerId: req.userId! },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        fileName: true,
        leads: true,
        duplicates: true,
        fileDuplicates: true,
        invalids: true,
        status: true,
        error: true,
        skippedTruncated: true,
        createdAt: true,
      },
    });
    res.json({ ok: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

/** GET /api/uploads/:id/skipped — the skipped rows as a CSV download */
router.get("/:id/skipped", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const row = await prisma.upload.findFirst({
      where: { id: req.params.id, ownerId: req.userId! },
      select: { fileName: true, skipped: true },
    });
    if (!row) return res.status(404).json({ ok: false, error: "Upload not found" });

    const skipped = (row.skipped as any as Array<Record<string, string | number>>) || [];
    // wrap every value in quotes so commas inside names don't break the file
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      ["row", "name", "phone", "email", "reason"].join(","),
      ...skipped.map((r) => [r.row, r.name, r.phone, r.email, r.reason].map(esc).join(",")),
    ].join("\r\n");

    const base = String(row.fileName || "upload").replace(/\.csv$/i, "").replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${base}-skipped.csv"`);
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || "failed" });
  }
});

export default router;

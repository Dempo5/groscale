// Ultra-import route: parse CSV/JSON, auto map, upsert, tag, attach workflow id (if any)
import { Router } from "express";
import multer from "multer";
import { parse as csvParse } from "csv-parse/sync";
import { prisma } from "../../prisma";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// canonical header map
const H: Record<string, string> = {
  firstname: "first", "first name": "first", first: "first",
  lastname: "last",  "last name": "last",  last: "last",

  name: "name", "full name": "name", fullname: "name", "contact name": "name",

  email: "email", "e-mail": "email", "email address": "email", mail: "email",

  phone: "phone", "phone number": "phone", mobile: "phone", cell: "phone",
  telephone: "phone", tel: "phone", "primary ph": "phone", "primary phone": "phone",
  ph: "phone", phone2: "phone",

  tags: "tags", label: "tags", labels: "tags", segments: "tags", groups: "tags", lists: "tags",

  note: "note", notes: "note", comment: "note", comments: "note", memo: "note",

  dob: "dob", "date of birth": "dob",

  city: "city", town: "city",
  state: "state", province: "state", region: "state",
  zip: "zip", zipcode: "zip", "postal code": "zip", "post code": "zip",
  address: "address", addr: "address", "street address": "address", street: "address", line1: "address",
};

const norm = (s?: string) =>
  (s || "").replace(/\uFEFF/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const nHeader = (s: string) => H[norm(s)] || norm(s);

const detectDelim = (txt: string) =>
  ([",",";","\t","|"] as const).reduce((best, c) => {
    const rows = txt.split(/\r?\n/).slice(0, 6);
    const cnts = rows.map(r => (r.match(new RegExp(`\\${c}`, "g")) || []).length);
    const avg = cnts.reduce((a,b)=>a+b,0)/(cnts.length||1);
    const varc = cnts.reduce((a,b)=>a+(b-avg)**2,0)/(cnts.length||1);
    const score = avg - Math.sqrt(varc);
    return score > best.score ? { ch:c, score } : best;
  }, { ch:",", score:-1 as number }).ch;

const asEmail = (v?: any) => {
  const t = String(v ?? "").trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(t) ? t : undefined;
};
const asPhone = (v?: any) => {
  let t = String(v ?? "").replace(/[^\d+]/g, "");
  if (!t) return;
  if (!t.startsWith("+") && /^\d{10}$/.test(t)) t = "+1" + t;
  return /^\+?\d{7,15}$/.test(t) ? t : undefined;
};
const asStr = (v?: any) => {
  const t = String(v ?? "").trim();
  return t ? t : undefined;
};
const asDate = (v?: any) => {
  const t = String(v ?? "").trim();
  if (!t) return undefined;
  const d = new Date(t);
  return isNaN(d.getTime()) ? undefined : d;
};

const fullName = (name?: string, first?: string, last?: string) =>
  (name?.trim()) || [first, last].filter(Boolean).join(" ").trim() || undefined;

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

function parseCsvToRows(text: string) {
  const delimiter = detectDelim(text);
  let original: string[] = [];
  const rows = csvParse(text, {
    delimiter, bom:true, trim:true, relax_column_count:true,
    columns: (hdr: string[]) => (
      original = hdr.map(h => String(h).replace(/\uFEFF/g,"").trim()),
      original.map(nHeader)
    ),
  }) as any[];
  return { rows, original, delimiter };
}

function parseJsonToRows(text: string) {
  const data = JSON.parse(text);
  const arr: any[] = Array.isArray(data) ? data : [data];
  if (!arr.length || typeof arr[0] !== "object") throw new Error("JSON must be an array of objects");
  const original = Object.keys(arr[0]);
  const canonKeys = original.map(nHeader);
  const rows = arr.map(obj => {
    const out: any = {};
    original.forEach((key, i) => {
      const canon = canonKeys[i];
      out[canon || key] = (obj as any)[key];
    });
    return out;
  });
  return { rows, original, delimiter: "json" };
}

router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok:false, error:"file required" });

  const ownerId = (req as any)?.user?.id ?? "system";
  const options = safeJSON(req.body?.options) as { ignoreDuplicates?:boolean; tags?:string[]; workflowId?:string } || {};
  const mapping = safeJSON(req.body?.mapping) as Partial<Record<
    "name"|"first"|"last"|"email"|"phone"|"tags"|"note"|"city"|"state"|"zip"|"address"|"dob", string
  >> || {};

  const text = req.file.buffer.toString("utf8");

  let rows: any[] = [];
  let original: string[] = [];
  let delimiter = ",";

  try {
    const looksJson = req.file.mimetype.includes("json") || text.trim().startsWith("[") || text.trim().startsWith("{");
    if (looksJson) {
      const r = parseJsonToRows(text);
      rows = r.rows; original = r.original; delimiter = r.delimiter;
    } else {
      const r = parseCsvToRows(text);
      rows = r.rows; original = r.original; delimiter = r.delimiter;
    }
  } catch (e:any) {
    return res.status(400).json({ ok:false, error:"Invalid file", details: e?.message });
  }

  const originalCanon = original.map(nHeader);
  const KEYS = ["name","first","last","email","phone","tags","note","city","state","zip","address","dob"] as const;

  const ix = Object.fromEntries(
    KEYS.map(k => [k, mapping[k] ? original.indexOf(mapping[k]!) : -1])
  ) as Record<typeof KEYS[number], number>;

  const hasCanon = (canon: string) => originalCanon.indexOf(canon);
  const pick = (r:any, canon: typeof KEYS[number]) => {
    const i = ix[canon];
    if (i >= 0) return r[original[i]];
    const j = hasCanon(canon);
    return j >= 0 ? r[canon] : undefined;
  };

  let inserted=0, invalids=0, fileDup=0, dbDup=0;
  const seen = new Set<string>();

  for (const r of rows) {
    const nm    = fullName(pick(r,"name"), pick(r,"first"), pick(r,"last"));
    const email = asEmail(pick(r,"email"));
    const phone = asPhone(pick(r,"phone"));

    if (!nm || (!email && !phone)) { invalids++; continue; }

    const key = email || phone!;
    if (seen.has(key)) { fileDup++; if (options.ignoreDuplicates) continue; }
    seen.add(key);

    const exists = await prisma.lead.findFirst({
      where: { ownerId, OR: [ ...(email?[{email}]:[]), ...(phone?[{phone}]:[]) ] },
      select:{ id:true }
    });
    if (exists) { dbDup++; continue; }

    const data: any = { ownerId, name: nm, email, phone };

    const city     = asStr(pick(r,"city"));
    const state    = asStr(pick(r,"state"));
    const zip      = asStr(pick(r,"zip"));
    const address  = asStr(pick(r,"address"));
    const dob      = asDate(pick(r,"dob"));

    if (city)    data.city = city;
    if (state)   data.state = state;
    if (zip)     data.zip = zip;
    if (address) data.address = address;
    if (dob)     data.dob = dob;

    const lead = await prisma.lead.create({ data, select:{ id:true } });

    const rowTags = String(pick(r,"tags")||"").split(",").map(t=>t.trim()).filter(Boolean);
    const allTags = Array.from(new Set([...(options.tags||[]), ...rowTags]));
    if (allTags.length) await upsertTags(ownerId, lead.id, allTags);

    if (options.workflowId) {
      await prisma.workflowStep.create({
        data: { workflowId: options.workflowId, order: 0, type: "WAIT", textBody: null, waitMs: 0 }
      }).catch(()=>{});
    }
    inserted++;
  }

  return res.json({
    ok:true,
    inserted,
    duplicates: dbDup,
    invalids,
    skipped: 0,
    stats: { totalRows: rows.length, fileDuplicates: fileDup },
    meta: { delimiter, mappingUsed: mapping, workflowId: options.workflowId, tags: options.tags || [] }
  });
});

function safeJSON(v:any){ try { return v ? JSON.parse(String(v)) : undefined; } catch { return undefined; } }

export default router;

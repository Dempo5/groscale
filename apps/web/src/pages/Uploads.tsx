// apps/web/src/pages/Uploads.tsx
// Upload leads in three steps: pick a file → match columns → see results.
// Column auto-matching logic carried over from the previous version.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listWorkflows, uploadLeadsMapped, type CsvMapping } from "../lib/api";
import "./uploads.css";

/* ---------------- column matching (from the old page) ---------------- */
type Field =
  | "phone" | "first" | "last" | "name" | "email" | "dob"
  | "zip" | "city" | "state" | "address" | "tags" | "note";

const SYN: Record<Field, string[]> = {
  name: ["name", "full name", "contact name"],
  first: ["first", "first name", "firstname", "given", "fname"],
  last: ["last", "last name", "lastname", "surname", "lname", "family"],
  email: ["email", "e-mail", "email address", "mail"],
  phone: ["phone", "phone number", "mobile", "cell", "tel", "telephone", "primary ph", "primary phone", "ph", "phone2"],
  tags: ["tags", "label", "labels", "segments", "groups", "lists"],
  note: ["note", "notes", "comment", "comments", "memo"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  zip: ["zip", "zipcode", "postal", "postal code", "post code"],
  address: ["address", "street", "street address", "addr", "line1"],
  dob: ["dob", "date of birth", "birthdate", "birthday"],
};

const FIELD_LABEL: Record<Field, string> = {
  phone: "Phone",
  first: "First name",
  last: "Last name",
  name: "Full name",
  email: "Email",
  dob: "Date of birth",
  zip: "ZIP",
  city: "City",
  state: "State",
  address: "Address",
  tags: "Tags column",
  note: "Notes column",
};

const MAIN_FIELDS: Field[] = ["phone", "first", "last", "email", "dob", "zip"];
const MORE_FIELDS: Field[] = ["name", "city", "state", "address", "tags", "note"];

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function scoreHeader(h: string, candidate: string): number {
  const hk = normKey(h);
  const ck = normKey(candidate);
  if (!hk || !ck) return 0;
  if (hk === ck) return 100;
  if (hk.includes(ck)) return 80 - Math.abs(hk.length - ck.length);
  return 0;
}

function guessFor(field: Field, headers: string[]): string {
  let best = { h: "", s: 0 };
  for (const h of headers)
    for (const c of [field, ...SYN[field]]) {
      const s = scoreHeader(h, c);
      if (s > best.s) best = { h, s };
    }
  return best.s >= 50 ? best.h : "";
}

/* ---------------- CSV reading ---------------- */
function guessDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).slice(0, 6);
  let best = { ch: ",", score: -Infinity };
  for (const ch of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => l.split(ch).length - 1);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const variance = counts.reduce((a, b) => a + (b - avg) ** 2, 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > best.score) best = { ch, score };
  }
  return best.ch;
}

// Handles quoted values like "Orlando, FL" and "" escapes.
function parseCsv(text: string, delim: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (rows.length < maxRows && (cell || row.length)) {
    row.push(cell);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  return rows.map((r) => r.map((v) => v.replace(/\uFEFF/g, "").trim()));
}

function countRows(text: string): number {
  // rough count for display; the server does the real parsing
  return Math.max(0, text.split(/\r?\n/).filter((l) => l.trim()).length - 1);
}

/* ---------------- history (kept in this browser until the backend stores it) ---------------- */
type HistoryItem = {
  id: string;
  file: string;
  at: string;
  added: number;
  dbDuplicates: number;
  fileDuplicates: number;
  invalid: number;
  failed?: string;
};

const HISTORY_KEY = "gs_upload_history";

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {}
}

const fmt = (n: number) => n.toLocaleString();

function relDate(iso: string) {
  const d = new Date(iso);
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function skippedOf(h: HistoryItem) {
  return h.dbDuplicates + h.fileDuplicates + h.invalid;
}

function summaryLine(h: HistoryItem) {
  const parts = [`${fmt(h.added)} added`];
  const dups = h.dbDuplicates + h.fileDuplicates;
  if (dups) parts.push(`${fmt(dups)} duplicate${dups === 1 ? "" : "s"}`);
  if (h.invalid) parts.push(`${fmt(h.invalid)} missing a phone or email`);
  return parts.join(" · ");
}

function reasonList(h: HistoryItem) {
  const out: { n: number; label: string; fixable: boolean }[] = [];
  if (h.dbDuplicates) out.push({ n: h.dbDuplicates, label: "Duplicates already in GroScales, so no copies were created", fixable: false });
  if (h.fileDuplicates) out.push({ n: h.fileDuplicates, label: "Duplicates within this file", fixable: false });
  if (h.invalid) out.push({ n: h.invalid, label: "Missing a valid phone number and email", fixable: true });
  return out;
}

/* ---------------- icons ---------------- */
const Icon = ({ d, size = 16, w = 1.8 }: { d: string; size?: number; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const I = {
  upload: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  check: "M20 6L9 17l-5-5",
  down: "M6 9l6 6 6-6",
  up: "M18 15l-6-6-6 6",
  x: "M6 6l12 12M18 6L6 18",
};

function Reasons({ items }: { items: { n: number; label: string; fixable: boolean }[] }) {
  return (
    <ul className="up-reasons">
      {items.map((r) => (
        <li key={r.label}>
          <span className={`up-dot ${r.fixable ? "is-bad" : ""}`} />
          <strong>{fmt(r.n)}</strong>
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

/* ====================================================================== */
type Step = "pick" | "map" | "done";

export default function Uploads() {
  const nav = useNavigate();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>("pick");
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // current file
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [firstRow, setFirstRow] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({});
  const [autoMatched, setAutoMatched] = useState(0);
  const [showMore, setShowMore] = useState(false);

  // options
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [consent, setConsent] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HistoryItem | null>(null);

  useEffect(() => {
    listWorkflows()
      .then((ws) => setWorkflows((ws || []).map((w: any) => ({ id: w.id, name: w.name }))))
      .catch(() => {});
  }, []);

  function reset() {
    setStep("pick");
    setFile(null);
    setHeaders([]);
    setFirstRow([]);
    setMapping({});
    setTags([]);
    setTagInput("");
    setWorkflowId("");
    setConsent(false);
    setShowMore(false);
    setError(null);
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function begin(f: File) {
    setError(null);
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      setError("That file isn't a CSV. In Excel, use File → Save As → CSV, then upload it here.");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("That file is over 50 MB. Split it into smaller files and upload them one at a time.");
      return;
    }
    const text = await f.text();
    const rows = parseCsv(text, guessDelimiter(text), 2);
    if (!rows.length) {
      setError("That file is empty.");
      return;
    }
    const hdrs = rows[0];
    const picked: Partial<Record<Field, string>> = {};
    (Object.keys(SYN) as Field[]).forEach((f) => {
      const g = guessFor(f, hdrs);
      if (g) picked[f] = g;
    });
    // if first + last both exist, don't also use a "name" column
    if (picked.first && picked.last && picked.name) delete picked.name;

    setFile(f);
    setHeaders(hdrs);
    setFirstRow(rows[1] || []);
    setRowCount(countRows(text));
    setMapping(picked);
    setAutoMatched(Object.keys(picked).length);
    setShowMore(MORE_FIELDS.some((k) => picked[k]));
    setStep("map");
  }

  const sampleFor = (col?: string) => {
    if (!col) return "";
    const i = headers.indexOf(col);
    return i >= 0 ? firstRow[i] || "" : "";
  };

  const canImport = !!mapping.phone && consent && !busy;

  function addTag(raw: string) {
    const t = raw.trim().replace(/,$/, "");
    if (t && !tags.includes(t)) setTags((x) => [...x, t]);
    setTagInput("");
  }

  async function importNow() {
    if (!file || !canImport) return;
    setBusy(true);
    setError(null);
    try {
      const res: any = await uploadLeadsMapped(file, mapping as CsvMapping, {
        // skip repeated rows inside the file; leads already in GroScales are always skipped by the server
        ignoreDuplicates: true,
        tags,
        workflowId: workflowId || undefined,
      });
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        file: file.name,
        at: new Date().toISOString(),
        added: Number(res?.inserted || 0),
        dbDuplicates: Number(res?.duplicates || 0),
        fileDuplicates: Number(res?.stats?.fileDuplicates || 0),
        invalid: Number(res?.invalids || 0),
      };
      if (!res?.ok) item.failed = res?.error || "The server couldn't import this file";
      const next = [item, ...history];
      setHistory(next);
      saveHistory(next);
      setResult(item);
      setStep("done");
    } catch (e: any) {
      setError(e?.message || "Import failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const filePicker = (
    <input
      ref={fileInput}
      type="file"
      accept=".csv,text/csv"
      hidden
      onChange={(e) => e.target.files?.[0] && begin(e.target.files[0])}
    />
  );

  /* ---------------- step: results ---------------- */
  if (step === "done" && result) {
    const skipped = skippedOf(result);
    return (
      <div className="gs-page">
        <div className="gs-page-panel">
          <div className="up up--done">
            {result.failed ? (
              <header className="up-head">
                <span className="up-result-icon is-bad"><Icon d={I.x} size={20} w={2.4} /></span>
                <h1>Import failed</h1>
                <p>{result.failed}. Nothing was added.</p>
              </header>
            ) : (
              <header className="up-head">
                <span className="up-result-icon"><Icon d={I.check} size={20} w={2.4} /></span>
                <h1>{fmt(result.added)} lead{result.added === 1 ? "" : "s"} imported</h1>
                <p>
                  From {result.file}
                  {tags.length ? ` · tagged ${tags.join(", ")}` : ""}
                </p>
              </header>
            )}

            {!result.failed && (
              <div className="up-stats">
                <div><strong>{fmt(result.added + skipped)}</strong><span>Rows in file</span></div>
                <div><strong className="is-good">{fmt(result.added)}</strong><span>Added</span></div>
                <div><strong className={skipped ? "is-warn" : ""}>{fmt(skipped)}</strong><span>Skipped</span></div>
              </div>
            )}

            {!result.failed && skipped > 0 && (
              <section className="up-why">
                <h2>Why {fmt(skipped)} {skipped === 1 ? "was" : "were"} skipped</h2>
                <Reasons items={reasonList(result)} />
              </section>
            )}

            <div className="up-actions">
              {!result.failed && (
                <button className="gs-btn gs-btn--primary up-btn-lg" onClick={() => nav("/dashboard")}>
                  Go to inbox
                </button>
              )}
              <button className="gs-btn up-btn-lg" onClick={reset}>
                {result.failed ? "Try again" : "Upload another file"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- step: match columns ---------------- */
  if (step === "map" && file) {
    const fields = showMore ? [...MAIN_FIELDS, ...MORE_FIELDS] : MAIN_FIELDS;
    return (
      <div className="gs-page">
        <div className="gs-page-panel">
          <div className="up up--map">
            <header className="up-head">
              <button className="up-back" onClick={reset}>Upload leads</button>
              <h1>Match your columns</h1>
              <p>
                <strong>{file.name}</strong> · about {fmt(rowCount)} rows.{" "}
                {autoMatched
                  ? `We matched ${autoMatched} of your columns automatically. Check them before importing.`
                  : "Pick which column in your file goes with each field."}
              </p>
            </header>

            {error && <div className="up-banner">{error}</div>}

            <div className="up-map">
              <div className="up-map-row up-map-head">
                <span>GroScales field</span>
                <span>Column in your file</span>
                <span>First row</span>
                <span />
              </div>
              {fields.map((f) => {
                const col = mapping[f] || "";
                const required = f === "phone";
                return (
                  <div className="up-map-row" key={f}>
                    <span className="up-field">
                      {FIELD_LABEL[f]}
                      {required && <span className="up-req"> *</span>}
                    </span>
                    <select
                      className={`up-select ${required && !col ? "is-missing" : ""}`}
                      value={col}
                      onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}
                      aria-label={`Column for ${FIELD_LABEL[f]}`}
                    >
                      <option value="">{required ? "Choose a column" : "Don't import"}</option>
                      {headers.map((h, i) => (
                        <option key={`${h}-${i}`} value={h}>
                          {h || `(column ${i + 1})`}
                        </option>
                      ))}
                    </select>
                    <span className="up-sample gs-mono">{sampleFor(col)}</span>
                    <span className="up-state">
                      {col ? (
                        <span className="is-ok"><Icon d={I.check} size={12} w={2.6} />Matched</span>
                      ) : required ? (
                        <span className="is-req">Required</span>
                      ) : (
                        <span>Not in file</span>
                      )}
                    </span>
                  </div>
                );
              })}
              <button className="up-more" onClick={() => setShowMore((s) => !s)}>
                {showMore ? "Show fewer fields" : "Show more fields"}
              </button>
            </div>

            <section className="up-options">
              <h2>Options</h2>
              <div className="up-option-row">
                <label className="up-option">
                  <span className="up-label">Tag everyone in this file</span>
                  <div className="up-tagbox">
                    {tags.map((t) => (
                      <span key={t} className="gs-chip up-tag">
                        {t}
                        <button aria-label={`Remove ${t}`} onClick={() => setTags((x) => x.filter((y) => y !== t))}>
                          <Icon d={I.x} size={10} w={2.4} />
                        </button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      placeholder={tags.length ? "" : "Add a tag"}
                      onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value) : setTagInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addTag(tagInput); }
                        if (e.key === "Backspace" && !tagInput) setTags((x) => x.slice(0, -1));
                      }}
                      onBlur={() => tagInput && addTag(tagInput)}
                    />
                  </div>
                </label>
                <label className="up-option">
                  <span className="up-label">Start a workflow</span>
                  <select className="up-select" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
                    <option value="">None</option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="up-muted up-note">Leads already in GroScales and repeated rows are skipped automatically, so nobody gets added twice.</p>

              <label className="up-check up-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  These leads agreed to receive texts from my business.{" "}
                  <span className="up-muted">Required before importing. Texting leads without consent can violate the TCPA.</span>
                </span>
              </label>
            </section>

            <div className="up-actions up-actions--end">
              <button className="gs-btn gs-btn--ghost up-btn-lg" onClick={reset} disabled={busy}>
                Cancel
              </button>
              <button className="gs-btn gs-btn--primary up-btn-lg" onClick={importNow} disabled={!canImport}>
                {busy ? "Importing…" : `Import ${rowCount ? `about ${fmt(rowCount)} ` : ""}leads`}
              </button>
            </div>
            {!mapping.phone && <p className="up-footnote">Choose your phone column to continue.</p>}
            {mapping.phone && !consent && <p className="up-footnote">Confirm consent to continue.</p>}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- step: pick file + history ---------------- */
  return (
    <div className="gs-page">
      <div className="gs-page-panel">
        <div className="up">
          <header className="up-head">
            <h1>Upload leads</h1>
            <p>Import a CSV from your lead vendor. We'll match the columns for you.</p>
          </header>

          {error && <div className="up-banner">{error}</div>}

          <div
            className={`up-drop ${dragging ? "is-dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) begin(f);
            }}
          >
            <span className="up-drop-icon"><Icon d={I.upload} size={20} /></span>
            <span className="up-drop-title">Drop a CSV here</span>
            <span className="up-muted">
              or{" "}
              <button className="up-link" onClick={() => fileInput.current?.click()}>
                choose a file
              </button>{" "}
              · CSV up to 50 MB
            </span>
            {filePicker}
          </div>

          <section className="up-history">
            <h2>Recent uploads</h2>
            {!history.length && <p className="up-muted">Files you upload will show up here.</p>}
            {history.map((h) => {
              const skipped = skippedOf(h);
              const canExpand = !h.failed && skipped > 0;
              const open = expanded === h.id;
              return (
                <div key={h.id} className="up-hrow">
                  <div
                    className={`up-hmain ${canExpand ? "is-clickable" : ""}`}
                    onClick={() => canExpand && setExpanded(open ? null : h.id)}
                    role={canExpand ? "button" : undefined}
                    tabIndex={canExpand ? 0 : undefined}
                    aria-expanded={canExpand ? open : undefined}
                    onKeyDown={(e) => canExpand && (e.key === "Enter" || e.key === " ") && setExpanded(open ? null : h.id)}
                  >
                    <span className="up-file-icon"><Icon d={I.file} /></span>
                    <div className="up-hinfo">
                      <span className="up-hname">{h.file}</span>
                      <span className="up-hsum">
                        {h.failed ? (
                          <><span className="up-fail">Import failed</span> · {h.failed.toLowerCase()}</>
                        ) : (
                          summaryLine(h)
                        )}
                      </span>
                    </div>
                    <span className="up-hdate">{relDate(h.at)}</span>
                    <span className="up-hstatus">
                      {h.failed ? (
                        <button
                          className="up-retry"
                          onClick={(e) => { e.stopPropagation(); fileInput.current?.click(); }}
                        >
                          Try again
                        </button>
                      ) : skipped ? (
                        <span className="gs-chip up-chip-warn">Some skipped</span>
                      ) : (
                        <span className="gs-chip up-chip-ok">Imported</span>
                      )}
                    </span>
                    <span className="up-chev">{canExpand && <Icon d={open ? I.up : I.down} size={14} w={2} />}</span>
                  </div>
                  {open && (
                    <div className="up-expand">
                      <Reasons items={reasonList(h)} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}

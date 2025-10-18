// apps/web/src/pages/Uploads.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ------------------------------ Types ------------------------------ */
type Status = "success" | "partial" | "failed";
type Row = {
  id: string;
  name: string;
  size: number;
  at: string;           // ISO string
  leads: number;
  duplicates: number;
  invalids: number;
  status: Status;
  note?: string;
};

type Mapping = Partial<Record<
  | "name" | "first" | "last" | "email" | "phone"
  | "tags" | "note" | "dob" | "city" | "state" | "zip" | "address",
  string
>>;

type ImportOptions = {
  ignoreDuplicates?: boolean;
  tags?: string[];
  workflowId?: string;
};

type Workflow = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused";
  createdAt: string;
  updatedAt: string;
};

/* --------------- Header canon + client-side synonyms --------------- */
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
  // extras
  dob: "dob",
  "date of birth": "dob",
  city: "city",
  state: "state",
  zipcode: "zip",
  "postal code": "zip",
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
const CANONICAL_ORDER: Array<keyof Mapping> = [
  "name", "first", "last", "email", "phone",
  "tags", "note", "dob", "city", "state", "zip", "address",
];

function normalizeHeader(h: string): string {
  const k = (h || "").replace(/\uFEFF/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  return HMAP[k] || k;
}
function guessDelimiter(sample: string): string {
  const cand = [",", ";", "\t", "|"] as const;
  const lines = sample.split(/\r?\n/).slice(0, 8);
  let best: string = cand[0];
  let bestScore = -1;
  for (const ch of cand) {
    const counts = lines.map((l) => (l.match(new RegExp(ch, "g")) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const variance =
      counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > bestScore) { bestScore = score; best = ch; }
  }
  return best;
}

/* -------------------------------- Page -------------------------------- */
export default function Uploads() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // wizard state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [normalizedHeaders, setNormalizedHeaders] = useState<string[]>([]);
  const [sampleLines, setSampleLines] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [opts, setOpts] = useState<ImportOptions>({ ignoreDuplicates: false, tags: [] });
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [wip, setWip] = useState(false);

  // helpers
  const fmtBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 ** 2).toFixed(1)} MB`;
  };

  const readText = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(f);
    });

  // preview parsing
  const parsePreview = async (f: File) => {
    const text = await readText(f);
    const delim = guessDelimiter(text);
    const lines = text.split(/\r?\n/).filter((ln) => ln.length > 0);
    if (!lines.length) throw new Error("Empty file");

    const headers = lines[0].split(delim).map((h) => String(h).replace(/\uFEFF/g, "").trim());
    setRawHeaders(headers);
    const normalized = headers.map(normalizeHeader);
    setNormalizedHeaders(normalized);

    // show first ~10 body rows in a single textarea (fast, no heavy table libs)
    const samples = lines.slice(1, 11);
    setSampleLines(samples);

    // auto-map: pick the original header text for any canonical we detect
    const auto: Mapping = {};
    for (const canon of CANONICAL_ORDER) {
      const ix = normalized.indexOf(canon);
      if (ix >= 0) auto[canon] = headers[ix];
    }
    setMapping((m) => ({ ...auto, ...m }));
  };

  // list of headers actually present in file
  const presentHeaderOptions = useMemo(() => rawHeaders, [rawHeaders]);

  // mapping validity: need Name or First+Last AND (Email or Phone)
  const mappingValid = useMemo(() => {
    const hasName = !!(mapping.name || (mapping.first && mapping.last));
    const hasKey = !!(mapping.email || mapping.phone);
    return hasName && hasKey;
  }, [mapping]);

  // fetch workflows (for Configure step)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workflows", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setWorkflows(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // open wizard
  const beginWizard = async (f: File) => {
    setFile(f);
    setErr(null);
    setOpen(true);
    setStep(1);
    try {
      await parsePreview(f);
      setStep(2);
    } catch (e: any) {
      setErr(e?.message || "Failed to read file.");
    }
  };

  // drop
  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    await beginWizard(files[0]);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // server import
  const importToServer = async () => {
    if (!file) return;
    setWip(true);
    setErr(null);

    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    form.append("options", JSON.stringify(opts));

    const jwt = (() => {
      try { return localStorage.getItem("jwt") || ""; } catch { return ""; }
    })();

    const res = await fetch("/api/uploads/import", {
      method: "POST",
      body: form,
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      credentials: "include",
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || `${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // Build UI row
    const inserted = Number(data?.inserted || 0);
    const invalids = Number(data?.invalids || 0);
    const dups = Number(data?.duplicates || 0);
    const status: Status =
      inserted > 0 && (invalids > 0 || dups > 0)
        ? "partial"
        : inserted > 0
        ? "success"
        : "failed";

    const note =
      status === "success"
        ? "Imported successfully."
        : status === "partial"
        ? "Some rows were invalid or duplicated."
        : String(data?.error || "Failed to import.");

    const newRow: Row = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      at: new Date().toISOString(),
      leads: inserted,
      duplicates: dups,
      invalids,
      status,
      note,
    };
    setRows((r) => [newRow, ...r]);
  };

  /* -------------------------------- Render -------------------------------- */
  return (
    <div className="p-uploads">
      <div className="crumbs">
        <button className="crumb-back" onClick={() => nav("/dashboard")}>← Dashboard</button>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Uploads</span>
      </div>

      <div className="uploads-head"><div className="title">Uploads</div></div>

      <label
        className={`dropcard ${dragOver ? "drag" : ""}`}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json"
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <UploadIcon className={`upl-icon ${dragOver ? "breathe" : ""}`} />
        <div className="drop-head">Drop CSV or JSON</div>
        <div className="drop-sub">Click to browse • Max 50 MB • UTF-8 • Headers required</div>
      </label>

      <div className="drop-helper">CSV or JSON • Click to browse</div>

      <section className="history">
        <div className="card">
          <div className="card-head">Recent uploads</div>
          <div className="table-wrap">
            <table className="u-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Date</th>
                  <th className="num">Leads</th>
                  <th className="num">Duplicates</th>
                  <th className="num">Invalids</th>
                  <th>Status</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="empty">
                      <span className="empty-icon" aria-hidden>⌄</span>
                      <span>No uploads yet. Drag a CSV/JSON above or click to browse.</span>
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td title={`${r.name} • ${fmtBytes(r.size)}`}>
                      <div className="filecell">
                        <span className="fname">{r.name}</span>
                        <span className="fmeta">· {fmtBytes(r.size)}</span>
                      </div>
                    </td>
                    <td>{new Date(r.at).toLocaleString()}</td>
                    <td className="num">{r.leads}</td>
                    <td className="num">{r.duplicates}</td>
                    <td className="num">{r.invalids}</td>
                    <td>
                      <span className={`pill ${r.status}`}>
                        {r.status === "success" ? "Success" : r.status === "partial" ? "Partial" : "Failed"}
                      </span>
                    </td>
                    <td><button className="link" disabled>Download</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ------------------------ Wizard modal ------------------------ */}
      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <div className="w-title">Upload csv file</div>
              <button className="icon-btn" aria-label="Close" disabled={wip} onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="steps">
              <Step n={1} label="Select CSV file" on={step >= 1} />
              <span className="chev">›</span>
              <Step n={2} label="Map columns" on={step >= 2} />
              <span className="chev">›</span>
              <Step n={3} label="Configure" on={step >= 3} />
              <span className="chev">›</span>
              <Step n={4} label="Review" on={step >= 4} />
              <div className="meta right">
                {rawHeaders.length > 0 && (
                  <>
                    <span className="meta-badge">Delimiter: <strong>{/* determined client-side */}</strong></span>
                    <span className="meta-badge">Rows: <strong>{sampleLines.length ? "…" : "…"}</strong></span>
                  </>
                )}
              </div>
            </div>

            {err && <div className="err">{err}</div>}

            {/* Step 1: Preview */}
            {step === 1 && (
              <div className="s1">
                <div className="filebadge">
                  <strong>{file?.name}</strong>
                  {!!file && <span> · {fmtBytes(file.size)}</span>}
                </div>
                {rawHeaders.length > 0 && (
                  <>
                    <label className="blocklabel">Preview</label>
                    <textarea
                      className="previewarea"
                      readOnly
                      value={[rawHeaders.join(","), ...sampleLines].join("\n")}
                    />
                  </>
                )}
              </div>
            )}

            {/* Step 2: Mapping */}
            {step === 2 && (
              <div className="map">
                <FieldRow
                  label="Name (optional if First+Last)"
                  value={mapping.name || ""}
                  onChange={(v) => setMapping((m) => ({ ...m, name: v }))}
                  options={presentHeaderOptions}
                  placeholder="(none)"
                />
                <div className="map-grid-2">
                  <FieldRow
                    label="First name"
                    value={mapping.first || ""}
                    onChange={(v) => setMapping((m) => ({ ...m, first: v }))}
                    options={presentHeaderOptions}
                  />
                  <FieldRow
                    label="Last name"
                    value={mapping.last || ""}
                    onChange={(v) => setMapping((m) => ({ ...m, last: v }))}
                    options={presentHeaderOptions}
                  />
                </div>

                <div className="map-grid-2">
                  <FieldRow
                    label="Email"
                    value={mapping.email || ""}
                    onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
                    options={presentHeaderOptions}
                  />
                  <FieldRow
                    label="Phone"
                    value={mapping.phone || ""}
                    onChange={(v) => setMapping((m) => ({ ...m, phone: v }))}
                    options={presentHeaderOptions}
                  />
                </div>

                <div className="map-grid-2">
                  <FieldRow
                    label="Tags (per row)"
                    value={mapping.tags || ""}
                    onChange={(v) => setMapping((m) => ({ ...m, tags: v }))}
                    options={presentHeaderOptions}
                    placeholder="(optional)"
                  />
                  <FieldRow
                    label="Note"
                    value={mapping.note || ""}
                    onChange={(v) => setMapping((m) => ({ ...m, note: v }))}
                    options={presentHeaderOptions}
                    placeholder="(optional)"
                  />
                </div>

                <details className="adv">
                  <summary>More fields</summary>
                  <div className="map-grid-3">
                    <FieldRow label="DOB" value={mapping.dob || ""} onChange={(v) => setMapping((m) => ({ ...m, dob: v }))} options={presentHeaderOptions} placeholder="(optional)" />
                    <FieldRow label="City" value={mapping.city || ""} onChange={(v) => setMapping((m) => ({ ...m, city: v }))} options={presentHeaderOptions} placeholder="(optional)" />
                    <FieldRow label="State" value={mapping.state || ""} onChange={(v) => setMapping((m) => ({ ...m, state: v }))} options={presentHeaderOptions} placeholder="(optional)" />
                    <FieldRow label="Zip" value={mapping.zip || ""} onChange={(v) => setMapping((m) => ({ ...m, zip: v }))} options={presentHeaderOptions} placeholder="(optional)" />
                    <FieldRow label="Address" value={mapping.address || ""} onChange={(v) => setMapping((m) => ({ ...m, address: v }))} options={presentHeaderOptions} placeholder="(optional)" />
                  </div>
                </details>

                {!mappingValid && (
                  <div className="hint">
                    Map either <strong>Name</strong> or <strong>First+Last</strong>, and at least one of <strong>Email</strong> or <strong>Phone</strong>.
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Configure */}
            {step === 3 && (
              <div className="cfg">
                <div className="opt-row">
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={!!opts.ignoreDuplicates}
                      onChange={(e) => setOpts((o) => ({ ...o, ignoreDuplicates: e.target.checked }))}
                    />
                    Ignore duplicates within file
                  </label>
                </div>

                <div className="opt-row">
                  <label>Apply tags to all leads</label>
                  <input
                    className="text"
                    placeholder="comma,separated,tags"
                    value={(opts.tags || []).join(",")}
                    onChange={(e) =>
                      setOpts((o) => ({
                        ...o,
                        tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                      }))
                    }
                  />
                </div>

                <div className="opt-row">
                  <label>Workflow</label>
                  <select
                    className="select"
                    value={opts.workflowId || ""}
                    onChange={(e) => setOpts((o) => ({ ...o, workflowId: e.target.value || undefined }))}
                  >
                    <option value="">(none)</option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.status !== "active" ? ` • ${w.status}` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="muted">Pick a workflow to start these leads automatically after import.</div>
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="review">
                <div className="r-head">Import Summary</div>
                <div className="r-grid">
                  <div>
                    <div className="k">File:</div>
                    <div className="v">{file?.name}</div>
                  </div>
                  <div>
                    <div className="k">Mapped fields:</div>
                    <ul className="mapping">
                      {CANONICAL_ORDER.map((k) =>
                        mapping[k] ? (
                          <li key={k}>
                            <span className="mm-key">{labelFor(k)}</span>
                            <span className="mm-sep">—</span>
                            <span className="mm-val">{mapping[k]}</span>
                          </li>
                        ) : null
                      )}
                    </ul>
                  </div>
                  <div>
                    <div className="k">Options:</div>
                    <ul className="mapping">
                      <li>Ignore file duplicates: <strong>{opts.ignoreDuplicates ? "Yes" : "No"}</strong></li>
                      <li>Global tags: <strong>{(opts.tags || []).join(", ") || "(none)"}</strong></li>
                      <li>Workflow: <strong>{workflows.find((w) => w.id === opts.workflowId)?.name || "(none)"}</strong></li>
                    </ul>
                  </div>
                </div>
                <div className="note-blurb">
                  Phone numbers will be formatted to E.164 when possible. Invalid emails/phones are skipped.
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="sheet-foot">
              <button className="btn-outline" onClick={() => setOpen(false)} disabled={wip}>Cancel</button>
              {step > 1 && <button className="btn-outline" onClick={() => setStep((s) => (s > 1 ? ((s - 1) as any) : s))} disabled={wip}>Back</button>}
              {step === 1 && <button className="btn-primary" onClick={() => setStep(2)} disabled={!rawHeaders.length || wip}>Next</button>}
              {step === 2 && <button className="btn-primary" onClick={() => setStep(3)} disabled={!mappingValid || wip}>Next</button>}
              {step === 3 && <button className="btn-primary" onClick={() => setStep(4)} disabled={!mappingValid || wip}>Next</button>}
              {step === 4 && (
                <button
                  className="btn-primary"
                  disabled={!mappingValid || wip}
                  onClick={async () => {
                    try {
                      await importToServer();
                      setOpen(false);
                    } catch (e: any) {
                      setErr(e?.message || "Import failed");
                    } finally {
                      setWip(false);
                    }
                  }}
                >
                  {wip ? "Importing…" : "Import contacts"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scoped styles for this page only */}
      <style>{STYLES}</style>
    </div>
  );
}

/* ---------------------------- Little components --------------------------- */
function Step({ n, label, on }: { n: number; label: string; on: boolean }) {
  return (
    <>
      <span className={`step ${on ? "on" : ""}`}>{n}</span>
      <span className="step-label">{label}</span>
    </>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div className="map-row">
      <label>{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder || "(none)"}</option>
        {options.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  );
}

function labelFor(k: keyof Mapping) {
  switch (k) {
    case "name": return "Name";
    case "first": return "First name";
    case "last": return "Last name";
    case "email": return "Email";
    case "phone": return "Phone";
    case "tags": return "Tags";
    case "note": return "Note";
    case "dob": return "DOB";
    case "city": return "City";
    case "state": return "State";
    case "zip": return "Zip";
    case "address": return "Address";
    default: return k;
  }
}

/* ------------------------------ Small icons ------------------------------ */
function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v14" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

/* -------------------------------- Styles --------------------------------- */
const STYLES = `
.p-uploads { padding: 14px; }
.crumbs { display:flex; gap:8px; align-items:center; color: var(--text-secondary); margin-bottom:10px; }
.crumb-back{ background:none;border:0;color:inherit;cursor:pointer;padding:0; }
.uploads-head .title { font-weight:750; }

.dropcard{
  display:grid; place-items:center; text-align:center;
  margin-top:10px; padding:28px 10px; border:1px dashed var(--line);
  border-radius:12px; background: color-mix(in srgb, var(--surface-1) 96%, var(--line));
  cursor:pointer; transition: border-color .15s, background .15s, transform .15s;
}
.dropcard:hover{ transform: translateY(-1px); }
.dropcard.drag{ border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-1)); }
.upl-icon{ width:40px; height:40px; opacity:.9; }
.upl-icon.breathe{ animation: breathe 1.2s ease-in-out infinite; }
@keyframes breathe{ 0%{ transform:scale(1); } 60%{ transform:scale(1.06);} 100%{ transform:scale(1);} }
.drop-head{ font-weight:700; margin-top:6px; }
.drop-sub{ font-size:12px; color: var(--text-secondary); }
.drop-helper{ text-align:center; color: var(--text-secondary); font-size:12px; margin:6px 0 16px; }

.card{ border:1px solid var(--line); border-radius:12px; overflow:hidden; background:var(--surface-1); }
.card-head{ padding:10px; border-bottom:1px solid var(--line); font-weight:700; }
.table-wrap{ overflow:auto; }
.u-table{ width:100%; border-collapse:collapse; }
.u-table th, .u-table td{ padding:10px; border-top:1px solid var(--line); }
.u-table th{ text-align:left; font-size:12px; color: var(--text-secondary); }
.u-table .num{ text-align:right; }
.filecell .fname{ font-weight:600; }
.filecell .fmeta{ color: var(--text-secondary); margin-left:6px; }
.empty{ color: var(--text-secondary); text-align:center; padding:36px 0; }
.empty-icon{ display:inline-block; transform: rotate(180deg); margin-right:6px; opacity:.6; }
.pill{ padding:4px 8px; border-radius:999px; font-size:12px; }
.pill.success{ background:#daf5e6; color:#0a7e3d; }
.pill.partial{ background:#fff3d6; color:#9a6b00; }
.pill.failed{ background:#ffe1e1; color:#b91c1c; }
.link{ background:none;border:0;color:var(--accent); cursor:default; }

.modal{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:grid; place-items:center; z-index:70; }
.sheet{ width:min(980px, 94vw); background:var(--surface-1); border:1px solid var(--line); border-radius:14px; box-shadow:0 24px 80px rgba(0,0,0,.24); }
.sheet-head{ display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid var(--line); }
.w-title{ font-weight:750; }
.icon-btn{ background:none; border:0; padding:6px 8px; cursor:pointer; opacity:.8; }

.steps{ display:flex; align-items:center; gap:6px; padding:10px 14px; border-bottom:1px dashed var(--line); color:var(--text-secondary); }
.step{ width:18px; height:18px; border-radius:999px; display:grid; place-items:center; border:1px solid var(--line); font-size:12px; }
.step.on{ background: color-mix(in srgb, var(--accent) 20%, transparent); border-color: var(--accent); color: var(--accent-contrast, #000); }
.step-label{ margin-right:6px; font-size:12px; }
.chev{ opacity:.6; margin:0 2px; }
.steps .meta.right{ margin-left:auto; display:flex; gap:8px; }
.meta-badge{ font-size:12px; color:var(--text-secondary); }

.s1{ padding:12px 14px; display:grid; gap:10px; }
.blocklabel{ font-size:12px; color:var(--text-secondary); }
.previewarea{ width:100%; min-height:220px; border:1px solid var(--line); border-radius:8px; padding:8px 10px; background:var(--surface-1); color:inherit; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size:12px; }

.map{ padding:12px 14px; display:grid; gap:12px; }
.map-grid-2{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
.map-grid-3{ display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
.map-row label{ display:block; font-size:12px; color:var(--text-secondary); margin-bottom:4px; }
.select{ width:100%; border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:10px; padding:8px 10px; }
.hint{ font-size:12px; color:#9a6b00; background:#fff6db; border:1px solid #f7e7b2; padding:8px 10px; border-radius:8px; }

.adv summary{ cursor:pointer; color:var(--text-secondary); }
.adv{ border:1px dashed var(--line); border-radius:8px; padding:10px; }

.cfg{ padding:12px 14px; display:grid; gap:12px; }
.opt-row{ display:grid; gap:6px; }
.chk{ display:flex; align-items:center; gap:8px; }
.text{ border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:10px; padding:8px 10px; }
.muted{ color:var(--text-secondary); font-size:12px; }

.review{ padding:12px 14px; display:grid; gap:12px; }
.r-head{ font-weight:700; }
.r-grid{ display:grid; grid-template-columns: 1.2fr 1fr; gap:12px; }
.mapping{ margin:6px 0 0 0; padding:0 0 0 16px; }
.mm-key{ font-weight:600; }
.mm-sep{ margin:0 6px; opacity:.6; }
.note-blurb{ font-size:12px; color:var(--text-secondary); padding:8px 10px; border-radius:8px; background: color-mix(in srgb, var(--surface-1) 96%, var(--line)); }

.sheet-foot{ display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--line); }
.btn-outline{ background:transparent; border:1px solid var(--line); border-radius:10px; padding:8px 12px; }
.btn-primary{ background: var(--accent); color: var(--accent-contrast, #fff); border:0; border-radius:10px; padding:8px 12px; transition: transform .05s ease; }
.btn-primary:active{ transform: translateY(1px); }

.err{ margin:10px 14px; color:#b91c1c; background:#ffe8e8; border:1px solid #f7b3b3; padding:8px 10px; border-radius:8px; }
`;
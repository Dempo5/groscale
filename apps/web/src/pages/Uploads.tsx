import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listWorkflows } from "../lib/api"; // uses your existing helper

/* ------------------------------- types ------------------------------- */
type Status = "success" | "partial" | "failed";
type Row = {
  id: string;
  name: string;
  size: number;
  at: string;
  leads: number;
  duplicates: number;
  invalids: number;
  status: Status;
  note?: string;
};

type Mapping = Partial<Record<
  | "name"
  | "first"
  | "last"
  | "email"
  | "phone"
  | "dob"
  | "city"
  | "state"
  | "zip"
  | "address"
  | "note"
  | "tags",
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
  status: "draft" | "active" | "paused" | string;
  createdAt?: string;
  updatedAt?: string;
};

/* --------------------- header normalization (client) --------------------- */
const HMAP: Record<string, string> = {
  // same as server
  firstname: "first", "first name": "first", first: "first",
  lastname: "last", "last name": "last", last: "last",
  name: "name", "full name": "name", fullname: "name", "contact name": "name",

  email: "email", "e-mail": "email", "email address": "email",

  phone: "phone", "phone #": "phone", "phone number": "phone",
  mobile: "phone", cell: "phone", "cell phone": "phone", telephone: "phone",
  primaryphc: "phone", phone2: "phone", "primary phone": "phone",

  dob: "dob", "date of birth": "dob", "birth date": "dob", birthdate: "dob", "d.o.b": "dob",

  city: "city", state: "state",

  zip: "zip", zipcode: "zip", "zip code": "zip", postal: "zip", "postal code": "zip",

  address: "address", addr: "address", "street address": "address",

  "date added": "dateAdded", "created at": "dateAdded", created: "dateAdded",

  tags: "tags", label: "tags", labels: "tags", segments: "tags",
  note: "note", notes: "note",
};
function normalizeHeader(h: string): string {
  const k = (h || "").replace(/\uFEFF/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  return HMAP[k] || k;
}
function guessDelimiter(sample: string): string {
  const cand = [",", ";", "\t", "|"] as const;
  const lines = sample.split(/\r?\n/).slice(0, 8);
  let best: string = cand[0]; let bestScore = -1;
  for (const ch of cand) {
    const counts = lines.map(l => (l.match(new RegExp(ch, "g")) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > bestScore) { bestScore = score; best = ch; }
  }
  return best;
}

/* -------------------------------- page -------------------------------- */
export default function Uploads() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // history table
  const [rows, setRows] = useState<Row[]>([]);

  // wizard
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [normalized, setNormalized] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [detectedDelimiter, setDetectedDelimiter] = useState<string>("");

  const [mapping, setMapping] = useState<Mapping>({});
  const [opts, setOpts] = useState<ImportOptions>({ ignoreDuplicates: false, tags: [], workflowId: "" });

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [wip, setWip] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // drag n drop
  const [dragOver, setDragOver] = useState(false);

  // fetch workflows (once)
  useEffect(() => {
    (async () => {
      try {
        const items = await listWorkflows();
        setWorkflows(items || []);
      } catch {
        setWorkflows([]); // silent
      }
    })();
  }, []);

  /* ---------------------- utils & parsing preview ---------------------- */
  const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

  const readText = (f: File) => new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsText(f);
  });

  const parsePreview = async (f: File) => {
    const text = await readText(f);
    const delim = guessDelimiter(text);
    setDetectedDelimiter(delim);

    let lines = text.split(/\r?\n/);
    if (lines.length && !lines[lines.length - 1].trim()) lines = lines.slice(0, -1);
    if (!lines.length) throw new Error("Empty file");

    const rawHeaders = lines[0].split(delim).map(h => String(h).replace(/\uFEFF/g, "").trim());
    setFileHeaders(rawHeaders);
    setNormalized(rawHeaders.map(normalizeHeader));
    setSampleRows(lines.slice(1, Math.min(lines.length, 9)).map(ln => ln.split(delim)));
    setTotalRows(Math.max(lines.length - 1, 0));

    // auto-map
    const norm = rawHeaders.map(normalizeHeader);
    const find = (canon: string) => {
      const idx = norm.indexOf(canon);
      return idx >= 0 ? rawHeaders[idx] : "";
    };
    const guess: Mapping = {
      name: find("name"),
      first: find("first"),
      last: find("last"),
      email: find("email"),
      phone: find("phone"),
      dob: find("dob"),
      city: find("city"),
      state: find("state"),
      zip: find("zip"),
      address: find("address"),
      note: find("note"),
      tags: find("tags"),
    };
    setMapping(guess);
  };

  /* ----------------------------- server import ----------------------------- */
  const importToServer = async () => {
    if (!file) return;
    setWip(true); setErr(null);

    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    form.append("options", JSON.stringify(opts));

    const jwt = (() => { try { return localStorage.getItem("jwt") || ""; } catch { return ""; } })();

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

    const inserted = Number(data?.inserted || 0);
    const invalids = Number(data?.invalids || 0);
    const dups = Number(data?.duplicates || 0);
    const status: Status =
      inserted > 0 && (invalids > 0 || dups > 0) ? "partial" :
      inserted > 0 ? "success" : "failed";

    const note =
      status === "success" ? "Imported successfully." :
      status === "partial" ? "Some rows were invalid or duplicated." :
      String(data?.error || "Failed to import.");

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
    setRows(r => [newRow, ...r]);
  };

  /* ----------------------------- event handlers ---------------------------- */
  const beginWizard = async (f: File) => {
    setFile(f);
    setStep(1);
    setOpen(true);
    setErr(null);
    try { await parsePreview(f); setStep(2); }
    catch (e: any) { setErr(e?.message || "Failed to read file."); }
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    await beginWizard(files[0]);
  }, []);

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); handleFiles(e.dataTransfer.files); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };

  // validity: require Name or First+Last AND Email or Phone
  const mappingValid = useMemo(() => {
    const hasName = !!(mapping.name || (mapping.first && mapping.last));
    const hasKey = !!(mapping.email || mapping.phone);
    return hasName && hasKey;
  }, [mapping]);

  // Which mapping rows should we show? (only if that canonical field seems present)
  const present = useMemo(() => new Set(normalized), [normalized]);
  const showRow = (canon: string) => present.has(canon); // “like PitchPrfct”: hide if not present

  // esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !wip) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wip]);

  /* -------------------------------- render -------------------------------- */
  return (
    <div className="p-uploads">
      <div className="crumbs">
        <button className="crumb-back" onClick={() => nav("/dashboard")}>← Dashboard</button>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Uploads</span>
      </div>

      <div className="uploads-head">
        <div className="title">Uploads</div>
      </div>

      <label
        className={`dropcard ${dragOver ? "drag" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <input ref={inputRef} type="file" accept=".csv,.json" style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
        <UploadIcon className={`upl-icon ${dragOver ? "breathe" : ""}`} />
        <div className="drop-head">Drop CSV or JSON</div>
        <div className="drop-sub">Click to browse • Max 50 MB • UTF-8 • Headers required</div>
      </label>

      <div className="drop-helper">CSV or JSON • Click to browse</div>

      {/* history */}
      <section className="history">
        <div className="card">
          <div className="card-head">Recent uploads</div>
          <div className="table-wrap">
            <table className="u-table">
              <thead>
                <tr>
                  <th>File</th><th>Date</th>
                  <th className="num">Leads</th>
                  <th className="num">Duplicates</th>
                  <th className="num">Invalids</th>
                  <th>Status</th><th>Report</th>
                </tr>
              </thead>
              <tbody>
                {!rows.length && (
                  <tr><td colSpan={7} className="empty"><span className="empty-icon" aria-hidden>⌄</span><span>No uploads yet. Drag a CSV/JSON above or click to browse.</span></td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td title={`${r.name} • ${fmtBytes(r.size)}`}>
                      <div className="filecell"><span className="fname">{r.name}</span><span className="fmeta">· {fmtBytes(r.size)}</span></div>
                    </td>
                    <td>{new Date(r.at).toLocaleString()}</td>
                    <td className="num">{r.leads}</td>
                    <td className="num">{r.duplicates}</td>
                    <td className="num">{r.invalids}</td>
                    <td>
                      <span className={`pill ${r.status}`} title={r.note || ""}>
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

      {/* wizard */}
      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <div className="w-title">Upload csv file</div>
              <button className="icon-btn" aria-label="Close" disabled={wip} onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="steps">
              <span className={`step ${step >= 1 ? "on" : ""}`}>1</span><span className="step-label">Select CSV file</span><span className="chev">›</span>
              <span className={`step ${step >= 2 ? "on" : ""}`}>2</span><span className="step-label">Map columns</span><span className="chev">›</span>
              <span className={`step ${step >= 3 ? "on" : ""}`}>3</span><span className="step-label">Configure</span><span className="chev">›</span>
              <span className={`step ${step >= 4 ? "on" : ""}`}>4</span><span className="step-label">Review</span>
            </div>

            {err && <div className="err">{err}</div>}

            {/* Step 1 - preview */}
            {step >= 1 && (
              <div className="s1">
                <div className="filebadge">
                  <strong>{file?.name}</strong>
                  {!!file && <span> · {fmtBytes(file.size)}</span>}
                  <span className="tag" style={{ marginLeft: 8 }}>Delimiter: {detectedDelimiter || "-"}</span>
                  <span className="tag" style={{ marginLeft: 6 }}>Rows: {totalRows}</span>
                </div>
                {!!fileHeaders.length && (
                  <div className="preview">
                    <div className="p-head">Preview</div>
                    <div className="p-grid">
                      <div className="p-row p-row--head">
                        {fileHeaders.map((h, i) => <div key={i} className="p-cell">{h}</div>)}
                      </div>
                      {sampleRows.map((r, ri) => (
                        <div key={ri} className="p-row">
                          {r.map((c, ci) => <div key={ci} className="p-cell">{c}</div>)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2 - mapping */}
            {step >= 2 && (
              <div className="map">
                <MapRow label="Name" headers={fileHeaders} value={mapping.name || ""} onChange={(v) => setMapping(m => ({ ...m, name: v }))} placeholder="(optional if First+Last)" show={true} />
                <div className="map-grid-2">
                  <MapRow label="First name" headers={fileHeaders} value={mapping.first || ""} onChange={(v) => setMapping(m => ({ ...m, first: v }))} show={true} />
                  <MapRow label="Last name" headers={fileHeaders} value={mapping.last || ""} onChange={(v) => setMapping(m => ({ ...m, last: v }))} show={true} />
                </div>

                <div className="map-grid-2">
                  <MapRow label="Email" headers={fileHeaders} value={mapping.email || ""} onChange={(v) => setMapping(m => ({ ...m, email: v }))} show={showRow("email")} />
                  <MapRow label="Phone" headers={fileHeaders} value={mapping.phone || ""} onChange={(v) => setMapping(m => ({ ...m, phone: v }))} show={showRow("phone")} />
                </div>

                <div className="map-grid-2">
                  <MapRow label="DOB" headers={fileHeaders} value={mapping.dob || ""} onChange={(v) => setMapping(m => ({ ...m, dob: v }))} show={showRow("dob")} placeholder="(optional)" />
                  <MapRow label="City" headers={fileHeaders} value={mapping.city || ""} onChange={(v) => setMapping(m => ({ ...m, city: v }))} show={showRow("city")} placeholder="(optional)" />
                </div>

                <div className="map-grid-2">
                  <MapRow label="State" headers={fileHeaders} value={mapping.state || ""} onChange={(v) => setMapping(m => ({ ...m, state: v }))} show={showRow("state")} placeholder="(optional)" />
                  <MapRow label="Zip" headers={fileHeaders} value={mapping.zip || ""} onChange={(v) => setMapping(m => ({ ...m, zip: v }))} show={showRow("zip")} placeholder="(optional)" />
                </div>

                <MapRow label="Address" headers={fileHeaders} value={mapping.address || ""} onChange={(v) => setMapping(m => ({ ...m, address: v }))} show={showRow("address")} placeholder="(optional)" />
                <div className="map-grid-2">
                  <MapRow label="Tags (per row)" headers={fileHeaders} value={mapping.tags || ""} onChange={(v) => setMapping(m => ({ ...m, tags: v }))} show={showRow("tags")} placeholder="(optional)" />
                  <MapRow label="Note" headers={fileHeaders} value={mapping.note || ""} onChange={(v) => setMapping(m => ({ ...m, note: v }))} show={showRow("note")} placeholder="(optional)" />
                </div>

                {!mappingValid && (
                  <div className="hint">Map either <strong>Name</strong> or <strong>First+Last</strong>, and at least one of <strong>Email</strong> or <strong>Phone</strong>.</div>
                )}
              </div>
            )}

            {/* Step 3 - configure */}
            {step >= 3 && (
              <div className="cfg">
                <div className="opt-row">
                  <label className="chk">
                    <input type="checkbox" checked={!!opts.ignoreDuplicates} onChange={(e) => setOpts(o => ({ ...o, ignoreDuplicates: e.target.checked }))} />
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
                      setOpts(o => ({ ...o, tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) }))
                    }
                  />
                </div>
                <div className="opt-row">
                  <label>Workflow (optional)</label>
                  <select className="select" value={opts.workflowId || ""} onChange={(e) => setOpts(o => ({ ...o, workflowId: e.target.value || undefined }))}>
                    <option value="">(none)</option>
                    {workflows.filter(w => w.status !== "draft").map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <div className="mini-hint">You can attach a workflow later; this is just a shortcut.</div>
                </div>
              </div>
            )}

            {/* Step 4 - review */}
            {step >= 4 && (
              <div className="review">
                <div className="section-title">Import Summary</div>
                <div className="kv">
                  <div>File:</div><div className="mono">{file?.name}</div>
                  <div>Total rows:</div><div className="mono">{totalRows}</div>
                  <div>Mapped fields:</div>
                  <div>
                    <ul className="bul">
                      {Object.entries(mapping).filter(([,v]) => v).map(([k,v]) => (
                        <li key={k}><span className="mono">{v}</span> → <strong>{k}</strong></li>
                      ))}
                      {!Object.values(mapping).filter(Boolean).length && <li>(none)</li>}
                    </ul>
                  </div>
                  <div>Workflow:</div><div>{opts.workflowId ? (workflows.find(w => w.id === opts.workflowId)?.name || "(selected)") : "(none)"}</div>
                  <div>Tags for all:</div><div>{(opts.tags?.length ? opts.tags.join(", ") : "(none)")}</div>
                </div>

                <div className="info">
                  Phone numbers will be normalized to E.164 (e.g., +12125551234). Invalid numbers are skipped. Emails are checked with a simple pattern.
                </div>
              </div>
            )}

            {/* footer actions */}
            <div className="sheet-foot">
              <button className="btn-outline" onClick={() => setOpen(false)} disabled={wip}>Cancel</button>
              {step === 1 && <button className="btn-primary" onClick={() => setStep(2)} disabled={!fileHeaders.length}>Next</button>}
              {step === 2 && <button className="btn-primary" onClick={() => setStep(3)} disabled={!mappingValid || wip}>Next</button>}
              {step === 3 && <button className="btn-primary" onClick={() => setStep(4)} disabled={!mappingValid || wip}>Next</button>}
              {step === 4 && (
                <button
                  className="btn-primary"
                  onClick={async () => {
                    try { await importToServer(); setOpen(false); }
                    catch (e: any) { setErr(e?.message || "Import failed"); }
                    finally { setWip(false); }
                  }}
                  disabled={!mappingValid || wip}
                >
                  {wip ? "Importing…" : "Import Contacts"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* styles (scoped) */}
      <style>{`
        .p-uploads { padding: 14px; }
        .crumbs { display:flex; gap:8px; align-items:center; color: var(--text-secondary); margin-bottom:10px; }
        .crumb-back{ background:none;border:0;color:inherit;cursor:pointer;padding:0; }
        .uploads-head .title { font-weight:750; }

        .dropcard{
          display:grid; place-items:center; text-align:center;
          margin-top:10px; padding:28px 10px; border:1px dashed var(--line);
          border-radius:12px; background: color-mix(in srgb, var(--surface-1) 96%, var(--line));
          cursor:pointer; transition: border-color .15s, background .15s;
        }
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
        .pill.success{ background: #daf5e6; color:#0a7e3d; }
        .pill.partial{ background:#fff3d6; color:#9a6b00; }
        .pill.failed{ background:#ffe1e1; color:#b91c1c; }
        .link{ background:none;border:0;color:var(--accent); cursor:default; }

        .modal{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:grid; place-items:center; z-index:70; }
        .sheet{ width:min(980px, 96vw); background:var(--surface-1); border:1px solid var(--line); border-radius:14px; box-shadow:0 18px 60px rgba(0,0,0,.2); }
        .sheet-head{ display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid var(--line); }
        .w-title{ font-weight:750; }
        .icon-btn{ background:none; border:0; padding:6px 8px; cursor:pointer; opacity:.8; }

        .steps{ display:flex; align-items:center; gap:6px; padding:10px 14px; border-bottom:1px dashed var(--line); color:var(--text-secondary); }
        .step{ width:18px; height:18px; border-radius:999px; display:grid; place-items:center; border:1px solid var(--line); font-size:12px; }
        .step.on{ background: color-mix(in srgb, var(--accent) 20%, transparent); border-color: var(--accent); color: var(--accent-contrast, #000); }
        .step-label{ margin-right:6px; font-size:12px; }
        .chev{ opacity:.6; margin:0 2px; }

        .s1{ padding:12px 14px; }
        .filebadge{ font-size:14px; margin-bottom:10px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .filebadge .tag{ font-size:12px; color: var(--text-secondary); border:1px solid var(--line); padding:2px 6px; border-radius:999px; }
        .preview .p-head{ font-weight:700; margin:6px 0; }
        .p-grid{ max-height:240px; overflow:auto; border:1px solid var(--line); border-radius:8px; }
        .p-row{ display:grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); border-top:1px solid var(--line); }
        .p-row--head{ position:sticky; top:0; background: color-mix(in srgb, var(--surface-1) 92%, var(--line)); font-weight:700; }
        .p-cell{ padding:8px 10px; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .map{ padding:12px 14px; display:grid; gap:10px; }
        .map-grid-2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .map-row label{ display:block; font-size:12px; color: var(--text-secondary); margin-bottom:4px; }
        .select{ width:100%; border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:10px; padding:10px 12px; }
        .hint{ font-size:12px; color:#9a6b00; background:#fff6db; border:1px solid #f7e7b2; padding:8px 10px; border-radius:8px; }

        .cfg{ padding:12px 14px; display:grid; gap:12px; }
        .opt-row{ display:grid; gap:6px; }
        .chk{ display:flex; align-items:center; gap:8px; }
        .text{ border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:10px; padding:10px 12px; }
        .mini-hint{ font-size:12px; color: var(--text-secondary); }

        .review{ padding:12px 14px; }
        .section-title{ font-weight:700; margin-bottom:8px; }
        .kv{ display:grid; grid-template-columns: 160px 1fr; gap:8px 12px; align-items:start; }
        .bul{ margin:0; padding-left:18px; }
        .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }

        .sheet-foot{ display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--line); }
        .btn-outline{ background:transparent; border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
        .btn-primary{ background: var(--accent); color: var(--accent-contrast, #fff); border:0; border-radius:10px; padding:10px 12px; }
        .err{ margin:10px 14px; color:#b91c1c; background:#ffe8e8; border:1px solid #f7b3b3; padding:8px 10px; border-radius:8px; }
      `}</style>
    </div>
  );
}

/* ---------------- small mapping row component ---------------- */
function MapRow({
  label, headers, value, onChange, placeholder, show = true,
}: {
  label: string; headers: string[]; value: string;
  onChange: (v: string) => void; placeholder?: string; show?: boolean;
}) {
  if (!show) return null;
  return (
    <div className="map-row">
      <label>{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder || "(none)"}</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}

/* ------------------- icon ------------------- */
function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v14" /><path d="M7 8l5-5 5 5" /><path d="M5 21h14" />
    </svg>
  );
}

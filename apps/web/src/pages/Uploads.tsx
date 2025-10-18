import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
// adjust the import path if your api file lives somewhere else
import { listWorkflows } from "../lib/api";

type Status = "success" | "partial" | "failed";
type Row = {
  id: string;
  name: string;
  size: number;
  at: string;           // ISO
  leads: number;
  duplicates: number;
  invalids: number;
  status: Status;
  note?: string;
};

type Mapping = {
  name?: string;
  first?: string;
  last?: string;
  email?: string;
  phone?: string;
  tags?: string;
  note?: string;
};

type ImportOptions = {
  ignoreDuplicates?: boolean;
  tags?: string[];
  workflowId?: string; // optional – sent to server, can be wired later
};

type Workflow = { id: string; name: string; status: string; createdAt: string; updatedAt: string };

/* ----------------------- header normalization (client) ---------------------- */
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
function guessDelimiter(sample: string): string {
  const cand = [",", ";", "\t", "|"] as const;
  const lines = sample.split(/\r?\n/).slice(0, 8);
  let best: string = cand[0];
  let bestScore = -1;
  for (const ch of cand) {
    const counts = lines.map((l) => (l.match(new RegExp(ch, "g")) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > bestScore) { bestScore = score; best = ch; }
  }
  return best;
}

/* -------------------------------- page --------------------------------- */
export default function Uploads() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // wizard state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileHeadersNormalized, setFileHeadersNormalized] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [opts, setOpts] = useState<ImportOptions>({ ignoreDuplicates: false, tags: [] });
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [wip, setWip] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // small helper for table
  const fmtBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 ** 2).toFixed(1)} MB`;
  };

  /* ------------------------------ file -> text ------------------------------ */
  const readText = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => resolve(String(fr.result || "")); // always string
      fr.readAsText(f);
    });

  /* ----------------------------- parse preview ----------------------------- */
  const parsePreview = async (f: File) => {
    const text = await readText(f);
    const delim = guessDelimiter(text);
    const lines = text.split(/\r?\n/);
    // allow trailing blank
    const effectiveLines = lines.filter((ln, i) => (i === lines.length - 1 ? ln.trim() !== "" : true));
    if (!effectiveLines.length) throw new Error("Empty file");

    // headers
    const rawHeaders = effectiveLines[0].split(delim).map((h) => String(h).replace(/\uFEFF/g, "").trim());
    const normalized = rawHeaders.map(normalizeHeader);

    setFileHeaders(rawHeaders);
    setFileHeadersNormalized(normalized);

    // sample rows (first 7 after header)
    const samples = effectiveLines.slice(1, 8).map((ln) => ln.split(delim));
    setSampleRows(samples);

    // initial auto-map only to headers that truly exist
    const idxOf = (canon: string) => {
      const idx = normalized.indexOf(canon);
      return idx >= 0 ? rawHeaders[idx] : "";
    };
    const guess: Mapping = {
      name: idxOf("name"),
      first: idxOf("first"),
      last: idxOf("last"),
      email: idxOf("email"),
      phone: idxOf("phone"),
      tags: idxOf("tags"),
      note: idxOf("note"),
    };
    setMapping((m) => ({ ...guess, ...m }));
  };

  /* ------------------------- only show mappable fields ---------------------- */
  const detectedSet = useMemo(() => new Set(fileHeadersNormalized), [fileHeadersNormalized]);
  const has = useCallback((canon: string) => detectedSet.has(canon), [detectedSet]);

  const showName = true;                            // always show name controls (premium UX)
  const showFirst = has("first") || !mapping.name;  // show First/Last if user isn’t using Name
  const showLast  = has("last")  || !mapping.name;
  const showEmail = has("email");
  const showPhone = has("phone");
  const showTags  = has("tags");
  const showNote  = has("note");

  /* ----------------------------- send to server ---------------------------- */
  const importToServer = async () => {
    if (!file) return;
    setWip(true);
    setErr(null);

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
    setRows((r) => [newRow, ...r]);
  };

  /* ------------------------------- handlers -------------------------------- */
  const beginWizard = async (f: File) => {
    setFile(f);
    setStep(1);
    setOpen(true);
    setErr(null);
    try {
      await parsePreview(f);
      setStep(2);
      // fetch workflows in parallel (for step 3)
      listWorkflows().then(setWorkflows).catch(() => setWorkflows([]));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to read file.";
      setErr(msg);
    }
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      await beginWizard(files[0]);
    },
    []
  );

  // drag & drop
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };

  // mapping validity
  const mappingValid = useMemo(() => {
    const hasName = !!(mapping.name || (mapping.first && mapping.last));
    const hasKey = !!(mapping.email || mapping.phone);
    return hasName && hasKey;
  }, [mapping]);

  // esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !wip) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wip]);

  // compute total rows quickly for summary
  const totalRowsPreview = useMemo(() => {
    // preview only knows first 7 — but we can estimate by reading file text length if needed
    // keep it simple: show “unknown” until server returns — or count lines fast
    return sampleRows.length ? "…" : "…";
  }, [sampleRows]);

  /* -------------------------------- render --------------------------------- */
  return (
    <div className="p-uploads">
      {/* breadcrumb */}
      <div className="crumbs">
        <button className="crumb-back" onClick={() => nav("/dashboard")}>← Dashboard</button>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Uploads</span>
      </div>

      {/* title */}
      <div className="uploads-head"><div className="title">Uploads</div></div>

      {/* drop zone card */}
      <label
        className={`dropcard ${dragOver ? "drag" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        aria-label="Upload leads CSV or JSON"
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

      {/* history table */}
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

      {/* -------- wizard modal -------- */}
      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet" aria-labelledby="w-title">
            <div className="sheet-head">
              <div id="w-title" className="w-title">Upload csv file</div>
              <button className="icon-btn" aria-label="Close" disabled={wip} onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="steps">
              <span className={`step ${step >= 1 ? "on" : ""}`}>1</span><span className="step-label">Select CSV file</span><span className="chev">›</span>
              <span className={`step ${step >= 2 ? "on" : ""}`}>2</span><span className="step-label">Map columns</span><span className="chev">›</span>
              <span className={`step ${step >= 3 ? "on" : ""}`}>3</span><span className="step-label">Configure</span><span className="chev">›</span>
              <span className={`step ${step >= 4 ? "on" : ""}`}>4</span><span className="step-label">Review</span>
            </div>

            {err && <div className="err">{err}</div>}

            {/* step 1 preview */}
            {step === 1 && (
              <div className="s1">
                <div className="filebadge">
                  <strong>{file?.name}</strong>
                  {!!file && <span> · {fmtBytes(file.size)}</span>}
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

            {/* step 2 mapping – only show fields detected (plus required ones) */}
            {step === 2 && (
              <div className="map">
                {showName && (
                  <div className="map-row">
                    <label>Name</label>
                    <Select headers={fileHeaders} value={mapping.name || ""} onChange={(v) => setMapping((m) => ({ ...m, name: v }))} placeholder="(optional if First+Last)" />
                  </div>
                )}

                <div className="map-grid-2">
                  {showFirst && (
                    <div className="map-row">
                      <label>First name</label>
                      <Select headers={fileHeaders} value={mapping.first || ""} onChange={(v) => setMapping((m) => ({ ...m, first: v }))} />
                    </div>
                  )}
                  {showLast && (
                    <div className="map-row">
                      <label>Last name</label>
                      <Select headers={fileHeaders} value={mapping.last || ""} onChange={(v) => setMapping((m) => ({ ...m, last: v }))} />
                    </div>
                  )}
                </div>

                <div className="map-grid-2">
                  {showEmail && (
                    <div className="map-row">
                      <label>Email</label>
                      <Select headers={fileHeaders} value={mapping.email || ""} onChange={(v) => setMapping((m) => ({ ...m, email: v }))} />
                    </div>
                  )}
                  {showPhone && (
                    <div className="map-row">
                      <label>Phone</label>
                      <Select headers={fileHeaders} value={mapping.phone || ""} onChange={(v) => setMapping((m) => ({ ...m, phone: v }))} />
                    </div>
                  )}
                </div>

                <div className="map-grid-2">
                  {showTags && (
                    <div className="map-row">
                      <label>Tags (per row)</label>
                      <Select headers={fileHeaders} value={mapping.tags || ""} onChange={(v) => setMapping((m) => ({ ...m, tags: v }))} placeholder="(optional)" />
                    </div>
                  )}
                  {showNote && (
                    <div className="map-row">
                      <label>Note</label>
                      <Select headers={fileHeaders} value={mapping.note || ""} onChange={(v) => setMapping((m) => ({ ...m, note: v }))} placeholder="(optional)" />
                    </div>
                  )}
                </div>

                {!mappingValid && (
                  <div className="hint">
                    Map either <strong>Name</strong> or <strong>First+Last</strong>, and at least one of <strong>Email</strong> or <strong>Phone</strong>.
                  </div>
                )}
              </div>
            )}

            {/* step 3 options */}
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
                  <label>Send new leads to workflow (optional)</label>
                  <select
                    className="select"
                    value={opts.workflowId || ""}
                    onChange={(e) => setOpts((o) => ({ ...o, workflowId: e.target.value || undefined }))}
                  >
                    <option value="">(none)</option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <div className="mini-hint">This value is included in the request; wire server-side start later.</div>
                </div>
              </div>
            )}

            {/* step 4 review (OnlySales-style) */}
            {step === 4 && (
              <div className="review">
                <div className="rev-title">Import Summary</div>
                <div className="rev-grid">
                  <div>File:</div><div className="muted">{file?.name}</div>
                  <div>Total rows (approx):</div><div className="muted">{totalRowsPreview}</div>
                  <div>Mapped fields:</div>
                  <div className="muted">
                    {["name","first","last","email","phone","tags","note"]
                      .filter((k) => (mapping as any)[k])
                      .map((k) => `${labelFor(k as keyof Mapping)} → ${(mapping as any)[k]}`)
                      .join(" • ") || "(none)"}
                  </div>
                  <div>Global tags:</div><div className="muted">{(opts.tags || []).join(", ") || "(none)"}</div>
                  <div>Workflow:</div><div className="muted">{workflows.find(w => w.id === opts.workflowId)?.name || "(none)"}</div>
                </div>

                <ul className="rev-bullets">
                  <li>Phone numbers will be normalized to E.164 (US numbers auto-prefixed).</li>
                  <li>Duplicate detection is per-owner on email/phone. In-file duplicates can be ignored.</li>
                </ul>
              </div>
            )}

            {/* footer */}
            <div className="sheet-foot">
              <button className="btn-outline" onClick={() => setOpen(false)} disabled={wip}>Cancel</button>

              {step === 1 && (
                <button className="btn-primary" onClick={() => setStep(2)} disabled={!fileHeaders.length || wip}>
                  Next
                </button>
              )}
              {step === 2 && (
                <button className="btn-primary" onClick={() => setStep(3)} disabled={!mappingValid || wip}>
                  Next
                </button>
              )}
              {step === 3 && (
                <button className="btn-primary" onClick={() => setStep(4)} disabled={!mappingValid || wip}>
                  Review
                </button>
              )}
              {step === 4 && (
                <button
                  className="btn-primary"
                  onClick={async () => {
                    try {
                      await importToServer();
                      setOpen(false);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : "Import failed";
                      setErr(msg);
                    } finally {
                      setWip(false);
                    }
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

      {/* scoped styles */}
      <style>{`
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
        .pill.success{ background: #daf5e6; color:#0a7e3d; }
        .pill.partial{ background:#fff3d6; color:#9a6b00; }
        .pill.failed{ background:#ffe1e1; color:#b91c1c; }
        .link{ background:none;border:0;color:var(--accent); cursor:default; }

        /* modal */
        .modal{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:grid; place-items:center; z-index:70; }
        .sheet{ width:min(920px, 92vw); background:var(--surface-1); border:1px solid var(--line); border-radius:12px; box-shadow:0 18px 60px rgba(0,0,0,.2); }
        .sheet-head{ display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid var(--line); }
        .w-title{ font-weight:750; }
        .icon-btn{ background:none; border:0; padding:6px 8px; cursor:pointer; opacity:.8; }
        .steps{ display:flex; align-items:center; gap:6px; padding:10px 14px; border-bottom:1px dashed var(--line); color:var(--text-secondary); }
        .step{ width:18px; height:18px; border-radius:999px; display:grid; place-items:center; border:1px solid var(--line); font-size:12px; }
        .step.on{ background: color-mix(in srgb, var(--accent) 20%, transparent); border-color: var(--accent); color: var(--accent-contrast, #000); }
        .step-label{ margin-right:6px; font-size:12px; }
        .chev{ opacity:.6; margin:0 2px; }

        .s1{ padding:12px 14px; }
        .filebadge{ font-size:14px; margin-bottom:10px; }
        .preview .p-head{ font-weight:700; margin:6px 0; }
        .p-grid{ max-height:240px; overflow:auto; border:1px solid var(--line); border-radius:8px; }
        .p-row{ display:grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); border-top:1px solid var(--line); }
        .p-row--head{ position:sticky; top:0; background: color-mix(in srgb, var(--surface-1) 92%, var(--line)); font-weight:700; }
        .p-cell{ padding:8px 10px; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .map{ padding:12px 14px; display:grid; gap:10px; }
        .map-grid-2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .map-row label{ display:block; font-size:12px; color:var(--text-secondary); margin-bottom:4px; }
        .select{ width:100%; border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:8px; padding:8px 10px; }

        .cfg{ padding:12px 14px; display:grid; gap:12px; }
        .opt-row{ display:grid; gap:6px; }
        .chk{ display:flex; align-items:center; gap:8px; }
        .text{ border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:8px; padding:8px 10px; }

        .hint{ font-size:12px; color:#9a6b00; background:#fff6db; border:1px solid #f7e7b2; padding:8px 10px; border-radius:8px; margin-top:4px; }
        .mini-hint{ font-size:12px; color: var(--text-secondary); }

        .review{ padding:12px 14px; display:grid; gap:10px; }
        .rev-title{ font-weight:700; }
        .rev-grid{ display:grid; grid-template-columns: 180px 1fr; gap:8px 12px; }
        .rev-grid .muted{ color: var(--text-secondary); }
        .rev-bullets{ margin: 6px 0 0 18px; color: var(--text-secondary); }

        .sheet-foot{ display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--line); }
        .btn-outline{ background:transparent; border:1px solid var(--line); border-radius:10px; padding:8px 12px; }
        .btn-primary{ background: var(--accent); color: var(--accent-contrast, #fff); border:0; border-radius:10px; padding:8px 12px; transition: transform .08s; }
        .btn-primary:active{ transform: translateY(1px); }
        .err{ margin:10px 14px; color:#b91c1c; background:#ffe8e8; border:1px solid #f7b3b3; padding:8px 10px; border-radius:8px; }
      `}</style>
    </div>
  );
}

/* -------------------------- tiny select component -------------------------- */
function Select({
  headers,
  value,
  onChange,
  placeholder,
}: {
  headers: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || "(none)"}</option>
      {headers.map((h) => (
        <option key={h} value={h}>{h}</option>
      ))}
    </select>
  );
}

/* simple outline upload icon */
function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v14" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

/* util */
function labelFor(k: keyof Mapping) {
  switch (k) {
    case "name": return "Name";
    case "first": return "First";
    case "last": return "Last";
    case "email": return "Email";
    case "phone": return "Phone";
    case "tags": return "Tags";
    case "note": return "Note";
  }
}

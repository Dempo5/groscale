// apps/web/src/pages/Uploads.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listWorkflows } from "../lib/api"; // adjust path if needed

/* ------------------------------------------------------------------ Types */
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
  workflowId?: string | null;
};

type WorkflowLite = { id: string; name: string; status: "draft" | "active" | "paused"; };

/* --------------------------------------------------------- Header helpers */
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
  let best: string = cand[0], bestScore = -1;
  for (const ch of cand) {
    const counts = lines.map((l) => (l.match(new RegExp(ch, "g")) || []).length);
    const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > bestScore) { bestScore = score; best = ch; }
  }
  return best;
}

/* -------------------------------------------------------------- Component */
export default function Uploads() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // history table
  const [rows, setRows] = useState<Row[]>([]);

  // DnD
  const [dragOver, setDragOver] = useState(false);

  // Wizard state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [wip, setWip] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // File + preview
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>("");
  const [delimiter, setDelimiter] = useState<string>(",");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [normHeaders, setNormHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [estimatedRows, setEstimatedRows] = useState<number>(0);

  // Mapping + options
  const [mapping, setMapping] = useState<Mapping>({});
  const [opts, setOpts] = useState<ImportOptions>({ ignoreDuplicates: false, tags: [], workflowId: null });

  // Workflows
  const [workflows, setWorkflows] = useState<WorkflowLite[]>([]);

  useEffect(() => {
    // load workflows for step 3 (configure)
    listWorkflows().then((items) => {
      const cleaned = (items || []).map((w: any) => ({ id: w.id, name: w.name, status: w.status }));
      setWorkflows(cleaned);
    }).catch(() => setWorkflows([]));
  }, []);

  const fmtBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 ** 2).toFixed(1)} MB`;
  };

  const readText = (f: File) => new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => resolve(String(fr.result || ""));
    fr.readAsText(f);
  });

  async function beginWizard(f: File) {
    setFile(f);
    setOpen(true);
    setStep(1);
    setErr(null);

    const text = await readText(f);
    setRawText(text);
    const delim = guessDelimiter(text);
    setDelimiter(delim);

    const lines = text.split(/\r?\n/);
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    setEstimatedRows(Math.max(nonEmpty.length - 1, 0));

    if (!nonEmpty.length) {
      setErr("Empty file.");
      return;
    }
    const headers = nonEmpty[0].split(delim).map((h) => String(h).replace(/\uFEFF/g, "").trim());
    const normalized = headers.map(normalizeHeader);
    setRawHeaders(headers);
    setNormHeaders(normalized);

    // collect 6 sample lines
    const samples = nonEmpty.slice(1, 7).map((ln) => ln.split(delim));
    setPreviewRows(samples);

    // initial guess mapping
    const find = (canon: string) => {
      const i = normalized.indexOf(canon);
      return i >= 0 ? headers[i] : "";
    };
    const guessed: Mapping = {
      name: find("name"),
      first: find("first"),
      last: find("last"),
      email: find("email"),
      phone: find("phone"),
      tags: find("tags"),
      note: find("note"),
    };
    setMapping(guessed);

    // jump to next step if we already satisfy the minimum rule
    const valid = mappingValid(guessed);
    setStep(valid ? 3 : 2);
  }

  function mappingValid(m: Mapping) {
    const hasName = !!(m.name || (m.first && m.last));
    const hasKey = !!(m.email || m.phone);
    return hasName && hasKey;
  }

  // options helpers
  const availableHeaders = useMemo(() => rawHeaders.filter(Boolean), [rawHeaders]);
  const canNextFromMap = mappingValid(mapping);

  async function importToServer() {
    if (!file) return;
    setWip(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mapping", JSON.stringify(mapping));
      form.append("options", JSON.stringify({
        ignoreDuplicates: !!opts.ignoreDuplicates,
        tags: opts.tags || [],
        workflowId: opts.workflowId || undefined,
      }));

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

      setRows((r) => [{
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        at: new Date().toISOString(),
        leads: inserted,
        duplicates: dups,
        invalids,
        status,
        note,
      }, ...r]);

      setOpen(false);
    } catch (e: any) {
      setErr(e?.message || "Import failed.");
    } finally {
      setWip(false);
    }
  }

  // DnD handlers
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length) beginWizard(files[0]);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };

  /* --------------------------------------------------------------- Render */
  return (
    <div className="p-uploads">
      {/* breadcrumbs */}
      <div className="crumbs">
        <button className="crumb-back" onClick={() => nav("/dashboard")}>← Dashboard</button>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Uploads</span>
      </div>

      {/* Title */}
      <div className="uploads-head">
        <div className="title">Uploads</div>
      </div>

      {/* Drop zone */}
      <label
        className={`dropcard ${dragOver ? "drag" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) beginWizard(f);
          }}
        />
        <UploadIcon className={`upl-icon ${dragOver ? "breathe" : ""}`} />
        <div className="drop-head">Drop CSV or JSON</div>
        <div className="drop-sub">Click to browse • Max 50 MB • UTF-8 • Headers required</div>
      </label>
      <div className="drop-helper">CSV or JSON • Click to browse</div>

      {/* History */}
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
                        <span className="fname">{r.name}</span><span className="fmeta">· {fmtBytes(r.size)}</span>
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

      {/* ----------------------------- Wizard Modal -------------------------- */}
      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <div className="w-title">Upload csv file</div>
              <button
                className="icon-btn"
                aria-label="Close"
                disabled={wip}
                onClick={() => setOpen(false)}
              >✕</button>
            </div>

            <div className="steps">
              <Crumb num={1} on step={step} label="Select CSV file" />
              <Crumb num={2} step={step} label="Map columns" />
              <Crumb num={3} step={step} label="Configure" />
              <Crumb num={4} step={step} label="Review" />
              <div className="spacer" />
              <div className="meta">
                {delimiter && <span className="meta-chip">Delimiter: <strong>{delimiter}</strong></span>}
                {estimatedRows > 0 && <span className="meta-chip">Rows: <strong>{estimatedRows}</strong></span>}
              </div>
            </div>

            {err && <div className="err">{err}</div>}

            {/* Step 1: preview */}
            {step === 1 && (
              <div className="s1">
                <div className="filebadge">
                  <strong>{file?.name}</strong>{file && <span> · {fmtBytes(file.size)}</span>}
                </div>
                {!!rawHeaders.length && (
                  <div className="preview">
                    <div className="p-head">Preview</div>
                    <div className="p-grid">
                      <div className="p-row p-row--head">
                        {rawHeaders.map((h, i) => <div key={i} className="p-cell">{h}</div>)}
                      </div>
                      {previewRows.map((r, ri) => (
                        <div key={ri} className="p-row">
                          {r.map((c, ci) => <div key={ci} className="p-cell">{c}</div>)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: mapping */}
            {step === 2 && (
              <div className="map">
                <div className="map-row">
                  <label>Name <span className="muted">(optional if First+Last)</span></label>
                  <HeaderSelect
                    headers={availableHeaders}
                    value={mapping.name || ""}
                    onChange={(v) => setMapping((m) => ({ ...m, name: v }))}
                    placeholder="(none)"
                    allowNone
                  />
                </div>

                <div className="map-grid-2">
                  <div className="map-row">
                    <label>First name</label>
                    <HeaderSelect
                      headers={availableHeaders}
                      value={mapping.first || ""}
                      onChange={(v) => setMapping((m) => ({ ...m, first: v }))}
                      allowNone
                    />
                  </div>
                  <div className="map-row">
                    <label>Last name</label>
                    <HeaderSelect
                      headers={availableHeaders}
                      value={mapping.last || ""}
                      onChange={(v) => setMapping((m) => ({ ...m, last: v }))}
                      allowNone
                    />
                  </div>
                </div>

                <div className="map-grid-2">
                  <div className="map-row">
                    <label>Email</label>
                    <HeaderSelect
                      headers={availableHeaders}
                      value={mapping.email || ""}
                      onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
                      allowNone
                    />
                  </div>
                  <div className="map-row">
                    <label>Phone</label>
                    <HeaderSelect
                      headers={availableHeaders}
                      value={mapping.phone || ""}
                      onChange={(v) => setMapping((m) => ({ ...m, phone: v }))}
                      allowNone
                    />
                  </div>
                </div>

                <div className="map-grid-2">
                  <div className="map-row">
                    <label>Tags (per row)</label>
                    <HeaderSelect
                      headers={availableHeaders}
                      value={mapping.tags || ""}
                      onChange={(v) => setMapping((m) => ({ ...m, tags: v }))}
                      allowNone
                    />
                  </div>
                  <div className="map-row">
                    <label>Note</label>
                    <HeaderSelect
                      headers={availableHeaders}
                      value={mapping.note || ""}
                      onChange={(v) => setMapping((m) => ({ ...m, note: v }))}
                      allowNone
                    />
                  </div>
                </div>

                {!canNextFromMap && (
                  <div className="hint">
                    Map either <strong>Name</strong> or <strong>First+Last</strong>, and at least one of <strong>Email</strong> or <strong>Phone</strong>.
                  </div>
                )}
              </div>
            )}

            {/* Step 3: configure */}
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
                  <label>Start a workflow <span className="muted">(optional)</span></label>
                  <select
                    className="select"
                    value={opts.workflowId || ""}
                    onChange={(e) => setOpts((o) => ({ ...o, workflowId: e.target.value || null }))}
                  >
                    <option value="">(none)</option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.status !== "active" ? `· ${w.status}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Step 4: review */}
            {step === 4 && (
              <div className="review">
                <div className="rev-card">
                  <div className="rev-title">Import Summary</div>
                  <div className="rev-grid">
                    <div className="rev-row"><span>File:</span><strong>{file?.name}</strong></div>
                    <div className="rev-row"><span>Total rows:</span><strong>{estimatedRows}</strong></div>
                    <div className="rev-row"><span>Mapped fields:</span>
                      <strong>
                        {["name","first","last","email","phone","tags","note"]
                          .filter((k) => (mapping as any)[k])
                          .map((k) => `${k} → ${(mapping as any)[k]}`)
                          .join(", ") || "—"}
                      </strong>
                    </div>
                    <div className="rev-row"><span>Workflow:</span>
                      <strong>{workflows.find((w) => w.id === opts.workflowId)?.name || "—"}</strong>
                    </div>
                    <div className="rev-row"><span>Global tags:</span>
                      <strong>{(opts.tags || []).join(", ") || "—"}</strong>
                    </div>
                    <div className="rev-row"><span>Ignore in-file dupes:</span><strong>{opts.ignoreDuplicates ? "Yes" : "No"}</strong></div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer controls */}
            <div className="sheet-foot">
              <button className="btn-outline" onClick={() => setOpen(false)} disabled={wip}>Cancel</button>

              {step === 1 && (
                <button className="btn-primary" onClick={() => setStep(2)} disabled={!rawHeaders.length || wip}>
                  Next
                </button>
              )}
              {step === 2 && (
                <button className="btn-primary" onClick={() => setStep(3)} disabled={!canNextFromMap || wip}>
                  Next
                </button>
              )}
              {step === 3 && (
                <button className="btn-primary" onClick={() => setStep(4)} disabled={wip}>
                  Next
                </button>
              )}
              {step === 4 && (
                <button className="btn-primary" disabled={wip} onClick={async () => { await importToServer(); }}>
                  {wip ? "Importing…" : "Import Contacts"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* scoped styles — keeps your theme, adds depth/animation */}
      <style>{`
        .p-uploads { padding: 14px; }
        .crumbs { display:flex; gap:8px; align-items:center; color: var(--text-secondary); margin-bottom:10px; }
        .crumb-back{ background:none;border:0;color:inherit;cursor:pointer;padding:0; }
        .uploads-head .title { font-weight:750; }

        .dropcard{
          display:grid; place-items:center; text-align:center;
          margin-top:10px; padding:28px 10px; border:1px dashed var(--line);
          border-radius:14px; background: color-mix(in srgb, var(--surface-1) 96%, var(--line));
          cursor:pointer; transition: transform .15s, border-color .15s, box-shadow .15s, background .15s;
          box-shadow: 0 1px 0 rgba(0,0,0,.03);
        }
        .dropcard:hover{ transform: translateY(-1px); box-shadow: 0 8px 30px rgba(0,0,0,.08); }
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
        .u-table{ width:100%; border-collapse:collapse;}
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

        .modal{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:grid; place-items:center; z-index:70; animation: fade .2s ease; }
        @keyframes fade{ from{opacity:0} to{opacity:1} }
        .sheet{ width:min(980px, 94vw); background:var(--surface-1); border:1px solid var(--line); border-radius:14px; box-shadow:0 24px 80px rgba(0,0,0,.25); overflow:hidden; }
        .sheet-head{ display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid var(--line); }
        .w-title{ font-weight:750; }
        .icon-btn{ background:none; border:0; padding:6px 8px; cursor:pointer; opacity:.8; }
        .icon-btn:hover{ opacity:1; }

        .steps{ display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px dashed var(--line); color:var(--text-secondary); }
        .crumb { display:flex; align-items:center; gap:8px; }
        .step{ width:20px; height:20px; border-radius:999px; display:grid; place-items:center; border:1px solid var(--line); font-size:12px; }
        .on .step{ background: color-mix(in srgb, var(--accent) 20%, transparent); border-color: var(--accent); color: var(--accent-contrast, #000); }
        .step-label{ font-size:12px; }
        .spacer{ flex:1; }
        .meta{ display:flex; gap:8px; }
        .meta-chip{ background: color-mix(in srgb, var(--surface-1) 92%, var(--line)); border:1px solid var(--line); padding:3px 8px; border-radius:999px; font-size:12px;}

        .s1{ padding:12px 14px; }
        .filebadge{ font-size:14px; margin-bottom:10px; }
        .preview .p-head{ font-weight:700; margin:6px 0; }
        .p-grid{ max-height:280px; overflow:auto; border:1px solid var(--line); border-radius:10px; }
        .p-row{ display:grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); border-top:1px solid var(--line); }
        .p-row--head{ position:sticky; top:0; background: color-mix(in srgb, var(--surface-1) 92%, var(--line)); font-weight:700; }
        .p-cell{ padding:8px 10px; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

        .map{ padding:12px 14px; display:grid; gap:10px; }
        .map-grid-2{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .map-row label{ display:block; font-size:12px; color: var(--text-secondary); margin-bottom:4px; }
        .muted{ color: var(--text-secondary); font-weight:400; }
        .select{ width:100%; border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:10px; padding:8px 10px; }
        .hint{ font-size:12px; color:#9a6b00; background:#fff6db; border:1px solid #f7e7b2; padding:8px 10px; border-radius:10px; }

        .cfg{ padding:12px 14px; display:grid; gap:12px; }
        .opt-row{ display:grid; gap:6px; }
        .chk{ display:flex; align-items:center; gap:8px; }
        .text{ border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:10px; padding:8px 10px; }

        .review{ padding:12px 14px; }
        .rev-card{ border:1px solid var(--line); border-radius:12px; padding:12px 14px; background:var(--surface-1); }
        .rev-title{ font-weight:700; margin-bottom:8px; }
        .rev-grid{ display:grid; gap:6px; }
        .rev-row{ display:flex; justify-content:space-between; gap:12px; }
        .rev-row span{ color: var(--text-secondary); }

        .sheet-foot{ display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--line); }
        .btn-outline{ background:transparent; border:1px solid var(--line); border-radius:10px; padding:8px 12px; }
        .btn-primary{ background: var(--accent); color: var(--accent-contrast,#fff); border:0; border-radius:10px; padding:8px 12px; transition: transform .05s; }
        .btn-primary:active{ transform: translateY(1px); }
        .err{ margin:10px 14px; color:#b91c1c; background:#ffe8e8; border:1px solid #f7b3b3; padding:8px 10px; border-radius:10px; }
      `}</style>
    </div>
  );
}

/* --------------------------------- Bits --------------------------------- */
function Crumb({ num, step, label, on }: { num: 1|2|3|4; step: number; label: string; on?: boolean }) {
  const active = step >= num;
  return (
    <div className={`crumb ${active ? "on" : ""}`}>
      <span className="step">{num}</span>
      <span className="step-label">{label}</span>
      {num < 4 && <span style={{opacity:.5, margin:"0 4px"}}>›</span>}
    </div>
  );
}

function HeaderSelect({
  headers,
  value,
  onChange,
  placeholder,
  allowNone,
}: {
  headers: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowNone?: boolean;
}) {
  // Only show real headers that exist in the CSV.
  const options = headers.filter(Boolean);
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone !== false && <option value="">{placeholder || "(none)"}</option>}
      {options.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v14" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

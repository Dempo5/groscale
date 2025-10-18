// apps/web/src/pages/Uploads.tsx
import { useRef, useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/* ----------------------------- local types ----------------------------- */
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
  workflowId?: string;
};

/* ----------------------- header normalization (client) ----------------------- */
const HMAP: Record<string, string> = {
  firstname: "first", "first name": "first", first: "first",
  lastname: "last", "last name": "last", last: "last",
  name: "name", "full name": "name", fullname: "name", "contact name": "name",
  email: "email", "e-mail": "email", "email address": "email",
  phone: "phone", "phone number": "phone", mobile: "phone", cell: "phone", "cell phone": "phone", telephone: "phone", primaryphc: "phone", phone2: "phone", "primary phone": "phone",
  tags: "tags", label: "tags", labels: "tags", segments: "tags",
  note: "note", notes: "note",
  dob: "dob", "date of birth": "dob", birthday: "dob",
  city: "city", state: "state", zip: "zip", zipcode: "zip", "postal code": "zip",
  address: "address", "address 1": "address", street: "address",
};
function normalizeHeader(h: string): string {
  const k = (h || "").replace(/\uFEFF/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  return HMAP[k] || k;
}

/* ----------------------- tiny CSV ‘light’ header parser ---------------------- */
/** robust-ish delimiter guesser (same spirit as server) */
function guessDelimiter(sample: string): string {
  const cands: string[] = [",", ";", "\t", "|"];
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

/** split a single CSV line respecting quotes */
function splitCSVLine(line: string, delim: string) {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === delim && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/* ------------------------------ page component ------------------------------ */
export default function Uploads() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDrag] = useState(false);

  // wizard state
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"idle" | "map" | "config" | "review" | "importing" | "done">("idle");

  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [normalized, setNormalized] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [delimiter, setDelimiter] = useState<string>(",");
  const [rawCount, setRawCount] = useState<number>(0);

  const [mapping, setMapping] = useState<Mapping>({});
  const [opts, setOpts] = useState<ImportOptions>({ ignoreDuplicates: false, tags: [] });

  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [summary, setSummary] = useState<any>(null);

  // UI helpers
  const fmtBytes = (n: number) => n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n/1024).toFixed(1)} KB` : `${(n/1024**2).toFixed(1)} MB`;

  /* ------------------------------ read & preview ----------------------------- */
  const readText = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(f);
    });

  async function parsePreview(f: File) {
    const text = await readText(f);
    const delim = guessDelimiter(text);
    setDelimiter(delim);

    const lines = text.split(/\r?\n/).filter(Boolean);
    setRawCount(Math.max(0, lines.length - 1));

    if (lines.length === 0) throw new Error("Empty file");

    const rawHdr = splitCSVLine(lines[0], delim);
    setFileHeaders(rawHdr);
    const norm = rawHdr.map(normalizeHeader);
    setNormalized(norm);

    const samples = lines.slice(1, 8).map(ln => splitCSVLine(ln, delim));
    setSampleRows(samples);

    // auto-map: prefer (name) or (first+last), and at least one of email/phone
    const pick = (canon: string) => {
      const idx = norm.indexOf(canon);
      return idx >= 0 ? rawHdr[idx] : "";
    };
    const auto: Mapping = {
      name: pick("name"),
      first: pick("first"),
      last: pick("last"),
      email: pick("email"),
      phone: pick("phone"),
      tags: pick("tags"),
      note: pick("note"),
    };
    setMapping(auto);
  }

  /* ------------------------------- import call ------------------------------- */
  async function importToServer() {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setProgress(0);
    setNote(null);

    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    form.append("options", JSON.stringify(opts));

    // simulate progress bar
    const timer = setInterval(() => setProgress(p => Math.min(92, p + 3)), 120);

    try {
      const jwt = (() => { try { return localStorage.getItem("jwt") || ""; } catch { return ""; } })();
      const res = await fetch("/api/uploads/import", {
        method: "POST",
        body: form,
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        credentials: "include",
      });
      clearInterval(timer);

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      setProgress(100);
      setSummary(data);

      const inserted = Number(data?.inserted || 0);
      const invalids = Number(data?.invalids || 0);
      const dups = Number(data?.duplicates || 0);
      const status: Status =
        inserted > 0 && (invalids > 0 || dups > 0) ? "partial" :
        inserted > 0 ? "success" : "failed";

      const row: Row = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        at: new Date().toISOString(),
        leads: inserted,
        duplicates: dups,
        invalids,
        status,
        note:
          status === "success"
            ? `Imported ${inserted} leads.`
            : status === "partial"
              ? `Imported ${inserted}. Skipped ${dups} duplicates, ${invalids} invalid.`
              : (data?.error || "Import failed."),
      };
      setRows(r => [row, ...r]);

      setStage("done");
    } catch (e: any) {
      setErr(e?.message || "Import failed");
      setStage("review");
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------- pipeline handlers --------------------------- */
  const begin = async (f: File) => {
    setFile(f);
    setOpen(true);
    setStage("map");
    setErr(null);
    setNote(null);
    await parsePreview(f);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    await begin(files[0]);
  };

  // DnD
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDrag(false);
    handleFiles(e.dataTransfer.files);
  };

  // mapping validity gate
  const mappingValid = useMemo(() => {
    const hasName = !!(mapping.name || (mapping.first && mapping.last));
    const hasKey = !!(mapping.email || mapping.phone);
    return hasName && hasKey;
  }, [mapping]);

  /* ----------------------------------- UI ----------------------------------- */
  return (
    <div className="p-uploads">
      {/* crumbs */}
      <div className="crumbs">
        <button className="crumb-back" onClick={() => nav("/dashboard")}>← Dashboard</button>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Uploads</span>
      </div>

      {/* title */}
      <div className="uploads-head">
        <div className="title">Uploads</div>
      </div>

      {/* drop zone */}
      <label
        className={`dropcard ${dragOver ? "drag" : ""}`}
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
        onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDrag(false); }}
        role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
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

      {/* history */}
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
                {rows.map(r => (
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

      {/* ------------------------------ Import Studio ----------------------------- */}
      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="studio">
            <div className="studio-head">
              <div className="studio-title">Import Studio</div>
              <div className="studio-meta">
                <span>Delimiter: <code>{delimiter || "?"}</code></span>
                <span>Rows: <code>{rawCount}</code></span>
              </div>
              <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)} disabled={busy}>✕</button>
            </div>

            <div className="studio-body">
              {/* left rail (steps) */}
              <aside className="rail">
                <Step label="Map"      on={["map","config","review","importing","done"].includes(stage)} />
                <Step label="Configure" on={["config","review","importing","done"].includes(stage)} />
                <Step label="Review"    on={["review","importing","done"].includes(stage)} />
                <Step label="Import"    on={["importing","done"].includes(stage)} />
              </aside>

              {/* main content */}
              <main className="panel">
                {stage === "map" && (
                  <>
                    <Section title="Preview">
                      <div className="preview">
                        <div className="p-grid">
                          <div className="p-row p-row--head">
                            {fileHeaders.map((h,i) => (<div className="p-cell" key={i}>{h}</div>))}
                          </div>
                          {sampleRows.map((r,ri) => (
                            <div className="p-row" key={ri}>
                              {r.map((c,ci) => (<div className="p-cell" key={ci}>{c}</div>))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </Section>

                    <Section title="Map columns">
                      <MapGrid>
                        <MapRow label="Name (optional if First+Last)">
                          <Select headers={fileHeaders} value={mapping.name || ""} onChange={v => setMapping(m=>({ ...m, name: v }))} placeholder="(none)" />
                        </MapRow>
                        <MapRow label="First name">
                          <Select headers={fileHeaders} value={mapping.first || ""} onChange={v => setMapping(m=>({ ...m, first: v }))} />
                        </MapRow>
                        <MapRow label="Last name">
                          <Select headers={fileHeaders} value={mapping.last || ""} onChange={v => setMapping(m=>({ ...m, last: v }))} />
                        </MapRow>
                        <MapRow label="Email">
                          <Select headers={fileHeaders} value={mapping.email || ""} onChange={v => setMapping(m=>({ ...m, email: v }))} />
                        </MapRow>
                        <MapRow label="Phone">
                          <Select headers={fileHeaders} value={mapping.phone || ""} onChange={v => setMapping(m=>({ ...m, phone: v }))} />
                        </MapRow>
                        {normalized.includes("tags") && (
                          <MapRow label="Tags (per row)">
                            <Select headers={fileHeaders} value={mapping.tags || ""} onChange={v => setMapping(m=>({ ...m, tags: v }))} placeholder="(optional)" />
                          </MapRow>
                        )}
                        {normalized.includes("note") && (
                          <MapRow label="Note">
                            <Select headers={fileHeaders} value={mapping.note || ""} onChange={v => setMapping(m=>({ ...m, note: v }))} placeholder="(optional)" />
                          </MapRow>
                        )}
                      </MapGrid>

                      {!mappingValid && (
                        <div className="hint">
                          Map either <strong>Name</strong> or <strong>First+Last</strong>, and at least one of <strong>Email</strong> or <strong>Phone</strong>.
                        </div>
                      )}
                    </Section>
                  </>
                )}

                {stage === "config" && (
                  <>
                    <Section title="Configure">
                      <div className="opt-row">
                        <label className="chk">
                          <input
                            type="checkbox"
                            checked={!!opts.ignoreDuplicates}
                            onChange={(e) => setOpts(o => ({ ...o, ignoreDuplicates: e.target.checked }))}
                          />
                          Ignore duplicates within file
                        </label>
                      </div>

                      <div className="opt-row">
                        <label>Apply tags to all leads</label>
                        <Chips
                          value={opts.tags || []}
                          onChange={(tags) => setOpts(o => ({ ...o, tags }))}
                          placeholder="type and press Enter"
                        />
                      </div>

                      <div className="opt-row">
                        <label>Workflow</label>
                        <WorkflowSelect
                          value={opts.workflowId || ""}
                          onChange={(id) => setOpts(o => ({ ...o, workflowId: id || undefined }))}
                        />
                        <div className="subtle">Pick a workflow to start these leads automatically after import.</div>
                      </div>
                    </Section>
                  </>
                )}

                {stage === "review" && (
                  <>
                    <Section title="Review">
                      <div className="review">
                        <div className="review-grid">
                          <div><b>File</b></div><div>{file?.name} · {file ? fmtBytes(file.size) : ""}</div>
                          <div><b>Rows</b></div><div>{rawCount}</div>
                          <div><b>Delimiter</b></div><div><code>{delimiter}</code></div>
                          <div><b>Mapping</b></div>
                          <div>
                            <code>
                              {Object.entries(mapping)
                                .filter(([_,v]) => v)
                                .map(([k,v]) => `${k} ← ${v}`)
                                .join(" · ") || "(none)"}
                            </code>
                          </div>
                          <div><b>Options</b></div>
                          <div>
                            {opts.ignoreDuplicates ? "Ignore in-file duplicates" : "Don’t ignore in-file duplicates"}
                            { (opts.tags?.length ? ` · Tags: ${opts.tags.join(", ")}` : "") }
                            { (opts.workflowId ? ` · Workflow: ${opts.workflowId}` : "") }
                          </div>
                        </div>
                      </div>
                      {err && <div className="err">{err}</div>}
                      {note && <div className="note">{note}</div>}
                    </Section>
                  </>
                )}

                {stage === "importing" && (
                  <>
                    <Section title="Importing">
                      <div className="progress">
                        <div className="bar" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="progress-note">Importing… hang tight.</div>
                    </Section>
                  </>
                )}

                {stage === "done" && summary && (
                  <>
                    <Section title="Completed">
                      <div className="success-card">
                        <div className="check">✓</div>
                        <div className="success-title">Import Complete</div>
                        <div className="success-sub">
                          Inserted <b>{summary.inserted}</b>, duplicates skipped <b>{summary.duplicates}</b>, invalid <b>{summary.invalids}</b>.
                        </div>
                      </div>
                    </Section>
                  </>
                )}
              </main>
            </div>

            <div className="studio-foot">
              <button className="btn-outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>

              {stage === "map" && (
                <button className="btn-primary" disabled={!mappingValid || busy} onClick={() => setStage("config")}>Next</button>
              )}
              {stage === "config" && (
                <button className="btn-primary" disabled={!mappingValid || busy} onClick={() => setStage("review")}>Next</button>
              )}
              {stage === "review" && (
                <button
                  className="btn-primary"
                  disabled={!mappingValid || busy}
                  onClick={async () => { setStage("importing"); await importToServer(); }}
                >
                  {busy ? "Importing…" : "Import"}
                </button>
              )}
              {stage === "done" && (
                <button className="btn-primary" onClick={() => setOpen(false)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* styles scoped to this page */}
      <style>{STYLES}</style>
    </div>
  );
}

/* ---------------------------------- UI bits --------------------------------- */
function Step({ label, on }: { label: string; on: boolean }) {
  return (
    <div className={`rail-step ${on ? "on" : ""}`}>
      <span className="dot" />
      <span className="rl">{label}</span>
    </div>
  );
}
function Section({ title, children }: { title: string; children: any }) {
  return (
    <section className="sec">
      <div className="sec-title">{title}</div>
      {children}
    </section>
  );
}
function MapGrid({ children }: { children: any }) {
  return <div className="map-grid">{children}</div>;
}
function MapRow({ label, children }: { label: string; children: any }) {
  return (
    <div className="map-row">
      <label>{label}</label>
      <div className="map-ctl">{children}</div>
    </div>
  );
}
function Select({
  headers, value, onChange, placeholder
}: { headers: string[]; value: string; onChange: (v: string) => void; placeholder?: string; }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder || "(none)"}</option>
      {headers.map(h => (<option key={h} value={h}>{h}</option>))}
    </select>
  );
}

/* Tags as chips */
function Chips({ value, onChange, placeholder }: {
  value: string[]; onChange: (tags: string[]) => void; placeholder?: string;
}) {
  const [text, setText] = useState("");
  return (
    <div className="chips">
      {value.map((t, i) => (
        <span className="chip" key={t + i}>
          {t}
          <button className="x" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      <input
        className="chip-input"
        value={text}
        placeholder={placeholder || ""}
        onChange={e => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) {
            onChange([...value, text.trim()]);
            setText("");
          }
          if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

/* Mock workflow select — replace options with your real list */
function WorkflowSelect({ value, onChange }: { value: string; onChange: (v: string) => void; }) {
  // Replace with server-fetched workflows if available
  const workflows = [
    { id: "", name: "(none)" },
    { id: "wf_welcome", name: "Welcome drip" },
    { id: "wf_followup", name: "5-min follow-up" },
    { id: "wf_nurture", name: "Nurture (30 days)" },
  ];
  return (
    <select className="select" value={value} onChange={e => onChange(e.target.value)}>
      {workflows.map(w => (<option key={w.id || "none"} value={w.id}>{w.name}</option>))}
    </select>
  );
}

/* icon */
function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v14" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

/* --------------------------- page-scoped CSS (modern) ------------------------ */
const STYLES = `
.p-uploads{ padding:14px; }
.crumbs{ display:flex; gap:8px; align-items:center; color:var(--text-secondary); margin-bottom:10px; }
.crumb-back{ background:none;border:0;color:inherit;cursor:pointer;padding:0; }
.uploads-head .title{ font-weight:750; }

.dropcard{
  display:grid; place-items:center; text-align:center;
  margin-top:10px; padding:28px 10px; border:1px dashed var(--line);
  border-radius:14px; background: color-mix(in srgb, var(--surface-1) 96%, var(--line));
  cursor:pointer; transition: border-color .15s, background .15s, box-shadow .15s;
}
.dropcard:hover{ border-color: var(--accent); box-shadow: 0 10px 32px rgba(0,0,0,.06); }
.dropcard.drag{ border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-1)); }
.upl-icon{ width:40px; height:40px; opacity:.9; }
.upl-icon.breathe{ animation: breathe 1.2s ease-in-out infinite; }
@keyframes breathe{ 0%{ transform:scale(1);} 60%{ transform:scale(1.06);} 100%{ transform:scale(1);} }
.drop-head{ font-weight:700; margin-top:6px; }
.drop-sub{ font-size:12px; color: var(--text-secondary); }
.drop-helper{ text-align:center; color: var(--text-secondary); font-size:12px; margin:6px 0 16px; }

.card{ border:1px solid var(--line); border-radius:12px; overflow:hidden; background:var(--surface-1); }
.card-head{ padding:10px; border-bottom:1px solid var(--line); font-weight:700; }
.table-wrap{ overflow:auto; }
.u-table{ width:100%; border-collapse:collapse; }
.u-table th,.u-table td{ padding:10px; border-top:1px solid var(--line); }
.u-table th{ text-align:left; font-size:12px; color:var(--text-secondary); }
.u-table .num{ text-align:right; }
.filecell .fname{ font-weight:600; }
.filecell .fmeta{ color:var(--text-secondary); margin-left:6px; }
.empty{ color:var(--text-secondary); text-align:center; padding:36px 0; }
.empty-icon{ display:inline-block; transform: rotate(180deg); margin-right:6px; opacity:.6; }
.pill{ padding:4px 8px; border-radius:999px; font-size:12px; }
.pill.success{ background:#daf5e6; color:#0a7e3d; }
.pill.partial{ background:#fff3d6; color:#9a6b00; }
.pill.failed{ background:#ffe1e1; color:#b91c1c; }
.link{ background:none;border:0;color:var(--accent); cursor:default; }

.modal{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:grid; place-items:center; z-index:70; }
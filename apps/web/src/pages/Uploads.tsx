import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/* -------------------------------- types -------------------------------- */
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
  tags?: string[]; // extra tags applied to all rows
};

/* ----------------------- csv header normalization ---------------------- */
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
    const variance =
      counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (counts.length || 1);
    const score = avg - Math.sqrt(variance);
    if (score > bestScore) {
      bestScore = score;
      best = ch;
    }
  }
  return best;
}

/* ----------------------------- toast helper ---------------------------- */
function Toast({ kind, text, onClose }: { kind: "success" | "error"; text: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`toast ${kind}`} role="status" aria-live="polite">
      <span className="t-ico" aria-hidden>{kind === "success" ? "✓" : "!"}</span>
      <span>{text}</span>
      <button className="t-x" aria-label="Close" onClick={onClose}>×</button>
    </div>
  );
}

/* -------------------------------- page --------------------------------- */
export default function Uploads() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // wizard state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [opts, setOpts] = useState<ImportOptions>({ ignoreDuplicates: false, tags: [] });
  const [wip, setWip] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // toast
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

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
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(f);
    });

  /* ----------------------------- parse preview ----------------------------- */
  const parsePreview = async (f: File) => {
    const text = await readText(f);
    const delim = guessDelimiter(text);
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) throw new Error("Empty file");

    const rawHeaders = lines[0]
      .split(delim)
      .map((h) => String(h).replace(/\uFEFF/g, "").trim());
    setFileHeaders(rawHeaders);

    const samples = lines.slice(1, 8).map((ln) => ln.split(delim));
    setSampleRows(samples);

    const normalized = rawHeaders.map(normalizeHeader);
    const find = (canon: string) => {
      const idx = normalized.indexOf(canon);
      return idx >= 0 ? rawHeaders[idx] : "";
    };
    const guess: Mapping = {
      name: find("name"),
      first: find("first"),
      last: find("last"),
      email: find("email"),
      phone: find("phone"),
      tags: find("tags"),
      note: find("note"),
    };
    setMapping((m) => ({ ...guess, ...m }));
  };

  /* ----------------------------- send to server ---------------------------- */
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

    setToast({
      kind: status === "failed" ? "error" : "success",
      text:
        status === "failed"
          ? note
          : `Imported ${inserted} lead${inserted === 1 ? "" : "s"} • ${dups} duplicate${dups === 1 ? "" : "s"} • ${invalids} invalid`,
    });
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
    } catch (e: unknown) {
      const msg = (e as Error)?.message || "Failed to read file.";
      setErr(msg);
    }
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      const f = files[0];
      await beginWizard(f);
    },
    []
  );

  // drag & drop
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
  };

  // mapping validity
  const mappingValid = useMemo(() => {
    const hasName = !!(mapping.name || (mapping.first && mapping.last));
    const hasKey = !!(mapping.email || mapping.phone);
    return hasName && hasKey;
  }, [mapping]);

  // keyboard esc to close modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !wip) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wip]);

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
      <div className="uploads-head">
        <div className="title">Uploads</div>
      </div>

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

      {/* helper under card */}
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
                      <span
                        className={`pill ${r.status}`}
                        title={
                          r.note ||
                          (r.status === "success"
                            ? "Imported successfully."
                            : r.status === "partial"
                            ? "Some rows were invalid or duplicated."
                            : "Failed to import.")
                        }
                      >
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
          <div className="sheet">
            <div className="sheet-head">
              <div className="w-title">Upload csv file</div>
              <button className="icon-btn" aria-label="Close" disabled={wip} onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            {/* steps */}
            <div className="steps">
              <span className={`step ${step >= 1 ? "on" : ""}`}>1</span>
              <span className="step-label">Select CSV file</span>
              <span className="chev">›</span>
              <span className={`step ${step >= 2 ? "on" : ""}`}>2</span>
              <span className="step-label">Map columns</span>
              <span className="chev">›</span>
              <span className={`step ${step >= 3 ? "on" : ""}`}>3</span>
              <span className="step-label">Configure</span>
            </div>

            {err && <div className="msg error"><span className="m-ico">!</span>{err}</div>}

            {/* step 1 & preview grid */}
            {step >= 1 && (
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
                        {fileHeaders.map((h, i) => (
                          <div key={i} className="p-cell">{h}</div>
                        ))}
                      </div>
                      {sampleRows.map((r, ri) => (
                        <div key={ri} className="p-row">
                          {r.map((c, ci) => (
                            <div key={ci} className="p-cell">{c}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* step 2 mapping */}
            {step >= 2 && (
              <div className="map">
                <div className="map-row">
                  <label>Name</label>
                  <Select headers={fileHeaders} value={mapping.name || ""} onChange={(v) => setMapping((m) => ({ ...m, name: v }))} placeholder="(optional if First+Last)" />
                </div>
                <div className="map-grid-2">
                  <div className="map-row">
                    <label>First name</label>
                    <Select headers={fileHeaders} value={mapping.first || ""} onChange={(v) => setMapping((m) => ({ ...m, first: v }))} />
                  </div>
                  <div className="map-row">
                    <label>Last name</label>
                    <Select headers={fileHeaders} value={mapping.last || ""} onChange={(v) => setMapping((m) => ({ ...m, last: v }))} />
                  </div>
                </div>
                <div className="map-grid-2">
                  <div className="map-row">
                    <label>Email</label>
                    <Select headers={fileHeaders} value={mapping.email || ""} onChange={(v) => setMapping((m) => ({ ...m, email: v }))} />
                  </div>
                  <div className="map-row">
                    <label>Phone</label>
                    <Select headers={fileHeaders} value={mapping.phone || ""} onChange={(v) => setMapping((m) => ({ ...m, phone: v }))} />
                  </div>
                </div>
                <div className="map-grid-2">
                  <div className="map-row">
                    <label>Tags (per row)</label>
                    <Select headers={fileHeaders} value={mapping.tags || ""} onChange={(v) => setMapping((m) => ({ ...m, tags: v }))} placeholder="(optional)" />
                  </div>
                  <div className="map-row">
                    <label>Note</label>
                    <Select headers={fileHeaders} value={mapping.note || ""} onChange={(v) => setMapping((m) => ({ ...m, note: v }))} placeholder="(optional)" />
                  </div>
                </div>
                {!mappingValid && (
                  <div className="hint">
                    Map either <strong>Name</strong> or <strong>First+Last</strong>, and at least one of <strong>Email</strong> or <strong>Phone</strong>.
                  </div>
                )}
              </div>
            )}

            {/* step 3 options */}
            {step >= 3 && (
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
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="sheet-foot">
              <button className="btn-outline" onClick={() => setOpen(false)} disabled={wip}>Cancel</button>
              {step === 2 && (
                <button className="btn-primary" onClick={() => setStep(3)} disabled={!mappingValid || wip}>
                  Next
                </button>
              )}
              {step === 3 && (
                <button
                  className="btn-primary"
                  onClick={async () => {
                    try {
                      await importToServer();
                      setOpen(false);
                    } catch (e: unknown) {
                      const msg = (e as Error)?.message || "Import failed";
                      setErr(msg);
                      setToast({ kind: "error", text: msg });
                    } finally {
                      setWip(false);
                    }
                  }}
                  disabled={!mappingValid || wip}
                >
                  {wip ? "Importing…" : "Submit"}
                </button>
              )}
              {step === 1 && (
                <button className="btn-primary" onClick={() => setStep(2)} disabled={!fileHeaders.length}>
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}

      {/* local styles (page-scoped, no globals touched) */}
      <style>{`
        /* page */
        .p-uploads { padding: 14px; }
        .crumbs { display:flex; gap:8px; align-items:center; color: var(--text-secondary, #64748b); margin-bottom:10px; }
        .crumb-back{ background:none;border:0;color:inherit;cursor:pointer;padding:0; }
        .uploads-head .title { font-weight:750; }

        /* drop zone */
        .dropcard{
          display:grid; place-items:center; text-align:center;
          margin-top:10px; padding:30px 12px; border:1px dashed var(--line, rgba(0,0,0,.1));
          border-radius:14px; background: color-mix(in srgb, var(--surface-1, #fff) 96%, var(--line, rgba(0,0,0,.06)));
          cursor:pointer; transition: border-color .18s, background .18s, box-shadow .18s, transform .18s;
          box-shadow: 0 2px 10px rgba(0,0,0,.02);
        }
        .dropcard:hover{ transform: translateY(-1px); box-shadow: 0 8px 26px rgba(0,0,0,.06); }
        .dropcard.drag{
          border-color: var(--accent, #10b981);
          background: color-mix(in srgb, var(--accent, #10b981) 8%, var(--surface-1, #fff));
          box-shadow: 0 12px 36px rgba(16,185,129,.18);
        }
        .upl-icon{ width:44px; height:44px; opacity:.9; }
        .upl-icon.breathe{ animation: breathe 1.4s ease-in-out infinite; }
        @keyframes breathe{ 0%{ transform:scale(1); } 60%{ transform:scale(1.06);} 100%{ transform:scale(1);} }
        .drop-head{ font-weight:750; margin-top:8px; }
        .drop-sub{ font-size:12px; color: var(--text-secondary, #64748b); }
        .drop-helper{ text-align:center; color: var(--text-secondary, #64748b); font-size:12px; margin:6px 0 16px; }

        /* table */
        .card{ border:1px solid var(--line, rgba(0,0,0,.08)); border-radius:12px; overflow:hidden; background:var(--surface-1, #fff); box-shadow: 0 6px 18px rgba(0,0,0,.05); }
        .card-head{ padding:12px; border-bottom:1px solid var(--line, rgba(0,0,0,.08)); font-weight:750; }
        .table-wrap{ overflow:auto; }
        .u-table{ width:100%; border-collapse:separate; border-spacing:0; }
        .u-table thead th{ position:sticky; top:0; background: #f8fafc; }
        .u-table th, .u-table td{ padding:11px 12px; border-top:1px solid var(--line, rgba(0,0,0,.08)); }
        .u-table tbody tr:nth-child(odd){ background:#fbfdff; }
        .u-table th{ text-align:left; font-size:12px; color: var(--text-secondary, #64748b); }
        .u-table .num{ text-align:right; }
        .u-table tbody tr:hover{ background:#f3f7ff; }
        .filecell .fname{ font-weight:650; }
        .filecell .fmeta{ color: var(--text-secondary, #64748b); margin-left:6px; }
        .empty{ color: var(--text-secondary, #64748b); text-align:center; padding:36px 0; }
        .empty-icon{ display:inline-block; transform: rotate(180deg); margin-right:6px; opacity:.6; }
        .pill{ padding:4px 8px; border-radius:999px; font-size:12px; }
        .pill.success{ background: #daf5e6; color:#0a7e3d; }
        .pill.partial{ background:#fff3d6; color:#9a6b00; }
        .pill.failed{ background:#ffe1e1; color:#b91c1c; }
        .link{ background:none;border:0;color:var(--accent, #10b981); cursor:default; }

        /* modal */
        .modal{ position:fixed; inset:0; background:rgba(15,23,42,.45); display:grid; place-items:center; z-index:70; animation: fade .18s ease-out; }
        @keyframes fade { from { opacity:0 } to { opacity:1 } }
        .sheet{ width:min(960px, 94vw); background:var(--surface-1, #fff); border:1px solid var(--line, rgba(0,0,0,.08)); border-radius:14px; box-shadow:0 24px 70px rgba(0,0,0,.25); transform: translateY(8px); animation: slide .2s ease-out both; }
        @keyframes slide { to { transform: translateY(0) } }
        .sheet-head{ display:flex; justify-content:space-between; align-items:center; padding:14px; border-bottom:1px solid var(--line, rgba(0,0,0,.08)); }
        .w-title{ font-weight:800; }
        .icon-btn{ background:none; border:0; padding:6px 8px; cursor:pointer; opacity:.8; border-radius:8px; }
        .icon-btn:hover{ background:#f1f5f9; }

        /* steps */
        .steps{ display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px dashed var(--line, rgba(0,0,0,.08)); color:var(--text-secondary, #64748b); }
        .step{ width:20px; height:20px; border-radius:999px; display:grid; place-items:center; border:1px solid var(--line, rgba(0,0,0,.18)); font-size:12px; }
        .step.on{ background: color-mix(in srgb, var(--accent, #10b981) 18%, transparent); border-color: var(--accent, #10b981); color: #065f46; font-weight:700; }
        .step-label{ margin-right:4px; font-size:12px; }
        .chev{ opacity:.6; margin:0 2px; }

        /* messages */
        .msg{ margin:12px 14px; padding:10px 12px; border-radius:10px; display:flex; gap:8px; align-items:flex-start; }
        .msg.error{ color:#7f1d1d; background:#ffe8e8; border:1px solid #f7b3b3; }
        .m-ico{ font-weight:900; line-height:1; }

        /* step content */
        .s1{ padding:12px 14px; }
        .filebadge{ font-size:14px; margin-bottom:10px; }

        .preview .p-head{ font-weight:800; margin:6px 0 8px; }
        .p-grid{ max-height:260px; overflow:auto; border:1px solid var(--line, rgba(0,0,0,.08)); border-radius:10px; box-shadow: inset 0 1px 0 rgba(255,255,255,.7); }
        .p-row{ display:grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); border-top:1px solid var(--line, rgba(0,0,0,.08)); }
        .p-row--head{ position:sticky; top:0; background: #f8fafc; font-weight:700; z-index:1; }
        .p-cell{ padding:9px 10px; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .p-row:nth-child(odd){ background:#fbfdff; }

        .map{ padding:12px 14px; display:grid; gap:12px; }
        .map-grid-2{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
        .map-row label{ display:block; font-size:12px; color: var(--text-secondary, #64748b); margin-bottom:6px; font-weight:600; letter-spacing:.01em; }
        .select{ width:100%; border:1px solid var(--line, rgba(0,0,0,.08)); background:var(--surface-1, #fff); color:inherit; border-radius:10px; padding:9px 10px; transition: box-shadow .12s, border-color .12s; }
        .select:focus{ outline:0; border-color: var(--accent, #10b981); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #10b981) 28%, #0000); }
        .hint{ font-size:12px; color:#9a6b00; background:#fff6db; border:1px solid #f7e7b2; padding:9px 10px; border-radius:10px; }

        .cfg{ padding:12px 14px; display:grid; gap:12px; }
        .opt-row{ display:grid; gap:8px; }
        .chk{ display:flex; align-items:center; gap:8px; }
        .text{ border:1px solid var(--line, rgba(0,0,0,.08)); background:var(--surface-1, #fff); color:inherit; border-radius:10px; padding:9px 10px; }
        .text:focus{ outline:0; border-color: var(--accent, #10b981); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #10b981) 28%, #0000); }

        .sheet-foot{ display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--line, rgba(0,0,0,.08)); }
        .btn-outline{ background:transparent; border:1px solid var(--line, rgba(0,0,0,.12)); border-radius:12px; padding:9px 12px; }
        .btn-outline:hover{ background:#f8fafc; }
        .btn-primary{ background: var(--accent, #10b981); color: var(--accent-contrast, #fff); border:0; border-radius:12px; padding:9px 12px; transition: transform .05s; }
        .btn-primary:active{ transform: translateY(1px) scale(.995); }

        /* toast */
        .toast{ position:fixed; right:16px; bottom:16px; display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:12px; border:1px solid var(--line, rgba(0,0,0,.08)); box-shadow: 0 8px 26px rgba(0,0,0,.12); background:#fff; z-index:90; animation: pop .14s ease-out both; }
        @keyframes pop { from { transform: translateY(4px); opacity:0 } to { transform: translateY(0); opacity:1 } }
        .toast.success{ background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .toast.error{ background:#fef2f2; border-color:#fecaca; color:#7f1d1d; }
        .t-ico{ font-weight:900; }
        .t-x{ background:transparent; border:0; font-size:18px; line-height:1; margin-left:4px; cursor:pointer; opacity:.7; }
        .t-x:hover{ opacity:1; }
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

/* simple outline upload icon (fixed size via CSS) */
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadLeads, getUploadHistory } from "../lib/api"; // <- see API notes below

type UploadRow = {
  id: string;
  filename: string;
  uploadedAt: string;      // ISO
  leads: number;
  duplicates: number;
  invalids: number;
  status: "success" | "partial" | "failed";
  downloadUrl?: string | null;
};

type ImportSummary = {
  ok: boolean;
  inserted: number;
  skipped: number;
  invalids?: number;
  errors?: string[];
};

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Uploads() {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history from API (fallback to empty if API not present yet)
  useEffect(() => {
    (async () => {
      try {
        const h = await getUploadHistory(); // returns UploadRow[]
        setRows(h);
      } catch {
        setRows([]);
      }
    })();
  }, []);

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    setBusy(true);
    setSummary(null);
    try {
      const res = await uploadLeads(file); // { ok, inserted, skipped, invalids?, errors? }
      const stamp = new Date().toISOString();

      // Best guess status from server summary
      const status: UploadRow["status"] = res.ok
        ? (res.invalids || res.skipped ? "partial" : "success")
        : "failed";

      // Optimistic prepend to history
      setRows((prev) => [
        {
          id: crypto.randomUUID(),
          filename: file.name,
          uploadedAt: stamp,
          leads: (res.inserted ?? 0) + (res.skipped ?? 0) + (res.invalids ?? 0),
          duplicates: res.skipped ?? 0,
          invalids: res.invalids ?? 0,
          status,
          downloadUrl: undefined,
        },
        ...prev,
      ]);

      setSummary(res);
    } catch {
      setSummary({ ok: false, inserted: 0, skipped: 0, invalids: 0, errors: ["Upload failed"] });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = ""; // clear picker
    }
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    onFiles(e.dataTransfer?.files ?? null);
  }

  function onDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  const zoneClass = useMemo(
    () =>
      `uploads-zone ${dragOver ? "is-over" : ""} ${busy ? "is-busy" : ""}`,
    [dragOver, busy]
  );

  return (
    <div className="p-shell matte" style={{ minHeight: "100vh" }}>
      <main className="p-work grid rail-open" style={{ gridTemplateColumns: "1fr" }}>
        <section className="panel matte" style={{ padding: 16 }}>
          <div className="list-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="h">Uploads</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-outline sm" onClick={() => inputRef.current?.click()}>
                Choose file
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,application/json,text/csv,application/vnd.ms-excel"
                onChange={(e) => onFiles(e.target.files)}
                style={{ display: "none" }}
              />
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            className={zoneClass}
            onDragEnter={() => setDragOver(true)}
            onDragOver={onDrag}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            aria-label="Upload CSV or JSON by dropping here or click to choose a file"
          >
            <div className="uploads-zone__icon">
              <Icon d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" size={22} />
            </div>
            <div className="uploads-zone__text">
              <div className="uploads-zone__title">Drop a CSV or JSON file</div>
              <div className="uploads-zone__hint">or click to browse</div>
            </div>
          </div>

          {/* Result summary (subtle, flat) */}
          {summary && (
            <div className="uploads-summary">
              <div className="uploads-summary__row">
                <span>Inserted</span>
                <strong>{summary.inserted}</strong>
              </div>
              <div className="uploads-summary__row">
                <span>Duplicates</span>
                <strong>{summary.skipped ?? 0}</strong>
              </div>
              <div className="uploads-summary__row">
                <span>Invalids</span>
                <strong>{summary.invalids ?? 0}</strong>
              </div>
              {!summary.ok && (
                <div className="uploads-summary__error">
                  {summary.errors?.[0] ?? "Upload failed"}
                </div>
              )}
            </div>
          )}

          {/* History */}
          <div className="uploads-history">
            <div className="uploads-history__head">Upload history</div>

            <div className="uploads-table">
              <div className="uploads-table__row uploads-table__row--head">
                <div>File</div>
                <div>Date/Time</div>
                <div className="num">Leads</div>
                <div className="num">Dupes</div>
                <div className="num">Invalid</div>
                <div>Status</div>
                <div className="act" aria-hidden />
              </div>

              {rows.length ? (
                rows.map((r) => (
                  <div key={r.id} className="uploads-table__row">
                    <div className="filecell" title={r.filename}>
                      <Icon d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8z" size={16} />
                      <span className="truncate">{r.filename}</span>
                    </div>
                    <div>{fmtDate(r.uploadedAt)}</div>
                    <div className="num">{r.leads}</div>
                    <div className="num">{r.duplicates}</div>
                    <div className="num">{r.invalids}</div>
                    <div>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="act">
                      {r.downloadUrl ? (
                        <a className="icon-btn subtle" href={r.downloadUrl} title="Download file">
                          <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </a>
                      ) : (
                        <button className="icon-btn subtle" disabled title="No download available">
                          <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="uploads-empty">No uploads yet.</div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function StatusPill({ status }: { status: "success" | "partial" | "failed" }) {
  const label =
    status === "success" ? "Success" : status === "partial" ? "Partial" : "Failed";
  return <span className={`pill pill--${status}`}>{label}</span>;
}

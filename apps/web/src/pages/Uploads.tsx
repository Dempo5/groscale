import { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

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
  note?: string;        // short tooltip text for status
};

export default function Uploads() {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  // --- utils ---
  const fmtBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 ** 2).toFixed(1)} MB`;
  };

  // Fake parser to keep the UI functional without a backend yet
  const fakeSummarize = async (file: File): Promise<Omit<Row, "id" | "name" | "size" | "at">> => {
    // Very light “deterministic” numbers so repeated uploads look consistent
    const seed = file.size % 97;
    const leads = 50 + (seed % 450);
    const duplicates = seed % 7;
    const invalids = seed % 5;
    const status: Status =
      invalids > 0 || duplicates > 0 ? (invalids > 2 ? "partial" : "success") : "success";
    const note =
      status === "success"
        ? "Imported successfully."
        : status === "partial"
        ? "Some rows were invalid or duplicated."
        : "Failed to import.";
    return { leads, duplicates, invalids, status, note };
  };

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      const file = files[0];

      // Add a local “processing” row instantly (so it feels responsive)
      const temp: Row = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        at: new Date().toISOString(),
        leads: 0,
        duplicates: 0,
        invalids: 0,
        status: "partial",
        note: "Parsing…",
      };
      setRows((r) => [temp, ...r]);

      // Simulate parsing -> update the row
      const summary = await fakeSummarize(file);
      setRows((r) =>
        r.map((x) =>
          x.id === temp.id
            ? { ...x, ...summary }
            : x
        )
      );
    },
    []
  );

  // --- drop handlers (fully accessible) ---
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  return (
    <div className="p-uploads">
      {/* breadcrumb */}
      <div className="crumbs">
        <button className="crumb-back" onClick={() => nav("/dashboard")}>
          ← Dashboard
        </button>
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
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
        <div className="drop-sub">Click to browse • Max 50&nbsp;MB • UTF-8 • Headers required</div>
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
                        title={r.note || (r.status === "success"
                          ? "Imported successfully."
                          : r.status === "partial"
                          ? "Some rows were invalid or duplicated."
                          : "Failed to import.")}>
                        {r.status === "success" ? "Success" : r.status === "partial" ? "Partial" : "Failed"}
                      </span>
                    </td>
                    <td>
                      <button className="link" disabled>
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
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
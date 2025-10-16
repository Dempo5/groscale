// apps/web/src/pages/Uploads.tsx
import { useMemo, useRef, useState } from "react";
import { uploadLeads, type UploadSummary } from "../lib/api";

type Row = {
  id: string;
  fileName: string;
  when: string; // ISO or formatted string
  leadCount: number;
  duplicates: number;
  invalids: number;
  status: "Success" | "Partial" | "Failed";
  errors?: string[];
};

export default function Uploads() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  function statusFrom(summary: UploadSummary): Row["status"] {
    if (!summary.ok) return "Failed";
    if ((summary.invalids ?? 0) > 0 || (summary.duplicates ?? 0) > 0) {
      return "Partial";
    }
    return "Success";
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];

    setBusy(true);
    try {
      const res = await uploadLeads(file);

      const next: Row = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        when: new Date().toLocaleString(),
        leadCount: Number(res.inserted ?? 0) + Number(res.duplicates ?? 0) + Number(res.invalids ?? 0),
        duplicates: Number(res.duplicates ?? 0),
        invalids: Number(res.invalids ?? 0),
        status: statusFrom(res),
        errors: res.errors,
      };
      setRows((r) => [next, ...r]);
    } catch (e: any) {
      const next: Row = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        when: new Date().toLocaleString(),
        leadCount: 0,
        duplicates: 0,
        invalids: 0,
        status: "Failed",
        errors: [e?.message ?? "Upload failed"],
      };
      setRows((r) => [next, ...r]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  const empty = useMemo(() => rows.length === 0, [rows.length]);

  return (
    <div className="p-uploads">
      {/* Header */}
      <div className="uploads-head">
        <div className="title">Uploads</div>
        <div className="uploads-actions">
          <button
            className="btn-outline sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            Choose file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,application/json,.json,text/csv"
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Drag & drop zone */}
      <div
        className={`uploads-zone ${dragOver ? "drag" : ""} ${busy ? "busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        aria-label="Upload leads (CSV or JSON)"
      >
        <div className="zone-contents">
          <div className="zone-title">Drop CSV or JSON here</div>
          <div className="zone-sub">or click “Choose file” to select</div>
        </div>
      </div>

      {/* History */}
      <div className="uploads-history">
        <div className="uploads-head title-sm">Upload history</div>
        <table className="uploads-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Date</th>
              <th>Leads</th>
              <th>Duplicates</th>
              <th>Invalids</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {empty && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 16, color: "var(--text-secondary)" }}>
                  No uploads yet.
                </td>
              </tr>
            )}

            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.fileName}</td>
                <td>{r.when}</td>
                <td>{r.leadCount}</td>
                <td>{r.duplicates}</td>
                <td>{r.invalids}</td>
                <td>
                  <span
                    className={`pill ${
                      r.status === "Success"
                        ? "pill-ok"
                        : r.status === "Partial"
                        ? "pill-warn"
                        : "pill-err"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td>
                  <button className="icon-btn subtle" title="Download log" aria-label="Download log">
                    ⤓
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

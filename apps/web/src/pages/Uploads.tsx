import { useEffect, useMemo, useRef, useState } from "react";

// Local types for the table
type UploadStatus = "success" | "partial" | "failed";
type UploadRow = {
  id: string;
  fileName: string;
  at: number;           // epoch ms
  leads: number;
  duplicates: number;
  invalids: number;
  status: UploadStatus;
  note?: string;        // short tooltip message
  reportUrl?: string;   // optional download url
};

const formatTime = (ms: number) =>
  new Date(ms).toLocaleString([], { hour: "2-digit", minute: "2-digit", year: "numeric", month: "short", day: "numeric" });

// Minimal inline icon (download)
function Icon({ d, size = 18, stroke = "currentColor" }: { d: string; size?: number; stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

// Try a best-effort parse just to populate the history UI.
// (Server posting is optional—this keeps the page functional by itself.)
async function countLeads(file: File): Promise<{ leads: number; invalids: number }> {
  const text = await file.text();

  if (file.name.toLowerCase().endsWith(".json")) {
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return { leads: data.length, invalids: 0 };
      // if it's an object with items
      if (Array.isArray((data as any).items)) return { leads: (data as any).items.length, invalids: 0 };
      return { leads: 0, invalids: 0 };
    } catch {
      return { leads: 0, invalids: 1 };
    }
  }

  // CSV: count non-empty lines excluding header (very lenient)
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { leads: 0, invalids: 0 };
  // if header looks like "email, name, phone" etc, drop it
  const maybeHeader = /email|name|phone|first|last/i.test(lines[0]);
  const rows = maybeHeader ? lines.slice(1) : lines;
  return { leads: rows.length, invalids: 0 };
}

export default function Uploads() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<UploadRow[]>([]);

  // Load/save history (local only; you can replace with API calls later)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gs_uploads");
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("gs_uploads", JSON.stringify(history));
    } catch {}
  }, [history]);

  const onChooseFile = () => inputRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);

    for (const file of Array.from(files)) {
      try {
        const { leads, invalids } = await countLeads(file);

        // Optional: POST to server if you’ve wired the endpoint:
        // const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/uploads`, {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify({ fileName: file.name, size: file.size }),
        //   credentials: "include",
        // });
        // const ok = res.ok;

        // For now, derive status locally
        const ok = leads > 0;
        const row: UploadRow = {
          id: crypto.randomUUID(),
          fileName: file.name,
          at: Date.now(),
          leads,
          duplicates: 0,
          invalids,
          status: ok ? (invalids > 0 ? "partial" : "success") : "failed",
          note: ok ? (invalids > 0 ? "Imported with some invalid rows" : "Imported successfully") : "File could not be parsed",
          // reportUrl: "/api/uploads/123/report.csv"
        };
        setHistory(prev => [row, ...prev]);
      } catch (e) {
        const row: UploadRow = {
          id: crypto.randomUUID(),
          fileName: file.name,
          at: Date.now(),
          leads: 0,
          duplicates: 0,
          invalids: 0,
          status: "failed",
          note: "Unexpected error while processing file",
        };
        setHistory(prev => [row, ...prev]);
      }
    }

    setBusy(false);
  };

  const onDrop: React.DragEventHandler<HTMLLabelElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    await handleFiles(e.dataTransfer?.files ?? null);
  };

  const onDragOver: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const empty = useMemo(() => history.length === 0, [history]);

  return (
    <div className="p-uploads">
      {/* Breadcrumb + Title + Back link */}
      <header className="uploads-header">
        <button
          className="back-link"
          onClick={() => (window.location.href = "/dashboard")}
          aria-label="Back to dashboard"
          title="Back to dashboard"
        >
          ← Dashboard
        </button>

        <div className="title-wrap">
          <div className="crumbs">Dashboard › Uploads</div>
          <h1 className="page-title">Uploads</h1>
        </div>
      </header>

      {/* Dropzone (fully clickable) */}
      <div className="u-card">
        <label
          className={`dropzone ${dragging ? "drag" : ""} ${busy ? "busy" : ""}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onChooseFile}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json"
            multiple
            hidden
            onChange={(e) => handleFiles(e.currentTarget.files)}
          />
          <div className="dz-body">
            <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 5v12" />
            <div className="dz-title">Drag & drop files here</div>
            <div className="dz-sub">CSV or JSON • Click to browse</div>
          </div>
        </label>
      </div>

      {/* History table */}
      <div className="u-card">
        <div className="card-head">Upload history</div>

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
                <th className="right">Report</th>
              </tr>
            </thead>
            <tbody>
              {empty ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No uploads yet. Drop a CSV/JSON above to get started.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id}>
                    <td className="file">{row.fileName}</td>
                    <td>{formatTime(row.at)}</td>
                    <td className="num">{row.leads}</td>
                    <td className="num">{row.duplicates}</td>
                    <td className="num">{row.invalids}</td>
                    <td>
                      <span
                        className={`pill ${row.status}`}
                        title={row.note || (row.status === "success" ? "Imported successfully" : "See details")}
                      >
                        {row.status === "success" ? "Success" : row.status === "partial" ? "Partial" : "Failed"}
                      </span>
                    </td>
                    <td className="right">
                      <button
                        className="icon-btn ghost"
                        title={row.reportUrl ? "Download report" : "No report"}
                        disabled={!row.reportUrl}
                        onClick={() => {
                          if (row.reportUrl) window.open(row.reportUrl, "_blank");
                        }}
                      >
                        <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

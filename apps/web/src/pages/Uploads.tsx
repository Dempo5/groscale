import React, { useEffect, useMemo, useRef, useState } from "react";

/** -------------------------------
 * Types
 * -------------------------------- */
type UploadStatus = "queued" | "processing" | "success" | "partial" | "failed";

type UploadRow = {
  id: string;
  fileName: string;
  size: number; // bytes
  at: number; // epoch ms
  leads: number;
  duplicates: number;
  invalids: number;
  status: UploadStatus;
  note?: string; // short tooltip/message
  progress?: number; // 0-100 while processing
  reportUrl?: string | null; // becomes non-null when ready
};

const MAX_ROWS = 200;

/** -------------------------------
 * Helpers
 * -------------------------------- */
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

function Icon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/** -------------------------------
 * Tiny toasts (no lib)
 * -------------------------------- */
type Toast = { id: string; kind: "ok" | "err"; text: string };
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (t: Omit<Toast, "id">) => {
    const toast = { ...t, id: crypto.randomUUID() };
    setToasts((prev) => [...prev, toast].slice(-4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== toast.id));
    }, 2600);
  };
  return { toasts, push };
}

/** -------------------------------
 * Component
 * -------------------------------- */
export default function Uploads() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState(""); // aria-live
  const [history, setHistory] = useState<UploadRow[]>([]);
  const [preview, setPreview] = useState<{ name: string; size: number } | null>(null);
  const { toasts, push } = useToasts();

  // Load persisted history
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gs_uploads");
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);
  // Persist history
  useEffect(() => {
    try {
      localStorage.setItem("gs_uploads", JSON.stringify(history));
    } catch {}
  }, [history]);

  const last10 = useMemo(() => history.slice(0, 10), [history]);

  /** ---------- Handlers ---------- */
  const openPicker = () => inputRef.current?.click();

  const onKeyDownDrop: React.KeyboardEventHandler<HTMLLabelElement> = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  const onDragOver: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragging) setAnnounce("File selected target"); // a11y
    setDragging(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };
  const onDrop: React.DragEventHandler<HTMLLabelElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handleFiles(e.dataTransfer?.files ?? null);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    setPreview({ name: file.name, size: file.size });

    // Immediately create a "processing" row (inline progress)
    const row: UploadRow = {
      id: crypto.randomUUID(),
      fileName: file.name,
      size: file.size,
      at: Date.now(),
      leads: 0,
      duplicates: 0,
      invalids: 0,
      status: "processing",
      note: "Parsing…",
      progress: 1,
      reportUrl: null,
    };
    setHistory((prev) => [row, ...prev].slice(0, MAX_ROWS));
    push({ kind: "ok", text: "Import started. We’ll process this in the background." });
    setAnnounce("Upload started");

    // Simulate parsing progression + result (replace with real API)
    const id = row.id;
    let prog = 1;
    const tm = setInterval(() => {
      prog = Math.min(99, prog + Math.ceil(Math.random() * 11));
      setHistory((prev) =>
        prev.map((r) => (r.id === id ? { ...r, progress: prog, note: `Parsing… ${prog}%` } : r))
      );
    }, 140);

    // Simple client-side sniff just to produce counts (you'll POST in real impl)
    file
      .text()
      .then((txt) => {
        let leads = 0;
        let invalids = 0;

        if (file.name.toLowerCase().endsWith(".json")) {
          try {
            const data = JSON.parse(txt);
            if (Array.isArray(data)) leads = data.length;
            else if (Array.isArray((data as any).items)) leads = (data as any).items.length;
            else invalids = 1;
          } catch {
            invalids = 1;
          }
        } else {
          // csv: quick guess lines (headers required)
          const lines = txt.split(/\r?\n/).map((l) => l.trim());
          const hasHeader = /email|name|phone|first|last/i.test(lines[0] || "");
          const rows = (hasHeader ? lines.slice(1) : lines).filter(Boolean);
          leads = rows.length;
        }

        const duplicates = Math.floor(Math.max(0, leads * 0.03)); // dummy number
        const status: UploadStatus =
          leads === 0 ? "failed" : invalids > 0 ? "partial" : "success";

        clearInterval(tm);
        setHistory((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  leads,
                  invalids,
                  duplicates,
                  status,
                  progress: 100,
                  note:
                    status === "failed"
                      ? "Invalid columns"
                      : status === "partial"
                      ? "Imported with warnings"
                      : "Imported successfully",
                  reportUrl:
                    status === "failed" || status === "partial"
                      ? "/reports/validation.csv"
                      : "/reports/summary.csv",
                }
              : r
          )
        );
        if (status === "failed") push({ kind: "err", text: "Upload failed (Invalid columns)" });
      })
      .catch(() => {
        clearInterval(tm);
        setHistory((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: "failed", note: "Unexpected error", progress: undefined } : r
          )
        );
        push({ kind: "err", text: "Upload failed." });
      });
  };

  /** ---------- UI ---------- */
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 text-neutral-800 dark:text-neutral-200">
      {/* Live region for drag/drop announcements */}
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>

      {/* Back affordance */}
      <button
        onClick={() => (window.location.href = "/dashboard")}
        className="mb-2 -ml-1 text-sm text-neutral-400 hover:text-blue-400 transition-colors duration-150"
        aria-label="Back to dashboard"
      >
        ← Dashboard
      </button>

      {/* Breadcrumb + Title */}
      <div className="mb-3">
        <nav className="text-[13px] text-neutral-500 dark:text-neutral-400">
          <a href="/dashboard" className="hover:text-blue-500">Dashboard</a>
          <span className="mx-1.5">›</span>
          <span className="text-neutral-500 dark:text-neutral-400">Uploads</span>
        </nav>
        <h1 className="mt-1 text-lg font-semibold">Uploads</h1>
      </div>

      {/* Upload Card */}
      <div
        className={[
          "rounded-xl border border-neutral-200/60 dark:border-neutral-800",
          "bg-white dark:bg-neutral-950",
          "shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200",
          "p-4 sm:p-5",
        ].join(" ")}
      >
        {/* Dropzone (fully clickable) */}
        <label
          role="button"
          tabIndex={0}
          onKeyDown={onKeyDownDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={[
            "group block w-full cursor-pointer select-none rounded-xl border",
            "border-neutral-200/40 bg-neutral-900/0 dark:bg-neutral-900/20",
            "shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200",
            dragging
              ? "border-blue-500 bg-blue-500/10"
              : "hover:border-blue-500/60 hover:bg-blue-500/5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]",
            "outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
            "px-5 py-8 text-center",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json"
            hidden
            onChange={(e) => handleFiles(e.currentTarget.files)}
          />

          <div className="flex flex-col items-center gap-2">
            <Icon
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 5v12"
              className={[
                "h-6 w-6 text-neutral-400",
                dragging ? "scale-[1.03] text-blue-500 transition-transform" : "transition-transform",
              ].join(" ")}
            />
            <div className="text-sm font-medium">Drag & drop files here</div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400">
              CSV or JSON • Click to browse
            </div>

            {/* Small helper line */}
            <div className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
              Max file size 50MB • UTF-8 • Headers required
            </div>

            {preview && (
              <div className="mt-2 rounded-md border border-neutral-200/60 dark:border-neutral-800 px-2 py-1 text-[12px] text-neutral-600 dark:text-neutral-400">
                Ready to upload: <span className="font-medium text-neutral-800 dark:text-neutral-200">{preview.name}</span>,{" "}
                {fmtSize(preview.size)}
              </div>
            )}
          </div>
        </label>
      </div>

      {/* History Card */}
      <div
        className={[
          "mt-4 rounded-xl border border-neutral-200/60 dark:border-neutral-800",
          "bg-white dark:bg-neutral-950",
          "shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-800 px-4 py-3">
          <div className="text-sm font-semibold">Upload history</div>
          <a
            href="/uploads/history"
            className="text-[13px] text-neutral-500 hover:text-blue-500 transition-colors"
          >
            View all
          </a>
        </div>

        {/* Empty state */}
        {last10.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-14 text-neutral-500">
            <Icon d="M4 4h16v12H4zM8 20h8" className="mr-2 h-5 w-5 opacity-40" />
            <span className="text-sm">
              No uploads yet. Drag a CSV/JSON above or click to browse.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-neutral-50/60 dark:bg-neutral-900/40 text-xs font-medium text-neutral-400 uppercase tracking-wide">
                  <th className="px-4 py-2 text-left">File</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-right">Leads</th>
                  <th className="px-4 py-2 text-right">Duplicates</th>
                  <th className="px-4 py-2 text-right">Invalids</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
                {last10.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    <td className="max-w-[360px] truncate px-4 py-2">
                      <span title={row.fileName}>{row.fileName}</span>{" "}
                      <span className="text-neutral-400">• {fmtSize(row.size)}</span>
                    </td>
                    <td className="px-4 py-2">{fmtTime(row.at)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.leads}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.duplicates}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.invalids}</td>
                    <td className="px-4 py-2">
                      <StatusPill status={row.status} note={row.note} progress={row.progress} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        disabled={!row.reportUrl || row.status === "processing" || row.status === "queued"}
                        title="Download validation report (CSV)"
                        onClick={() => row.reportUrl && window.open(row.reportUrl, "_blank")}
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
                          row.reportUrl
                            ? "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-500/15"
                            : "opacity-40 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800/40 text-neutral-500",
                        ].join(" ")}
                      >
                        <Icon d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" className="h-4 w-4" />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toaster (bottom-left) */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "pointer-events-auto rounded-md px-3 py-2 text-sm shadow-md",
              t.kind === "ok"
                ? "bg-emerald-600 text-white"
                : "bg-rose-600 text-white",
            ].join(" ")}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Status chips + processing row */
function StatusPill({
  status,
  note,
  progress,
}: {
  status: UploadStatus;
  note?: string;
  progress?: number;
}) {
  if (status === "processing" || status === "queued") {
    return (
      <span
        title={note || "Processing"}
        className="inline-flex items-center gap-2"
      >
        <Spinner />
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {note || "Processing"}
        </span>
      </span>
    );
  }

  const cls =
    status === "success"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : status === "partial"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";

  const label =
    status === "success" ? "Success" : status === "partial" ? "Partial" : "Failed";

  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        cls,
      ].join(" ")}
      title={note || undefined}
    >
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-neutral-400"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}

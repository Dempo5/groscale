import React, { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type UploadRow = {
  id: string;
  name: string;
  createdAt: string; // ISO
  leads: number;
  duplicates: number;
  invalids: number;
  status: "success" | "partial" | "failed" | "processing";
  note?: string; // short error / tooltip
  reportUrl?: string | null;
};

function chip(status: UploadRow["status"]) {
  const map = {
    success:
      "chip inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-[rgba(16,185,129,0.15)] dark:text-emerald-300",
    partial:
      "chip inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-[rgba(245,158,11,0.15)] dark:text-amber-300",
    failed:
      "chip inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-[rgba(244,63,94,0.15)] dark:text-rose-300",
    processing:
      "chip inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-xs font-medium bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  } as const;
  return map[status];
}

export default function Uploads() {
  const nav = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);

  const onBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || !files[0]) return;
    const f = files[0];
    setSelected(f);

    // Optimistic “processing row”
    const id = crypto.randomUUID();
    const optimistic: UploadRow = {
      id,
      name: f.name,
      createdAt: new Date().toISOString(),
      leads: 0,
      duplicates: 0,
      invalids: 0,
      status: "processing",
      note: "Parsing…",
    };
    setRows((r) => [optimistic, ...r]);

    // TODO: send to backend
    // const form = new FormData();
    // form.append("file", f);
    // await fetch("/api/uploads", { method:"POST", body: form, credentials:"include" })

    // Simulated finish (replace with real response)
    setTimeout(() => {
      setRows((r) =>
        r.map((x) =>
          x.id === id
            ? {
                ...x,
                leads: 342,
                duplicates: 11,
                invalids: 6,
                status: "partial",
                note: "Some rows missing required columns",
                reportUrl: "#",
              }
            : x
        )
      );
    }, 1200);
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files),
    [handleFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const empty = rows.length === 0;

  const containerCls =
    "p-uploads max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-[var(--ink)]";
  const card =
    "rounded-xl border border-[color-mix(in_srgb,var(--line-strong)_80%,transparent)] bg-[color-mix(in_srgb,var(--panel)_92%,transparent)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all";

  return (
    <div className={containerCls} aria-live="polite">
      {/* Back affordance */}
      <div className="mb-2">
        <button
          onClick={() => nav("/dashboard")}
          className="text-sm cursor-pointer"
          style={{
            color: "var(--muted)",
            transition: "transform .15s var(--ease), color .15s var(--ease)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--blue)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
          onFocus={(e) => (e.currentTarget.style.color = "var(--blue)")}
        >
          ← Dashboard
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="text-xs mb-3" style={{ color: "var(--muted)" }}>
        <Link to="/dashboard" className="hover:underline">
          Dashboard
        </Link>{" "}
        › <span>Uploads</span>
      </div>

      {/* Title */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Uploads</h1>
      </div>

      {/* Drop zone card */}
      <div
        className={card}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onBrowse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onBrowse()}
        aria-label="Upload CSV or JSON"
        style={{
          borderColor: dragOver ? "var(--blue)" : undefined,
          background: dragOver
            ? "color-mix(in srgb, var(--blue) 7%, var(--panel))"
            : undefined,
        }}
      >
        <div className="flex items-center gap-3 px-4 py-4 sm:px-5 sm:py-6">
          {/* SVG icon (fixed size — no more giant arrow) */}
          <div
            className="drop-icon rounded-lg border"
            style={{
              borderColor: "var(--line)",
              background: "color-mix(in srgb, var(--panel) 92%, transparent)",
              transform: dragOver ? "scale(1.03)" : "scale(1)",
              transition: "transform .2s var(--ease)",
            }}
          >
            <svg
              className="upload-svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M7 15l5-5 5 5M12 10v10M20 20H4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="flex-1">
            <div className="font-medium">Drag & drop your file here</div>
            <div className="text-sm" style={{ color: "var(--muted)" }}>
              CSV or JSON • Click to browse
              {selected ? (
                <span className="ml-2" style={{ color: "var(--ink)" }}>
                  • Ready: {selected.name}{" "}
                  {selected.size
                    ? `(${(selected.size / 1024 / 1024).toFixed(1)} MB)`
                    : ""}
                </span>
              ) : null}
            </div>
          </div>

          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            ref={fileInputRef}
            onChange={onInputChange}
            hidden
          />
        </div>
      </div>

      {/* History */}
      <div className={`${card} mt-6`}>
        <div className="px-4 sm:px-5 py-3 border-b" style={{ borderColor: "var(--line)" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Recent uploads
          </div>
        </div>

        {empty ? (
          <div
            className="grid place-items-center px-6 py-14 text-center"
            style={{ color: "var(--muted)" }}
          >
            <div className="flex items-center gap-2 opacity-80">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 20v-8M8 12l4-4 4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>No uploads yet. Drag a CSV/JSON above or click to browse.</span>
            </div>
            <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Max file size 50MB • UTF-8 • Headers required
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[12px]" style={{ color: "var(--muted)" }}>
                  <th className="px-4 sm:px-5 py-2.5">File</th>
                  <th className="px-4 sm:px-5 py-2.5">Uploaded</th>
                  <th className="px-4 sm:px-5 py-2.5 text-right">Leads</th>
                  <th className="px-4 sm:px-5 py-2.5 text-right">Duplicates</th>
                  <th className="px-4 sm:px-5 py-2.5 text-right">Invalids</th>
                  <th className="px-4 sm:px-5 py-2.5">Status</th>
                  <th className="px-4 sm:px-5 py-2.5 text-right">Report</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-[color-mix(in_srgb,var(--panel)_96%,var(--line))]"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="px-4 sm:px-5 py-2.5">{r.name}</td>
                    <td className="px-4 sm:px-5 py-2.5">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums">
                      {r.leads}
                    </td>
                    <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums">
                      {r.duplicates}
                    </td>
                    <td className="px-4 sm:px-5 py-2.5 text-right tabular-nums">
                      {r.invalids}
                    </td>
                    <td className="px-4 sm:px-5 py-2.5">
                      <span className={chip(r.status)} title={r.note || ""}>
                        {r.status === "success"
                          ? "Success"
                          : r.status === "partial"
                          ? "Partial"
                          : r.status === "failed"
                          ? "Failed"
                          : "Processing…"}
                      </span>
                    </td>
                    <td className="px-4 sm:px-5 py-2.5 text-right">
                      <button
                        disabled={!r.reportUrl || r.status === "processing"}
                        title="Download validation report (CSV)"
                        className="btn-outline sm disabled:opacity-50"
                        onClick={() => r.reportUrl && window.open(r.reportUrl, "_blank")}
                      >
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
    </div>
  );
}
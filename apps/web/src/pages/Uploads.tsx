// apps/web/src/pages/Uploads.tsx
import { useMemo, useRef, useState } from "react";
import { uploadLeads } from "../lib/api"; // path matches apps/web/src/lib/api.ts

type PreviewRow = {
  name?: string;
  email?: string;
  phone?: string;
};

type Summary = {
  ok: boolean;
  inserted: number;
  skipped: number;
  errors?: string[];
};

export default function Uploads() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setFile(f);
    setSummary(null);
    readFilePreview(f);
  }

  function readFilePreview(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        // Accept CSV or JSON. Minimal CSV support: name,email,phone
        const text = String(reader.result || "");
        if (/^\s*[\{\[]/.test(text)) {
          const arr = JSON.parse(text) as any[];
          const out = arr
            .map((r) => ({
              name: r.name ?? r.fullName ?? "",
              email: r.email ?? "",
              phone: r.phone ?? r.phoneNumber ?? "",
            }))
            .filter((r) => r.name || r.email || r.phone);
          setRows(out.slice(0, 50)); // preview first 50
        } else {
          const lines = text.split(/\r?\n/).filter(Boolean);
          const header = (lines[0] || "").split(",").map((s) => s.trim().toLowerCase());
          const idxName = header.findIndex((h) => /name|full ?name/.test(h));
          const idxEmail = header.findIndex((h) => /email/.test(h));
          const idxPhone = header.findIndex((h) => /phone/.test(h));
          const out: PreviewRow[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(",").map((s) => s.trim());
            out.push({
              name: idxName >= 0 ? cols[idxName] : "",
              email: idxEmail >= 0 ? cols[idxEmail] : "",
              phone: idxPhone >= 0 ? cols[idxPhone] : "",
            });
            if (out.length >= 50) break;
          }
          setRows(out);
        }
      } catch {
        setRows([]);
      }
    };
    reader.readAsText(f);
  }

  async function onUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setSummary(null);
    try {
      const res = await uploadLeads(file); // returns { ok, inserted, skipped, errors? }
      setSummary(res as Summary);
    } catch (e) {
      setSummary({ ok: false, inserted: 0, skipped: 0, errors: ["Upload failed"] });
    } finally {
      setUploading(false);
    }
  }

  const hasPreview = rows.length > 0;

  const previewCols = useMemo(() => {
    // build column widths in a minimal way (no new CSS needed)
    return { name: "40%", email: "35%", phone: "25%" };
  }, []);

  return (
    <div className="p-shell" style={{ minHeight: "100vh" }}>
      <main className="p-work grid rail-open" style={{ gridTemplateColumns: "1fr" }}>
        <section className="panel matte" style={{ padding: 16 }}>
          <div
            className="list-head"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <div className="h">Uploads</div>
            <div className="list-head-actions" style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-outline sm"
                onClick={() => inputRef.current?.click()}
                aria-label="Choose file"
              >
                Choose file
              </button>
              <button
                className="btn-primary"
                onClick={onUpload}
                disabled={!file || uploading}
                aria-disabled={!file || uploading}
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,application/json,text/csv,application/vnd.ms-excel"
            onChange={onPickFile}
            style={{ display: "none" }}
          />

          {/* Drop zone area */}
          <div
            onClick={() => inputRef.current?.click()}
            style={{
              marginTop: 12,
              padding: 20,
              border: "1px dashed var(--line)",
              borderRadius: 10,
              background: "var(--panel)",
              cursor: "pointer",
            }}
            aria-label="Click to select a CSV or JSON file"
          >
            {file ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{file.name}</span>
                <span style={{ color: "var(--muted)" }}>
                  {Math.ceil(file.size / 1024)} KB selected
                </span>
              </div>
            ) : (
              <div style={{ color: "var(--muted)" }}>
                Drag a <strong>CSV</strong> or <strong>JSON</strong> file here, or click to browse.
              </div>
            )}
          </div>

          {/* Preview */}
          {hasPreview && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview (first 50 rows)</div>
              <div
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${previewCols.name} ${previewCols.email} ${previewCols.phone}`,
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--line)",
                    color: "var(--text-secondary)",
                    fontSize: 12,
                  }}
                >
                  <div>Name</div>
                  <div>Email</div>
                  <div>Phone</div>
                </div>
                <div>
                  {rows.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: `${previewCols.name} ${previewCols.email} ${previewCols.phone}`,
                        padding: "8px 10px",
                        borderTop: i ? "1px solid var(--line)" : "none",
                      }}
                    >
                      <div>{r.name || <span style={{ color: "var(--muted)" }}>—</span>}</div>
                      <div>{r.email || <span style={{ color: "var(--muted)" }}>—</span>}</div>
                      <div>{r.phone || <span style={{ color: "var(--muted)" }}>—</span>}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div
              style={{
                marginTop: 14,
                borderTop: "1px solid var(--line)",
                paddingTop: 14,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 700 }}>Import summary</div>
              <div style={{ display: "flex", gap: 16, color: "var(--text-secondary)" }}>
                <div>
                  Inserted: <strong style={{ color: "var(--text-primary)" }}>{summary.inserted}</strong>
                </div>
                <div>
                  Skipped: <strong style={{ color: "var(--text-primary)" }}>{summary.skipped}</strong>
                </div>
                {!summary.ok && <div style={{ color: "#e46a6a" }}>Failed</div>}
              </div>
              {summary.errors?.length ? (
                <div
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: 10,
                    background: "color-mix(in srgb, var(--panel) 92%, var(--line))",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Errors</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {summary.errors.map((e, i) => (
                      <li key={i} style={{ color: "var(--muted)" }}>
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

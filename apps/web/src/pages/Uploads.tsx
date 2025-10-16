// apps/web/src/pages/Uploads.tsx
import { useMemo, useState } from "react";
import "../pages/dashboard-ios.css"; // keep the same global tokens
import { uploadLeads, type UploadSummary } from "../lib/api";

type Row = string[];
type Parsed = { headers: string[]; rows: Row[] };

const REQUIRED_FIELDS = ["name", "email", "phone"] as const;
type FieldKey = (typeof REQUIRED_FIELDS)[number] | "city" | "state" | "zip" | "tags";

const FRIENDLY: Record<FieldKey, string> = {
  name: "Full name",
  email: "Email",
  phone: "Phone",
  city: "City",
  state: "State",
  zip: "ZIP",
  tags: "Tags (comma-separated)",
};

function parseCsv(text: string): Parsed {
  // Super-light CSV: handles commas inside quotes and newlines
  // (good enough for basic lead sheets; no external deps)
  const rows: Row[] = [];
  let cur = "", inQ = false, row: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && n === '"') { cur += '"'; i++; continue; }
    if (c === '"') { inQ = !inQ; continue; }
    if (!inQ && (c === "," || c === "\n" || c === "\r")) {
      row.push(cur.trim()); cur = "";
      if (c === "\n" || (c === "\r" && n !== "\n")) { rows.push(row); row = []; }
      continue;
    }
    cur += c;
  }
  if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }
  const headers = (rows.shift() || []).map(h => h.trim());
  return { headers, rows };
}

export default function Uploads() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<Record<FieldKey, string>>({
    name: "", email: "", phone: "", city: "", state: "", zip: "", tags: "",
  });
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(f: File | null) {
    setFile(f);
    setParsed(null);
    setSummary(null);
    setError(null);
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const p = parseCsv(text);
        setParsed(p);
        // Auto-guess mappings by header names
        const guess = (needle: RegExp) =>
          p.headers.find(h => needle.test(h.toLowerCase())) || "";
        setMap({
          name: guess(/name|full.?name|contact/i),
          email: guess(/email/i),
          phone: guess(/phone|mobile|cell/i),
          city: guess(/city/i) || "",
          state: guess(/state|st/i) || "",
          zip: guess(/zip|postal/i) || "",
          tags: guess(/tag|label/i) || "",
        });
      } catch (e: any) {
        setError("Couldn’t parse CSV. Check the file and try again.");
      }
    };
    reader.readAsText(f);
  }

  const preview = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.slice(0, 6);
  }, [parsed]);

  const canImport = useMemo(() => {
    if (!parsed) return false;
    // Require at least one of email/phone + name
    const has = (k: FieldKey) => !!map[k] && parsed.headers.includes(map[k]);
    return has("name") && (has("phone") || has("email"));
  }, [parsed, map]);

  async function startImport() {
    if (!parsed) return;
    setBusy(true);
    setSummary(null);
    setError(null);
    try {
      const colIndex = (header: string) => parsed.headers.indexOf(header);

      const leads = parsed.rows.map(r => {
        const v = (k: FieldKey) => {
          const h = map[k];
          if (!h) return "";
          const idx = colIndex(h);
          return idx >= 0 ? r[idx] || "" : "";
        };
        const rawTags = v("tags");
        const tags = rawTags
          ? rawTags.split(",").map(t => t.trim()).filter(Boolean)
          : [];
        return {
          name: v("name"),
          email: v("email") || null,
          phone: v("phone") || null,
          city: v("city") || null,
          state: v("state") || null,
          zip: v("zip") || null,
          tags,
        };
      });

      const s = await uploadLeads({ leads });
      setSummary(s);
    } catch (e: any) {
      setError(e?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-shell matte">
      <header className="p-topbar matte">
        <div className="brand-center">GroScales</div>
      </header>

      <main className="p-work grid rail-open">
        {/* left rail is your existing nav from AppShell/Dashboard; keep page minimal here */}
        <section className="panel list matte" style={{ gridColumn: "1 / span 2" }}>
          <div className="list-head">
            <div className="h">Uploads</div>
          </div>

          {/* Dropzone */}
          <div className="u-drop">
            <label className="u-dropzone">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                hidden
              />
              <div className="u-drop-icon">⭳</div>
              <div className="u-drop-text">
                {file ? <b>{file.name}</b> : "Drag & drop a CSV here, or click to choose"}
              </div>
            </label>
          </div>

          {/* Field mapping */}
          {!!parsed && (
            <div className="u-map matte">
              <div className="u-map-title">Map columns</div>
              <div className="u-grid">
                {(Object.keys(FRIENDLY) as FieldKey[]).map((k) => (
                  <div key={k} className="u-map-row">
                    <label className="u-map-label">{FRIENDLY[k]}</label>
                    <select
                      className="u-map-select"
                      value={map[k] || ""}
                      onChange={(e) => setMap({ ...map, [k]: e.target.value })}
                    >
                      <option value="">—</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {!!parsed && (
            <div className="u-preview">
              <div className="u-preview-title">Preview (first 6 rows)</div>
              <div className="u-table">
                <div className="u-tr u-tr-h">
                  {parsed.headers.map((h) => (
                    <div key={h} className="u-td">{h}</div>
                  ))}
                </div>
                {preview.map((r, i) => (
                  <div key={i} className="u-tr">
                    {parsed.headers.map((_, j) => (
                      <div key={j} className="u-td">
                        {r[j] || "—"}
                      </div>
                    ))}
                  </div>
                ))}
                {!preview.length && <div className="u-empty">No data rows found.</div>}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="u-actions">
            <button
              className="btn-primary"
              onClick={startImport}
              disabled={!canImport || busy}
              title={canImport ? "Import leads" : "Select and map at least Name + (Email or Phone)"}
            >
              {busy ? "Importing…" : "Start import"}
            </button>
            {!canImport && (
              <div className="u-hint">
                Select a CSV, then map at least <b>Name</b> and either <b>Email</b> or <b>Phone</b>.
              </div>
            )}
          </div>

          {/* Result */}
          {summary && (
            <div className="u-result">
              <div className="u-result-title">Import summary</div>
              <div className="u-statgrid">
                <div className="u-stat">
                  <div className="u-stat-k">Inserted</div>
                  <div className="u-stat-v">{summary.inserted}</div>
                </div>
                <div className="u-stat">
                  <div className="u-stat-k">Skipped</div>
                  <div className="u-stat-v">{summary.skipped}</div>
                </div>
              </div>
              {!!summary.errors?.length && (
                <div className="u-errors">
                  {summary.errors.slice(0, 6).map((e, i) => (
                    <div key={i} className="u-error">
                      • {e}
                    </div>
                  ))}
                  {summary.errors.length > 6 && (
                    <div className="u-error more">+{summary.errors.length - 6} more…</div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <div className="u-error-banner">{error}</div>}
        </section>

        {/* right spacer to keep 3-panel balance on large screens */}
        <aside className="panel details matte" style={{ gridColumn: "3 / span 2" }}>
          <div className="section">
            <div className="section-title">Tips</div>
            <div className="kv">
              <label>File format</label>
              <span>.csv with a header row (Name, Email, Phone…)</span>
            </div>
            <div className="kv">
              <label>Duplicates</label>
              <span>Skipped by email/phone.</span>
            </div>
            <div className="kv">
              <label>Tags</label>
              <span>Optional, comma-separated.</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

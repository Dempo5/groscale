// apps/web/src/pages/Uploads.tsx
import { useMemo, useState } from "react";
import { uploadLeads } from "../lib/api";

type Row = Record<string, string>;

function parseCsvLoose(csv: string): Row[] {
  // NOTE: very lightweight CSV parsing for preview.
  // Good enough for simple CSVs (no embedded commas/quotes).
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(",").map((p) => p.trim());
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = parts[i] ?? ""));
    return row;
  });
}

export default function Uploads() {
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => parseCsvLoose(csv), [csv]);
  const sample = rows.slice(0, 12); // preview up to 12 rows

  async function onUpload() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Send raw CSV to the server. It normalizes / validates.
      const res = await uploadLeads({ csv });
      setResult(`Imported ${res.normalizedCount} leads successfully.`);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ""));
    reader.readAsText(f);
  }

  return (
    <div className="p-uploads">
      <header className="uploads-head">
        <div className="title">Uploads</div>
        <div className="tabs">
          <button
            className={`tab ${mode === "paste" ? "active" : ""}`}
            onClick={() => setMode("paste")}
          >
            Paste CSV
          </button>
          <button
            className={`tab ${mode === "file" ? "active" : ""}`}
            onClick={() => setMode("file")}
          >
            File Upload
          </button>
        </div>
      </header>

      <section className="uploads-input">
        {mode === "paste" ? (
          <textarea
            placeholder="firstName,lastName,email,phone&#10;Ada,Lovelace,ada@example.com,555-123-4567"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
        ) : (
          <label className="filepick">
            <input type="file" accept=".csv" onChange={onFileSelected} />
            <span>{fileName || "Choose a .csv file…"}</span>
          </label>
        )}
        <div className="hint">
          Tip: Required columns should at least include{" "}
          <code>firstName</code>, <code>lastName</code>, or{" "}
          <code>email</code>. (Your server will normalize anything extra.)
        </div>
      </section>

      <section className="uploads-actions">
        <button
          className="btn-primary"
          disabled={!csv || loading}
          onClick={onUpload}
        >
          {loading ? "Uploading…" : "Import leads"}
        </button>
        {result && <div className="ok">{result}</div>}
        {error && <div className="err">{error}</div>}
      </section>

      {!!rows.length && (
        <section className="uploads-preview">
          <div className="label">
            Preview ({sample.length} of {rows.length})
          </div>
          <div className="table">
            <div className="thead">
              {Object.keys(sample[0] || {}).map((h) => (
                <div key={h} className="th">
                  {h}
                </div>
              ))}
            </div>
            <div className="tbody">
              {sample.map((r, i) => (
                <div key={i} className="tr">
                  {Object.keys(sample[0] || {}).map((h) => (
                    <div key={h} className="td">
                      {r[h]}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

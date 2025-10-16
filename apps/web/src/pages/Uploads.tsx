// apps/web/src/pages/Uploads.tsx
import { useState } from "react";
import { uploadLeads, UploadSummary } from "../lib/api";

export default function Uploads() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await uploadLeads(file);
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-upload">
      <h1 className="h">Uploads</h1>

      <form onSubmit={onSubmit} className="card">
        <label className="lbl">CSV file</label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div className="actions">
          <button className="btn-primary" disabled={!file || busy}>
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>

      {!!error && <div className="error">{error}</div>}

      {result && (
        <div className="card">
          <div className="lbl">Result</div>
          <div className="kv">
            <span>Inserted</span>
            <span>{result.inserted}</span>
          </div>
          <div className="kv">
            <span>Skipped</span>
            <span>{result.skipped}</span>
          </div>
          {!!result.errors?.length && (
            <>
              <div className="lbl" style={{ marginTop: 8 }}>Errors</div>
              <ul className="disc">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

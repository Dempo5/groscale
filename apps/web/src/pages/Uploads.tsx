// apps/web/src/pages/Uploads.tsx
import { useMemo, useState } from "react";
import { importLeads } from "../lib/api";
import "./dashboard-ios.css";

// lightweight CSV parser (handles quotes, commas, headers)
function parseCSV(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let cur = "", row: string[] = [], inQuotes = false;

  const pushCell = () => { row.push(cur); cur = ""; };
  const pushRow  = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      pushCell();
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++; // handle CRLF
      pushCell(); pushRow();
    } else {
      cur += c;
    }
  }
  // trailing cell/row
  if (cur.length || row.length) { pushCell(); pushRow(); }

  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).filter(r => r.some(Boolean)).map(r => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i] || `col_${i}`] = (r[i] ?? "").trim();
    return obj;
  });
}

export default function Uploads() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    let withEmailOrPhone = 0;
    for (const r of rows) {
      const email = (r.email ?? "").trim();
      const phone = (r.phone ?? "").trim();
      if (email || phone) withEmailOrPhone++;
    }
    return { total: rows.length, usable: withEmailOrPhone };
  }, [rows]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null); setMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCSV(text);
    setRows(parsed);
  }

  async function onUpload() {
    if (!rows.length) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const payload = rows.map(r => ({
        name:  r.name  ?? r.full_name ?? `${r.first ?? ""} ${r.last ?? ""}`.trim(),
        email: r.email,
        phone: r.phone,
        city:  r.city,
        state: r.state,
        zip:   r.zip ?? r.postal ?? r.zipcode,
      }));
      const res = await importLeads(payload);
      setMsg(`Imported: ${res.created} • Updated: ${res.updated} • Skipped: ${res.skipped}`);
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 12, display: "grid", gap: 12 }}>
      <div className="list-head">
        <div className="h">Uploads</div>
        <div className="list-head-actions" style={{ display: "flex", gap: 8 }}>
          <label className="btn-outline sm" style={{ cursor: "pointer" }}>
            <input type="file" accept=".csv" onChange={onPick} style={{ display: "none" }} />
            Choose CSV
          </label>
          <button className="btn-primary" disabled={!rows.length || busy} onClick={onUpload}>
            {busy ? "Uploading…" : "Import"}
          </button>
        </div>
      </div>

      {fileName && (
        <div className="row" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <strong>{fileName}</strong>
          {stats && (
            <span className="sub">
              {stats.total} rows • {stats.usable} usable (has email or phone)
            </span>
          )}
        </div>
      )}

      <div className="row" style={{ opacity: 0.8 }}>
        Supported headers: <code>name</code>, <code>email</code>, <code>phone</code>, <code>city</code>, <code>state</code>, <code>zip</code>.
        <span style={{ marginLeft: 8 }}>Also accepts <code>first/last</code> or <code>full_name</code>.</span>
      </div>

      {err && <div className="row" style={{ color: "#e66" }}>{err}</div>}
      {msg && <div className="row" style={{ color: "var(--muted)" }}>{msg}</div>}

      {!!rows.length && (
        <div className="panel" style={{ border: "1px solid var(--line)", padding: 10 }}>
          <div className="small" style={{ opacity: 0.8, marginBottom: 6 }}>
            Preview (first 8)
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {rows.slice(0, 8).map((r, i) => (
              <div key={i} className="row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 100px", gap: 8 }}>
                <div className="sub">{r.name || `${r.first ?? ""} ${r.last ?? ""}`.trim() || "—"}</div>
                <div className="sub">{r.email || "—"}</div>
                <div className="sub">{r.phone || "—"}</div>
                <div className="sub">{r.city  || "—"}</div>
                <div className="sub">{r.state || "—"}</div>
                <div className="sub">{r.zip   || r.postal || r.zipcode || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!rows.length && (
        <div className="row" style={{ opacity: 0.7 }}>
          No file selected. Click <b>Choose CSV</b> to begin.
        </div>
      )}
    </div>
  );
}

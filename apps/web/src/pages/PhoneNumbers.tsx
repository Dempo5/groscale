import React, { useEffect, useMemo, useState } from "react";
import { searchNumbers, purchaseNumber, type SearchNumbersParams } from "../lib/api";
import { NavLink } from "react-router-dom";

type Row = {
  friendlyName?: string | null;
  phoneNumber: string;
  locality?: string | null;
  region?: string | null;
  isoCountry?: string | null;
  postalCode?: string | null;
  capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean };
};

export default function PhoneNumbers() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [sms, setSms] = useState(true);
  const [mms, setMms] = useState(false);
  const [voice, setVoice] = useState(false);
  const [limit, setLimit] = useState(20);

  const query: SearchNumbersParams = useMemo(
    () => ({ country, areaCode: areaCode || undefined, contains: contains || undefined, sms, mms, voice, limit }),
    [country, areaCode, contains, sms, mms, voice, limit]
  );

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await searchNumbers(query);
      if (!("ok" in res) || !res.ok) throw new Error((res as any).error || "Search failed");
      setRows(res.data || []);
    } catch (e: any) {
      setErr(e?.message || "Search failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function buy(r: Row) {
    if (!confirm(`Buy ${r.phoneNumber} for account?`)) return;
    try {
      setLoading(true);
      const res = await purchaseNumber({ country, phoneNumber: r.phoneNumber, makeDefault: true });
      if (!res.ok) throw new Error(res.error || "Purchase failed");
      alert(`Purchased ${res.number?.number || r.phoneNumber}`);
    } catch (e: any) {
      alert(e?.message || "Purchase failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // first load
    runSearch().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-uploads" style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* crumbs + title (matches your pattern) */}
      <div className="crumbs" style={{ marginTop: 6, marginBottom: 8 }}>
        <NavLink className="crumb-back" to="/dashboard">← Dashboard</NavLink>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Phone numbers</span>
      </div>

      <div className="uploads-head">
        <div className="title">Phone numbers</div>
      </div>

      {/* search card */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <form onSubmit={runSearch} style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: 8 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="hint">Country</span>
            <select value={country} onChange={e => setCountry(e.target.value)} className="input">
              <option value="US">US</option>
              <option value="CA">CA</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="hint">Area code</span>
            <input value={areaCode} onChange={e => setAreaCode(e.target.value)} className="input" placeholder="949" />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="hint">Contains</span>
            <input value={contains} onChange={e => setContains(e.target.value)} className="input" placeholder="555" />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="hint">Limit</span>
            <input type="number" min={1} max={50} value={limit} onChange={e => setLimit(Number(e.target.value || 20))} className="input" />
          </label>
          <div style={{ display: "grid", gap: 4 }}>
            <span className="hint">Capabilities</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label><input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} /> SMS</label>
              <label><input type="checkbox" checked={mms} onChange={e => setMms(e.target.checked)} /> MMS</label>
              <label><input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} /> Voice</label>
            </div>
          </div>
          <div style={{ display: "grid", alignContent: "end" }}>
            <button className="btn" disabled={loading} type="submit">{loading ? "Searching…" : "Search"}</button>
          </div>
        </form>
        {err && <div style={{ color: "var(--danger)", marginTop: 8 }}>{err}</div>}
      </div>

      {/* results table */}
      <div className="card">
        <div className="card-head">Available numbers</div>
        <div className="table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>City / Region</th>
                <th>Country</th>
                <th>Capabilities</th>
                <th className="right">Buy</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td className="empty" colSpan={5}>No results yet. Adjust filters and search.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.phoneNumber}>
                  <td className="file">{r.phoneNumber}</td>
                  <td>{[r.locality, r.region].filter(Boolean).join(", ")}</td>
                  <td>{r.isoCountry}</td>
                  <td>
                    <span className="chip">{r.capabilities?.sms ? "SMS" : ""}</span>{" "}
                    <span className="chip">{r.capabilities?.mms ? "MMS" : ""}</span>{" "}
                    <span className="chip">{r.capabilities?.voice ? "Voice" : ""}</span>
                  </td>
                  <td className="right">
                    <button className="btn" onClick={() => buy(r)} disabled={loading}>Buy</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
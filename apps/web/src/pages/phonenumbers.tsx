import React, { useEffect, useMemo, useState } from "react";

type AvailNum = {
  friendlyName?: string | null;
  phoneNumber: string;
  locality?: string | null;
  region?: string | null;
  isoCountry?: string;
  rateCenter?: string | null;
  postalCode?: string | null;
  capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean };
};

async function getJSON<T>(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

async function postJSON<T>(url: string, body: any) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export default function PhoneNumbers() {
  // Search state
  const [country, setCountry] = useState("US");
  const [sms, setSms] = useState(true);
  const [mms, setMms] = useState(false);
  const [voice, setVoice] = useState(false);
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [limit, setLimit] = useState(20);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AvailNum[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busySid, setBusySid] = useState<string | null>(null);
  const [msid, setMsid] = useState(""); // optional messaging service

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("country", country);
    if (sms) p.set("sms", "true");
    if (mms) p.set("mms", "true");
    if (voice) p.set("voice", "true");
    if (areaCode) p.set("areaCode", areaCode);
    if (contains) p.set("contains", contains);
    p.set("limit", String(limit));
    return p.toString();
  }, [country, sms, mms, voice, areaCode, contains, limit]);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const data = await getJSON<{ ok: boolean; data: AvailNum[] }>(`/api/numbers/available?${qs}`);
      setRows(data.data || []);
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function purchase(phoneNumber: string) {
    try {
      setBusySid(phoneNumber);
      const body = { country, phoneNumber, makeDefault: rows.length === 0, messagingServiceSid: msid || undefined };
      const resp = await postJSON<{ ok: boolean; number?: any; error?: string }>("/api/numbers/purchase", body);
      if (!resp.ok) throw new Error(resp.error || "Purchase failed");
      alert(`Purchased ${resp.number?.number || phoneNumber}.`);
    } catch (e: any) {
      alert(e?.message || "Purchase failed");
    } finally {
      setBusySid(null);
    }
  }

  return (
    <div className="p-uploads" style={{ maxWidth: 980 }}>
      <div className="crumbs" style={{ marginBottom: 8 }}>
        <a href="/dashboard" className="crumb-back">← Dashboard</a>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Phone numbers</span>
      </div>

      <div className="uploads-head">
        <div className="title">Buy phone numbers</div>
      </div>

      {/* Search card */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
          <div>
            <label className="label">Country</label>
            <input className="input" value={country} onChange={e => setCountry(e.target.value.toUpperCase())} placeholder="US" />
          </div>
          <div>
            <label className="label">Area code</label>
            <input className="input" value={areaCode} onChange={e => setAreaCode(e.target.value)} placeholder="e.g. 949" />
          </div>
          <div>
            <label className="label">Contains</label>
            <input className="input" value={contains} onChange={e => setContains(e.target.value)} placeholder="e.g. 555" />
          </div>
          <div>
            <label className="label">Limit</label>
            <input className="input" type="number" min={1} max={50} value={limit} onChange={e => setLimit(parseInt(e.target.value || "20", 10))} />
          </div>
          <div>
            <label className="label">Messaging Service SID (optional)</label>
            <input className="input" value={msid} onChange={e => setMsid(e.target.value)} placeholder="MGxxxxxxxx…" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={sms} onChange={e => setSms(e.target.checked)} /> SMS
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={mms} onChange={e => setMms(e.target.checked)} /> MMS
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} /> Voice
          </label>

          <button className="btn" onClick={search} disabled={loading} style={{ marginLeft: "auto" }}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="card">
        <div className="card-head">Available numbers</div>
        <div className="table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Region</th>
                <th>Capabilities</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td className="empty" colSpan={4}>{error ? error : "No results yet. Run a search."}</td></tr>
              )}
              {rows.map(n => (
                <tr key={n.phoneNumber}>
                  <td className="file">
                    <div className="filecell">
                      <div className="fname">{n.phoneNumber}</div>
                      <div className="fmeta">{n.friendlyName || ""}</div>
                    </div>
                  </td>
                  <td>{[n.locality, n.region, n.isoCountry].filter(Boolean).join(", ")}</td>
                  <td>
                    <span className="pill" style={{ opacity: n.capabilities?.sms ? 1 : .4 }}>SMS</span>{" "}
                    <span className="pill" style={{ opacity: n.capabilities?.mms ? 1 : .4 }}>MMS</span>{" "}
                    <span className="pill" style={{ opacity: n.capabilities?.voice ? 1 : .4 }}>Voice</span>
                  </td>
                  <td className="right">
                    <button
                      className="btn"
                      disabled={busySid === n.phoneNumber}
                      onClick={() => purchase(n.phoneNumber)}
                    >
                      {busySid === n.phoneNumber ? "Purchasing…" : "Purchase"}
                    </button>
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
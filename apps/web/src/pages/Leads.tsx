import { useEffect, useState } from "react";
import { getLeads, type Lead } from "../lib/api";

type Status = "idle" | "loading" | "error" | "ready";

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string | null>(null);

  async function loadLeads() {
    setStatus("loading");
    setErr(null);
    try {
      const data = await getLeads();
      setLeads(data);
      setStatus("ready");
    } catch (e: any) {
      setErr(e?.message || "Load failed");
      setStatus("error");
    }
  }

  useEffect(() => {
    loadLeads();
  }, []);

  return (
    <section className="card">
      <h2>Leads</h2>
      {status === "loading" && <p>Loading leads...</p>}
      {status === "error" && <p className="error">Error: {err}</p>}
      {status !== "loading" && leads.length > 0 && (
        <ul className="list">
          {leads.map((l) => (
            <li key={l.id}>
              <strong>{l.name}</strong> — {l.email}
            </li>
          ))}
        </ul>
      )}
      {status === "ready" && leads.length === 0 && <p>No leads yet.</p>}
    </section>
  );
}

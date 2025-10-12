// apps/web/src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
import { getLeads, type Lead } from "../lib/api";

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setStatus("loading");
      setErr(null);
      try {
        const data = await getLeads();
        setLeads(data);
        setStatus("ready");
      } catch (e: any) {
        setErr(e?.message || "Failed to load leads");
        setStatus("error");
      }
    })();
  }, []);

  return (
    <div className="dash">
      <h2>Leads</h2>
      {status === "loading" && <p>Loading…</p>}
      {status === "error" && <p className="error">Error: {err}</p>}
      {status === "ready" && leads.length === 0 && <p>No leads yet.</p>}
      {leads.length > 0 && (
        <ul className="lead-list">
          {leads.map((l) => (
            <li key={l.id}>
              <strong>{l.name}</strong> — {l.email}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

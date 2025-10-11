import { useEffect, useState } from "react";
import { getLeads, type Lead } from "./lib/api";

export default function App() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getLeads();
        if (alive) setLeads(data);
      } catch (e: any) {
        console.error("getLeads error:", e);
        if (alive) setError(e?.message ?? "Load failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto", padding: 16 }}>
      <h1>GroScales</h1>
      <nav style={{ marginBottom: 16 }}>
        <button style={{ padding: "6px 10px", borderRadius: 8, background: "#0f172a", color: "white", border: 0 }}>
          Leads
        </button>
      </nav>

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      {!error && !leads && <p>Loading leads…</p>}

      {leads && (
        <ul style={{ lineHeight: 1.8 }}>
          {leads.map((l) => (
            <li key={l.id}>
              <strong>{l.name || `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || "(no name)"}</strong>
              {l.email ? ` — ${l.email}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// apps/web/src/App.tsx
import { useEffect, useState } from "react";
import { getLeads, type Lead } from "./lib/api";

export default function App() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setError(null);
        setLeads(null);
        const data = await getLeads(ac.signal);
        setLeads(data);
      } catch (e: any) {
        setError(e?.message ?? "Load failed");
      }
    })();
    return () => ac.abort();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>GroScales</h1>
      <nav><button>Leads</button></nav>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {!error && !leads && <p>Loading leads…</p>}

      {leads && (
        <ul>
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

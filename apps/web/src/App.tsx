// apps/web/src/App.tsx
import { useEffect, useState } from "react";
import type { Lead } from "./lib/api";
import { getLeads } from "./lib/api";

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
        if (!alive) return;
        const msg =
          e instanceof Error ? e.message : typeof e === "string" ? e : "Load failed";
        setError(msg);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>GroScales</h1>

      <nav style={{ margin: "1rem 0" }}>
        <button
          style={{
            background: "#0b1220",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 12px",
            border: "none",
          }}
        >
          Leads
        </button>
      </nav>

      {!leads && !error && <p>Loading leads…</p>}
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      {leads && (
        <ul>
          {leads.map((l) => (
            <li key={l.id}>
              <strong>{l.name}</strong> — {l.email}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

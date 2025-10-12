// apps/web/src/App.tsx
import { useEffect, useState } from "react";
import { fetchLeads, type Lead } from "./lib/api";

export default function App() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchLeads();
        if (!cancelled) {
          setLeads(data);
          setError(null);
        }
      } catch (e: any) {
        if (cancelled) return;

        const msg =
          e?.message?.includes("HTTP 0")
            ? "CORS/opaque response (check API allow-list)"
            : e?.message || "Load failed";

        setError(msg);

        // simple retry when API is waking up
        if (tries < 6) {
          setTimeout(() => setTries((t) => t + 1), 1500);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tries]);

  return (
    <div style={{ padding: 24 }}>
      <h1>GroScales</h1>

      <nav style={{ margin: "12px 0" }}>
        <button>Leads</button>
      </nav>

      {!leads && !error && (
        <p>Still waking the API (try {tries}/{6})…</p>
      )}
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {leads && (
        <ul>
          {leads.map((l) => (
            <li key={l.id}>
              {l.name} — <code>{l.email}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
vvvvvvvvvvvvvvvvvvvvvvvvvvvvv

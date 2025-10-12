// apps/web/src/App.tsx
import { useEffect, useState } from 'react';
import { fetchLeads, type Lead } from './lib/api';

function LeadsList({ leads }: { leads: Lead[] }) {
  if (!leads.length) return <p>No leads yet.</p>;
  return (
    <ul style={{ lineHeight: 1.8 }}>
      {leads.map(l => (
        <li key={l.id}>
          <strong>{l.name}</strong> — {l.email}
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // for wake/retry

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError(null);
        const data = await fetchLeads();
        if (!cancelled) setLeads(data);
      } catch (err) {
        if (cancelled) return;
        // Gentle wake-up retry loop (Render free dynos can sleep)
        if (attempt < 6) {
          setError(`API is still starting. Please try again in a moment.`);
          setTimeout(() => setAttempt(a => a + 1), 1500);
        } else {
          setError('Load failed');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div style={{ padding: 16 }}>
      <h1>GroScales</h1>
      <nav style={{ marginBottom: 12 }}>
        <button
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            background: '#0f172a',
            color: 'white',
            border: 'none',
          }}
        >
          Leads
        </button>
      </nav>

      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {!error && !leads && <p>Loading leads...</p>}
      {leads && <LeadsList leads={leads} />}
    </div>
  );
}

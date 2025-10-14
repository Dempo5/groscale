import { useEffect, useMemo, useState } from "react";
import { listLeads, logout } from "../lib/api";
import "./dashboard.css";

type Lead = {
  id: string | number;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
};

const formatTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await listLeads();
        setLeads(data);
        setActiveId(data[0]?.id ?? null);
      } catch (e: any) {
        // if token invalid, api.ts should throw "Unauthorized" -> bounce to login
        if (String(e?.message || "").toLowerCase().includes("unauthorized")) {
          window.location.href = "/login";
          return;
        }
        setErr(e?.message || "Failed to load leads");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(l =>
      [l.name, l.email, l.phone].some(v => (v || "").toLowerCase().includes(q))
    );
  }, [leads, query]);

  const active = useMemo(
    () => filtered.find((l) => l.id === activeId) || null,
    [filtered, activeId]
  );

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo-dot" />
          <div className="logo-text">GroScales</div>
          <span className="pill">Dashboard</span>
        </div>

        <div className="top-actions">
          <div className="search">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search leads…"
              aria-label="Search leads"
            />
            <kbd>/</kbd>
          </div>

          <button className="ghost" onClick={() => { logout(); window.location.href = "/login"; }}>
            Logout
          </button>
        </div>
      </header>

      <main className="workspace">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="section-title">Queues</div>
          <nav className="nav">
            <a className="nav-item active"><span className="dot blue" /> All</a>
            <a className="nav-item"><span className="dot green" /> New</a>
            <a className="nav-item"><span className="dot amber" /> Follow-ups</a>
            <a className="nav-item"><span className="dot purple" /> Won</a>
            <a className="nav-item"><span className="dot gray" /> Archived</a>
          </nav>

          <div className="divider" />

          <div className="small muted">
            Tip: Press <kbd>/</kbd> to focus search. ↑/↓ to move, Enter to open.
          </div>
        </aside>

        {/* Lead list */}
        <section className="list">
          <div className="list-head">
            <h2>Leads {loading ? "" : `· ${filtered.length}`}</h2>
          </div>

          {err && <div className="alert error">{err}</div>}
          {loading && <div className="skeleton-list">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sk-row" />)}
          </div>}

          {!loading && filtered.length === 0 && (
            <div className="empty">
              <div className="empty-icon">🗂️</div>
              <div>No leads match “{query}”.</div>
            </div>
          )}

          <ul className="rows" role="listbox" aria-label="Leads">
            {filtered.map(l => (
              <li
                key={l.id}
                className={`row ${activeId === l.id ? "selected" : ""}`}
                onClick={() => setActiveId(l.id)}
                role="option"
                aria-selected={activeId === l.id}
              >
                <div className="avatar">{(l.name || l.email || "?").slice(0,1).toUpperCase()}</div>
                <div className="meta">
                  <div className="title">{l.name || "Untitled lead"}</div>
                  <div className="sub">{l.email}{l.phone ? ` · ${l.phone}` : ""}</div>
                </div>
                <div className="time">{formatTime(l.createdAt)}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* Details / conversation stub */}
        <section className="detail">
          {!active ? (
            <div className="empty-detail">
              <div className="empty-icon">✨</div>
              <div>Select a lead to view details</div>
            </div>
          ) : (
            <div className="detail-card">
              <div className="detail-head">
                <div className="avatar lg">{(active.name || active.email).slice(0,1).toUpperCase()}</div>
                <div>
                  <div className="title">{active.name || "Untitled lead"}</div>
                  <div className="sub">{active.email}{active.phone ? ` · ${active.phone}` : ""}</div>
                </div>
                <div className="spacer" />
                <button className="primary">Create quote</button>
              </div>

              <div className="tabs">
                <button className="tab active">Overview</button>
                <button className="tab">Notes</button>
                <button className="tab">Timeline</button>
              </div>

              <div className="grid">
                <div className="card">
                  <div className="card-title">Contact</div>
                  <div className="kv"><span>Email</span><b>{active.email}</b></div>
                  <div className="kv"><span>Phone</span><b>{active.phone || "—"}</b></div>
                  <div className="kv"><span>Created</span><b>{formatTime(active.createdAt)}</b></div>
                </div>

                <div className="card">
                  <div className="card-title">Next steps</div>
                  <ul className="disc">
                    <li>Confirm coverage preferences</li>
                    <li>Collect DOB & ZIP for quote</li>
                    <li>Schedule call</li>
                  </ul>
                </div>

                <div className="card span-2">
                  <div className="card-title">Activity</div>
                  <div className="timeline">
                    <div className="tl-row"><span className="dot blue" /> Lead created</div>
                    <div className="tl-row"><span className="dot green" /> Email sent</div>
                    <div className="tl-row"><span className="dot amber" /> Awaiting reply</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

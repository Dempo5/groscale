import { useEffect, useMemo, useRef, useState } from "react";
import { listLeads, logout } from "../lib/api";
import "./dashboard-v2.css";

type Lead = {
  id: string | number;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
};

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await listLeads();
        setLeads(data);
        setActive(data[0] ?? null);
      } catch (e: any) {
        if (String(e?.message).toLowerCase().includes("unauthorized")) {
          window.location.href = "/login";
          return;
        }
        setErr(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // keyboard: / to focus search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return leads;
    return leads.filter(l =>
      [l.name, l.email, l.phone].some(v => (v || "").toLowerCase().includes(s))
    );
  }, [leads, q]);

  return (
    <div className="gs-shell">
      {/* top bar */}
      <header className="gs-topbar">
        <div className="gs-left">
          <div className="gs-logo">
            <div className="dot" />
            <span>GroScales</span>
            <em>Sales</em>
          </div>
          <div className="gs-search">
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search leads" />
            <kbd>/</kbd>
          </div>
        </div>
        <div className="gs-right">
          <button className="ghost">New lead</button>
          <button
            className="ghost"
            onClick={() => {
              logout();
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* workspace */}
      <div className="gs-work">
        {/* left rail */}
        <aside className="rail">
          <a className="rail-item active" title="Leads">💼</a>
          <a className="rail-item" title="Inbox">💬</a>
          <a className="rail-item" title="Tasks">✅</a>
          <a className="rail-item" title="Reports">📊</a>
          <div className="rail-spacer" />
          <a className="rail-item" title="Settings">⚙️</a>
        </aside>

        {/* list */}
        <section className="panel list">
          <div className="panel-head">
            <h2>Leads {loading ? "" : `· ${filtered.length}`}</h2>
          </div>

          {err && <div className="alert">{err}</div>}
          {loading && (
            <div className="sk">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="sk-row" />)}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="empty">No results for “{q}”.</div>
          )}

          <ul className="rows">
            {filtered.map(l => {
              const selected = active?.id === l.id;
              return (
                <li
                  key={l.id}
                  className={`row ${selected ? "selected" : ""}`}
                  onClick={() => setActive(l)}
                >
                  <div className="avatar">{(l.name || l.email).slice(0,1).toUpperCase()}</div>
                  <div className="meta">
                    <div className="title">{l.name || "Untitled lead"}</div>
                    <div className="sub">
                      {l.email}{l.phone ? ` · ${l.phone}` : ""} <span className="time">{fmt(l.createdAt)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* conversation */}
        <section className="panel convo">
          {!active ? (
            <div className="empty big">Select a lead to view conversation</div>
          ) : (
            <>
              <div className="convo-head">
                <div className="avatar lg">{(active.name || active.email).slice(0,1).toUpperCase()}</div>
                <div className="meta">
                  <div className="title">{active.name || "Untitled lead"}</div>
                  <div className="sub">{active.email}{active.phone ? ` · ${active.phone}` : ""}</div>
                </div>
                <div className="spacer" />
                <button className="primary">Create quote</button>
              </div>

              <div className="messages">
                {/* demo bubbles for now */}
                <div className="bubble theirs">
                  Hi! I’m exploring coverage options. What plans do you recommend?
                  <div className="stamp">Oct 12 · 9:14 AM</div>
                </div>
                <div className="bubble mine">
                  Great to meet you. I’ll compare Blue Cross + United and send a quick quote today.
                  <div className="stamp">Oct 12 · 9:17 AM</div>
                </div>
              </div>

              <div className="composer">
                <input placeholder="Type a message… (coming soon)" disabled />
                <button className="primary" disabled>Send</button>
              </div>
            </>
          )}
        </section>

        {/* details */}
        <section className="panel details">
          {!active ? (
            <div className="empty">No lead selected</div>
          ) : (
            <>
              <div className="card">
                <div className="label">Contact</div>
                <div className="kv"><span>Email</span><b>{active.email}</b></div>
                <div className="kv"><span>Phone</span><b>{active.phone || "—"}</b></div>
                <div className="kv"><span>Created</span><b>{fmt(active.createdAt) || "—"}</b></div>
              </div>

              <div className="card">
                <div className="label">Tags</div>
                <div className="chips">
                  <span className="chip green">new</span>
                  <span className="chip blue">follow-up</span>
                </div>
              </div>

              <div className="card">
                <div className="label">Next steps</div>
                <ul className="disc">
                  <li>Confirm family size + DOB</li>
                  <li>ZIP & preferences</li>
                  <li>Schedule call</li>
                </ul>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
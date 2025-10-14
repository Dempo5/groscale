import { useEffect, useMemo, useRef, useState } from "react";
import { listLeads, logout } from "../lib/api";
import "./dashboard-pitch.css";

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

  // load leads
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

  // "/" focuses search
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
    return leads.filter((l) =>
      [l.name, l.email, l.phone].some((v) => (v || "").toLowerCase().includes(s))
    );
  }, [leads, q]);

  return (
    <div className="p-shell">
      {/* top bar */}
      <header className="p-topbar">
        <div className="brand">
          <div className="dot" />
          <span>GroScales</span>
          <em>Conversations</em>
        </div>

        <div className="actions">
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

      {/* three columns */}
      <main className="p-work">
        {/* LEFT: conversations */}
        <section className="panel convo-list">
          <div className="panel-head">
            <div className="title">Messages</div>
            <button className="small ghost">+ New chat</button>
          </div>

          <div className="search">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search messages…"
            />
            <kbd>/</kbd>
          </div>

          {err && <div className="alert">{err}</div>}
          {loading && (
            <div className="sk">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="sk-row" />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="empty">No results for “{q}”.</div>
          )}

          <ul className="rows">
            {filtered.map((l) => {
              const selected = active?.id === l.id;
              return (
                <li
                  key={l.id}
                  className={`row ${selected ? "selected" : ""}`}
                  onClick={() => setActive(l)}
                >
                  <div className="avatar">
                    {(l.name || l.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="meta">
                    <div className="name">{l.name || "Untitled lead"}</div>
                    <div className="sub">
                      {l.email}
                      {l.phone ? ` · ${l.phone}` : ""} <span className="time">{fmt(l.createdAt)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* MIDDLE: messages thread (closer to left) */}
        <section className="panel thread">
          {!active ? (
            <div className="empty big">Select a conversation</div>
          ) : (
            <>
              <div className="thread-head">
                <div className="avatar lg">
                  {(active.name || active.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="meta">
                  <div className="name">{active.name || "Untitled lead"}</div>
                  <div className="sub">
                    {active.email}
                    {active.phone ? ` · ${active.phone}` : ""}
                  </div>
                </div>
                <div className="spacer" />
                <div className="presence">● Live</div>
              </div>

              <div className="messages">
                {/* demo bubbles */}
                <div className="bubble theirs">
                  Hi! I’m exploring a few health plans. Can you help?
                  <div className="stamp">9:41 AM</div>
                </div>
                <div className="bubble mine">
                  Absolutely. I can compare Blue Cross and United and send a quick quote.
                  <div className="stamp">9:42 AM</div>
                </div>
              </div>

              <div className="composer">
                <input placeholder="Type your message… (coming soon)" disabled />
                <div className="composer-actions">
                  <button className="ghost small">Templates</button>
                  <button className="ghost small">Fields</button>
                  <button className="ghost small">Emoji</button>
                  <button className="ghost small">Schedule</button>
                </div>
                <button className="primary" disabled>
                  Send
                </button>
              </div>
            </>
          )}
        </section>

        {/* RIGHT: lead info like OnlySales */}
        <aside className="panel details">
          {!active ? (
            <div className="empty">Lead details</div>
          ) : (
            <>
              <div className="card">
                <div className="label">Lead</div>
                <div className="kv">
                  <span>Name</span>
                  <b>{active.name || "—"}</b>
                </div>
                <div className="kv">
                  <span>Email</span>
                  <b>{active.email}</b>
                </div>
                <div className="kv">
                  <span>Phone</span>
                  <b>{active.phone || "—"}</b>
                </div>
                <div className="kv">
                  <span>Created</span>
                  <b>{fmt(active.createdAt) || "—"}</b>
                </div>
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
                  <li>Collect ZIP, DOB, dependents</li>
                  <li>Confirm preferences</li>
                  <li>Send quote</li>
                </ul>
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
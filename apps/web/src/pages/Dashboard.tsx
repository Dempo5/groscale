// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { listLeads, logout } from "../lib/api";
import "./dashboard-pitch.css";

type Lead = {
  id: string | number;
  name: string;
  email: string;
  phone?: string | null;
  createdAt?: string;
  // optional enriched fields for the inspector (show blank if not present)
  firstName?: string | null;
  lastName?: string | null;
  dob?: string | null;        // ISO or mm/dd/yyyy
  age?: number | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  householdSize?: number | null;
  quote?: string | null;
};

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

function CopyChip({ value, label }: { value?: string | null; label: string }) {
  if (!value) return <span className="pill muted">—</span>;
  return (
    <button
      className="pill copy"
      onClick={() => navigator.clipboard.writeText(value)}
      title={`Copy ${label}`}
    >
      {value}
      <svg width="14" height="14" viewBox="0 0 24 24" className="copy-icon" aria-hidden>
        <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
      </svg>
    </button>
  );
}

function LeftNav() {
  // simple inline SVGs to avoid emoji look
  const items = [
    { key: "analytics", label: "Analytics", icon: AnalyticIcon },
    { key: "contacts", label: "Contacts", icon: ContactsIcon },
    { key: "workflows", label: "Workflows", icon: FlowIcon },
    { key: "phones", label: "Phone numbers", icon: PhoneIcon },
    { key: "tags", label: "Tags", icon: TagIcon },
    { key: "templates", label: "Templates", icon: TemplateIcon },
    { key: "uploads", label: "Uploads (CSV)", icon: UploadIcon },
  ];
  return (
    <aside className="leftnav">
      {items.map(({ key, label, icon: Icon }, i) => (
        <button key={key} className={`nav-item ${i === 1 ? "active" : ""}`} title={label}>
          <Icon />
        </button>
      ))}
      <div className="nav-spacer" />
      <button className="nav-item" title="Settings">
        <GearIcon />
      </button>
    </aside>
  );
}

// --- inline icons (stroke-only, minimal) ---
function AnalyticIcon(){return(<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-6m4 6H2" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/></svg>)}
function ContactsIcon(){return(<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" fill="none"/><path d="M4 20c1.6-3.4 5-5.5 8-5.5s6.4 2.1 8 5.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/></svg>)}
function FlowIcon(){return(<svg viewBox="0 0 24 24"><path d="M6 6h6v4H6zM12 14h6v4h-6zM12 10v4" stroke="currentColor" strokeWidth="1.7" fill="none"/></svg>)}
function PhoneIcon(){return(<svg viewBox="0 0 24 24"><path d="M6 2h6l2 4-3 2c.8 1.8 2.2 3.2 4 4l2-3 4 2v6c0 1.1-.9 2-2 2C12 21 3 12 3 4c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>)}
function TagIcon(){return(<svg viewBox="0 0 24 24"><path d="M3 10l8-8h6l4 4v6l-8 8-10-10z" stroke="currentColor" strokeWidth="1.5" fill="none"/><circle cx="16" cy="8" r="1.6" fill="currentColor"/></svg>)}
function TemplateIcon(){return(<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M3 10h18M9 4v16" stroke="currentColor" strokeWidth="1.5"/></svg>)}
function UploadIcon(){return(<svg viewBox="0 0 24 24"><path d="M12 16V6m0 0l-4 4m4-4l4 4M4 18h16" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round"/></svg>)}
function GearIcon(){return(<svg viewBox="0 0 24 24"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M19 13.6v-3.2l-2.1-.6-.6-2.1L14 7 12.4 5H11l-1.6 2L7.7 7.7l-.6 2.1L5 10.4v3.2l2.1.6.6 2.1L10 17l1.6 2H13l1.6-2 1.7-.7.6-2.1L19 13.6Z" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>)}

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
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return leads;
    return leads.filter(l => [l.name, l.email, l.phone].some(v => (v||"").toLowerCase().includes(s)));
  }, [leads, q]);

  return (
    <div className="p-shell">
      <header className="p-topbar">
        <div className="brand">
          <div className="dot" />
          <span>GroScales</span>
          <em>Sales</em>
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => { logout(); window.location.href = "/login"; }}>
            Logout
          </button>
        </div>
      </header>

      <main className="p-work">
        {/* LEFT NAV */}
        <LeftNav />

        {/* CONVERSATIONS LIST */}
        <section className="panel convo-list compact">
          <div className="panel-head">
            <div className="title">Leads {loading ? "" : `· ${filtered.length}`}</div>
            <button className="small ghost">+ New lead</button>
          </div>
          <div className="search">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search leads…"
            />
            <kbd>/</kbd>
          </div>
          {err && <div className="alert">{err}</div>}
          {loading && <div className="sk">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="sk-row" />)}</div>}
          {!loading && filtered.length === 0 && <div className="empty">No results for “{q}”.</div>}
          <ul className="rows">
            {filtered.map(l => {
              const sel = active?.id === l.id;
              return (
                <li key={l.id} className={`row dense ${sel ? "selected" : ""}`} onClick={() => setActive(l)}>
                  <div className="avatar">{(l.name || l.email).slice(0,1).toUpperCase()}</div>
                  <div className="meta">
                    <div className="name">{l.name || "Untitled lead"}</div>
                    <div className="sub">
                      {l.email}{l.phone ? ` · ${l.phone}` : ""} <span className="time">{fmtDate(l.createdAt)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* THREAD */}
        <section className="panel thread snug">
          {!active ? (
            <div className="empty big">Select a conversation</div>
          ) : (
            <>
              <div className="thread-head">
                <div className="avatar lg">{(active.name || active.email).slice(0,1).toUpperCase()}</div>
                <div className="meta">
                  <div className="name">{active.name || "Untitled lead"}</div>
                  <div className="sub">{active.email}{active.phone ? ` · ${active.phone}` : ""}</div>
                </div>
                <div className="spacer" />
                <div className="presence">● Live</div>
              </div>

              <div className="messages">
                {/* placeholder bubbles (smaller) */}
                <div className="bubble theirs">
                  Hi! I’m exploring coverage options. What plans do you recommend?
                  <div className="stamp">9:14 AM</div>
                </div>
                <div className="bubble mine">
                  Great to meet you. I’ll compare Blue Cross and United and send a quick quote today.
                  <div className="stamp">9:17 AM</div>
                </div>
              </div>

              <div className="composer tight">
                <input placeholder="Type your message… (coming soon)" disabled />
                <div className="composer-actions">
                  <button className="ghost small">Templates</button>
                  <button className="ghost small">Fields</button>
                  <button className="ghost small">Emoji</button>
                  <button className="ghost small">Schedule</button>
                </div>
                <button className="primary" disabled>Send</button>
              </div>
            </>
          )}
        </section>

        {/* DETAILS INSPECTOR */}
        <aside className="panel details">
          {!active ? (
            <div className="empty">Lead details</div>
          ) : (
            <>
              <div className="card">
                <div className="label">Contact</div>

                {/* Full name with copy of display name */}
                <div className="kv">
                  <span>Full name</span>
                  <div className="val">
                    <CopyChip value={active.name || [active.firstName, active.lastName].filter(Boolean).join(" ")} label="full name" />
                  </div>
                </div>

                <div className="kv">
                  <span>First name</span>
                  <div className="val">{active.firstName || "—"}</div>
                </div>
                <div className="kv">
                  <span>Last name</span>
                  <div className="val">{active.lastName || "—"}</div>
                </div>

                <div className="kv">
                  <span>Email</span>
                  <div className="val"><CopyChip value={active.email} label="email" /></div>
                </div>

                <div className="kv">
                  <span>Phone</span>
                  <div className="val"><CopyChip value={active.phone || ""} label="phone" /></div>
                </div>

                <div className="kv">
                  <span>DOB</span>
                  <div className="val">{active.dob || "—"}</div>
                </div>
                <div className="kv">
                  <span>Age</span>
                  <div className="val">{active.age ?? "—"}</div>
                </div>

                <div className="kv">
                  <span>City</span>
                  <div className="val">{active.city || "—"}</div>
                </div>
                <div className="kv">
                  <span>State</span>
                  <div className="val">{active.state || "—"}</div>
                </div>

                <div className="kv">
                  <span>ZIP</span>
                  <div className="val"><CopyChip value={active.zip || ""} label="zip" /></div>
                </div>

                <div className="kv">
                  <span>Household size</span>
                  <div className="val">{active.householdSize ?? "—"}</div>
                </div>

                <div className="kv">
                  <span>Quote</span>
                  <div className="val">{active.quote || "—"}</div>
                </div>

                <div className="kv">
                  <span>Created</span>
                  <div className="val">{fmtDate(active.createdAt) || "—"}</div>
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
                  <li>Confirm family size + DOB</li>
                  <li>ZIP & preferences</li>
                  <li>Schedule call</li>
                </ul>
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import "./dashboard-ios.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

const Icon = {
  analytics: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h2v16H4V4zm7 6h2v10h-2V10zm7-4h2v14h-2V6z" fill="currentColor"/></svg>
  ),
  contacts: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0H5z" fill="currentColor"/></svg>
  ),
  workflows: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4H7V4zm0 6h5v4H7v-4zm7 0h3v4h-3v-4zm-7 6h10v4H7v-4z" fill="currentColor"/></svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.3 15.3 0 006.6 6.6l2.2-2.2c.2-.2.5-.3.8-.2 1 .4 2 .6 3.1.6.4 0 .7.3.7.7V20c0 .4-.3.7-.7.7C10.8 20.7 3.3 13.2 3.3 3.9c0-.4.3-.7.7-.7H8c.4 0 .7.3.7.7 0 1.1.2 2.1.6 3.1.1.3 0 .6-.2.8l-2.5 3z" fill="currentColor"/></svg>
  ),
  tags: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3l9 9-7 7-9-9V3h7zm-3 4a1 1 0 100-2 1 1 0 000 2z" fill="currentColor"/></svg>
  ),
  templates: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4V4zm0 6h10v4H4v-4zm0 6h16v4H4v-4z" fill="currentColor"/></svg>
  ),
  uploads: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l5 5h-3v6h-4V8H7l5-5zm-7 16h14v2H5v-2z" fill="currentColor"/></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 110 8 4 4 0 010-8zm9 3l-2-.6a7 7 0 00-.7-1.6l1.2-1.7-2.1-2.1-1.7 1.2c-.5-.3-1-.5-1.6-.7L12 2l-1 .3-1 .3-.4 2.1c-.6.2-1.1.4-1.6.7L6.3 4.9 4.2 7l1.2 1.7c-.3.5-.5 1-.7 1.6L2 12l.3 1 .3 1 2.1.4c.2.6.4 1.1.7 1.6L4.9 18l2.1 2.1 1.7-1.2c.5.3 1 .5 1.6.7L12 22l1-.3 1-.3.4-2.1c.6-.2 1.1-.4 1.6-.7l1.7 1.2L21 18l-1.2-1.7c.3-.5.5-1 .7-1.6L22 12l-1-.3-1-.3z" fill="currentColor"/></svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
};

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("gs_theme") as "light" | "dark") || "light"
  );
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    localStorage.setItem("gs_theme", theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      try {
        const list = await getLeads();
        setLeads(list);
        if (!selectedId && list.length) setSelectedId(list[0].id);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const selected = useMemo(
    () => leads.find((l) => String(l.id) === String(selectedId)) || null,
    [leads, selectedId]
  );

  const messages: Msg[] = useMemo(() => {
    if (!selected) return [];
    return [
      {
        id: "m1",
        from: "lead",
        text: "Hi! I’m exploring coverage options. What plans do you recommend?",
        at: "9:14 AM",
      },
      {
        id: "m2",
        from: "me",
        text:
          "Great to meet you. I’ll compare Blue Cross and United and send a quick quote today.",
        at: "9:17 AM",
      },
    ];
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.phone ?? "").toLowerCase().includes(q)
    );
  }, [query, leads]);

  function copy(v?: string | null) {
    if (!v) return;
    navigator.clipboard?.writeText(v).catch(() => {});
  }
  function onLogout() {
    logout();
    window.location.href = "/login";
  }

  return (
    <div className={`p-shell ${railOpen ? "rail-open" : ""}`}>
      {/* Top bar (glass) */}
      <header className="p-topbar">
        <div className="brand">
          <span className="dot" />
          GroScales
        </div>
        <div className="actions">
          <button
            className="ghost"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title="Toggle light/dark"
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <button className="primary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="p-work">
        {/* Collapsible left rail (glass) */}
        <nav className={`leftnav ${railOpen ? "open" : "closed"}`}>
          <button
            className="collapse"
            aria-label={railOpen ? "Collapse" : "Expand"}
            onClick={() => setRailOpen((s) => !s)}
          >
            <span className={`chev ${railOpen ? "left" : "right"}`}>{Icon.chevron}</span>
          </button>

          <div className="nav-item active" title="Analytics">
            {Icon.analytics}
            <span className="label">Analytics</span>
          </div>
          <div className="nav-item" title="Contacts">
            {Icon.contacts}
            <span className="label">Contacts</span>
          </div>
          <div className="nav-item" title="Workflows">
            {Icon.workflows}
            <span className="label">Workflows</span>
          </div>
          <div className="nav-item" title="Phone numbers">
            {Icon.phone}
            <span className="label">Phone</span>
          </div>
          <div className="nav-item" title="Tags">
            {Icon.tags}
            <span className="label">Tags</span>
          </div>
          <div className="nav-item" title="Templates">
            {Icon.templates}
            <span className="label">Templates</span>
          </div>
          <div className="nav-item" title="Uploads">
            {Icon.uploads}
            <span className="label">Uploads</span>
          </div>

          <div className="nav-spacer" />
          <div className="nav-item" title="Settings">
            {Icon.settings}
            <span className="label">Settings</span>
          </div>
        </nav>

        {/* Lead list (left column) */}
        <section className="panel list">
          <div className="panel-head">
            <div className="title">Leads · {leads.length}</div>
            <button className="ghost">+ New lead</button>
          </div>

          <div className="search">
            <input
              placeholder="Search leads…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <ul className="rows">
            {filtered.map((l) => {
              const selected = String(l.id) === String(selectedId);
              return (
                <li
                  key={String(l.id)}
                  className={`row ${selected ? "selected" : ""}`}
                  onClick={() => setSelectedId(l.id)}
                >
                  <div className="avatar">{(l.name || l.email || "?").slice(0, 1).toUpperCase()}</div>
                  <div className="meta" style={{ flex: 1 }}>
                    <div className="name">{l.name || "—"}</div>
                    <div className="sub">{l.email}</div>
                  </div>
                </li>
              );
            })}
            {!filtered.length && <li className="row">No matches</li>}
          </ul>
        </section>

        {/* Thread (middle) */}
        <section className="panel thread">
          <div className="thread-head">
            <div className="avatar lg">{(selected?.name || "T").slice(0, 1).toUpperCase()}</div>
            <div className="who">
              <div className="who-name">{selected?.name || "—"}</div>
              <div className="who-email">{selected?.email}</div>
            </div>
            <div className="spacer" />
            <div className="pill">Live</div>
          </div>

          <div className="thread-tools">
            <button className="ghost">Create Quote</button>
            <button className="ghost">Call</button>
            <button className="ghost">Schedule</button>
            <button className="ghost">Add Tag</button>
          </div>

          <div className="messages" key={selected?.id ?? "none"}>
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.from === "me" ? "mine" : ""} pop`}>
                <div className="bubble-bg" />
                <div className="bubble-content">{m.text}</div>
                <div className="stamp">{m.at}</div>
              </div>
            ))}
          </div>

          <div className="composer">
            <input
              placeholder="Send a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled
            />
            <button className="ghost">Templates</button>
            <button className="primary" disabled>Send</button>
          </div>
        </section>

        {/* Inspector (right column) */}
        <aside className="details">
          <div className="card">
            <div className="label">Contact</div>
            <div className="kv-grid">
              <div className="k"><span>Full name</span><div className="v"><span>{selected?.name || "—"}</span></div></div>
              <div className="k"><span>First name</span><div className="v"><span>{(selected?.name || "").split(" ")[0] || "—"}</span></div></div>
              <div className="k"><span>Last name</span><div className="v"><span>{(selected?.name || "").split(" ").slice(1).join(" ") || "—"}</span></div></div>
              <div className="k">
                <span>Email</span>
                <div className="v">
                  <span>{selected?.email || "—"}</span>
                  {selected?.email && <button className="pill" onClick={() => copy(selected.email)}>Copy</button>}
                </div>
              </div>
              <div className="k">
                <span>Phone</span>
                <div className="v">
                  <span>{selected?.phone || "—"}</span>
                  {selected?.phone && <button className="pill" onClick={() => copy(selected.phone!)}>Copy</button>}
                </div>
              </div>
              <div className="k"><span>DOB</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>Age</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>City</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>ZIP</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>Household size</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>Quote</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>Created</span><div className="v"><span>{selected?.createdAt || "—"}</span></div></div>
            </div>
          </div>

          <div className="card">
            <div className="label">Tags</div>
            <div className="chips">
              <span className="chip">new</span>
              <span className="chip">follow-up</span>
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
        </aside>
      </main>
    </div>
  );
}
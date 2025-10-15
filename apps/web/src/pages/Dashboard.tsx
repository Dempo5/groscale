import { useEffect, useMemo, useState } from "react";
import "./dashboard-min.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

// thin, outline-only icons (no emojis)
const Icon = ({
  name,
  size = 18,
}: {
  name: "analytics" | "contacts" | "workflows" | "phone" | "tags" | "templates" | "uploads" | "settings" | "chevron";
  size?: number;
}) => {
  const s = { width: size, height: size, stroke: "currentColor", fill: "none" } as any;
  switch (name) {
    case "analytics":
      return <svg viewBox="0 0 24 24" {...s}><path d="M3 20h18M7 16V8m5 8V5m5 11v-6" strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case "contacts":
      return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="8" r="3" strokeWidth="1.5"/><path d="M5 19a7 7 0 0 1 14 0" strokeWidth="1.5"/></svg>;
    case "workflows":
      return <svg viewBox="0 0 24 24" {...s}><path d="M6 6h12M6 12h7m0 0v6M6 18h7" strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case "phone":
      return <svg viewBox="0 0 24 24" {...s}><path d="M5 4l3 2-2 3a12 12 0 0 0 8 8l3-2 2 3-2 2a3 3 0 0 1-3 1 18 18 0 0 1-14-14 3 3 0 0 1 1-3z" strokeWidth="1.5"/></svg>;
    case "tags":
      return <svg viewBox="0 0 24 24" {...s}><path d="M10 3l11 11-7 7L3 10V3z" strokeWidth="1.5"/><circle cx="7.5" cy="7.5" r="1.25" strokeWidth="1.5"/></svg>;
    case "templates":
      return <svg viewBox="0 0 24 24" {...s}><rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.5"/><path d="M8 9h8M8 13h8M8 17h5" strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case "uploads":
      return <svg viewBox="0 0 24 24" {...s}><path d="M12 16V5m0 0l-4 4m4-4l4 4M4 20h16" strokeWidth="1.5" strokeLinecap="round"/></svg>;
    case "settings":
      return <svg viewBox="0 0 24 24" {...s}><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" strokeWidth="1.4"/><path d="M19.2 14.5a7 7 0 0 0 0-5l2-1.5-1.8-3.1-2.4.7a7.7 7.7 0 0 0-1.6-1l-.3-2.3h-3.8l-.3 2.3a7.7 7.7 0 0 0-1.6 1l-2.4-.7L2.8 8l2 1.5a7 7 0 0 0 0 5L2.8 16l1.8 3.1 2.4-.7a7.7 7.7 0 0 0 1.6 1l.3 2.3h3.8l.3-2.3a7.7 7.7 0 0 0 1.6-1l2.4.7 1.8-3.1-2-1.5z" strokeWidth="1.2"/></svg>;
    case "chevron":
      return <svg viewBox="0 0 24 24" {...s}><path d="M14 7l-5 5 5 5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    default:
      return null;
  }
};

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("gs_theme") as "light" | "dark") || "light"
  );

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
      } catch (e) { console.error(e); }
    })();
  }, []);

  const selected = useMemo(
    () => leads.find((l) => String(l.id) === String(selectedId)) || null,
    [leads, selectedId]
  );

  // demo thread
  const messages: Msg[] = useMemo(() => {
    if (!selected) return [];
    return [
      { id: "m1", from: "lead", text: "Hi! I’m exploring coverage options. What plans do you recommend?", at: "9:14 AM" },
      { id: "m2", from: "me", text: "Great to meet you. I’ll compare Blue Cross and United and send a quick quote today.", at: "9:17 AM" },
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
  function onLogout() { logout(); window.location.href = "/login"; }

  return (
    <div className="p-shell">
      <header className="p-topbar">
        <div className="brand">GroScales</div>
        <div className="actions">
          <button className="ghost" onClick={() => setTheme(t => t === "light" ? "dark" : "light")}>
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <button className="primary" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <main className={`p-work ${collapsed ? "rail-collapsed" : ""}`}>
        {/* LEFT RAIL */}
        <aside className="left-rail">
          <button className="rail-toggle" title={collapsed ? "Expand" : "Collapse"} onClick={() => setCollapsed(v => !v)}>
            <Icon name="chevron" />
          </button>
          <nav className="rail-group">
            <a className="rail-item active"><Icon name="analytics"/><span>Analytics</span></a>
            <a className="rail-item"><Icon name="contacts"/><span>Contacts</span></a>
            <a className="rail-item"><Icon name="workflows"/><span>Workflows</span></a>
            <a className="rail-item"><Icon name="phone"/><span>Phone numbers</span></a>
            <a className="rail-item"><Icon name="tags"/><span>Tags</span></a>
            <a className="rail-item"><Icon name="templates"/><span>Templates</span></a>
            <a className="rail-item"><Icon name="uploads"/><span>Uploads</span></a>
          </nav>
          <div className="rail-spacer" />
          <a className="rail-item"><Icon name="settings"/><span>Settings</span></a>
        </aside>

        {/* LEAD LIST */}
        <section className="panel list">
          <div className="panel-head">
            <div className="title">Contacts</div>
            <button className="ghost">+ New</button>
          </div>
          <div className="search">
            <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="rows">
            {filtered.map((l) => {
              const sel = String(l.id) === String(selectedId);
              return (
                <li
                  key={String(l.id)}
                  className={`row ${sel ? "selected" : ""}`}
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

        {/* THREAD */}
        <section className="panel thread">
          <div className="thread-head">
            <div className="who">
              <div className="name">{selected?.name || "—"}</div>
              <div className="sub">{selected?.email}</div>
            </div>
          </div>

          <div className="messages" key={selected?.id ?? "none"}>
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.from === "me" ? "mine" : ""}`}>
                <div>{m.text}</div>
                <div className="stamp">{m.at}</div>
              </div>
            ))}
          </div>

          <div className="composer">
            <input placeholder="Send a message…" value={draft} onChange={(e) => setDraft(e.target.value)} disabled />
            <button className="ghost">Templates</button>
            <button className="primary" disabled>Send</button>
          </div>
        </section>

        {/* COMPACT INFO */}
        <aside className="panel info">
          <div className="info-section">
            <div className="label">Contact</div>
            <div className="kv">
              <span>Full name</span><span className="v">{selected?.name || "—"}</span>
            </div>
            <div className="kv">
              <span>First name</span><span className="v">{(selected?.name || "").split(" ")[0] || "—"}</span>
            </div>
            <div className="kv">
              <span>Last name</span><span className="v">{(selected?.name || "").split(" ").slice(1).join(" ") || "—"}</span>
            </div>
            <div className="kv">
              <span>Email</span>
              <span className="v">
                {selected?.email || "—"}
                {selected?.email && <button className="pill" onClick={() => copy(selected.email)}>Copy</button>}
              </span>
            </div>
            <div className="kv">
              <span>Phone</span>
              <span className="v">
                {selected?.phone || "—"}
                {selected?.phone && <button className="pill" onClick={() => copy(selected.phone!)}>Copy</button>}
              </span>
            </div>
            <div className="kv"><span>DOB</span><span className="v">—</span></div>
            <div className="kv"><span>Age</span><span className="v">—</span></div>
            <div className="kv"><span>City</span><span className="v">—</span></div>
            <div className="kv"><span>State</span><span className="v">—</span></div>
            <div className="kv"><span>ZIP</span><span className="v">—</span></div>
            <div className="kv"><span>Household size</span><span className="v">—</span></div>
            <div className="kv"><span>Quote</span><span className="v">—</span></div>
            <div className="kv"><span>Created</span><span className="v">{selected?.createdAt || "—"}</span></div>
          </div>
        </aside>
      </main>
    </div>
  );
}
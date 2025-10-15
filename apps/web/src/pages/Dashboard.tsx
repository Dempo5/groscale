// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import "./dashboard-ios.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

const Icon = ({
  d,
  size = 18,
  stroke = "currentColor",
  strokeWidth = 1.5,
}: {
  d: string;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

function placeholder(v?: string | null) {
  const clean = typeof v === "string" ? v.trim() : "";
  return clean ? clean : <span className="placeholder">Not provided</span>;
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [copilotBusy, setCopilotBusy] = useState(false);

  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("gs_theme") as "light" | "dark") || "light"
  );
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
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

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="p-shell">
      {/* Topbar (neutral, centered brand) */}
      <header className="p-topbar matte">
        <button
          className="icon-btn left-toggle"
          aria-label={railOpen ? "Collapse navigation" : "Expand navigation"}
          title={railOpen ? "Collapse navigation" : "Expand navigation"}
          onClick={() => setRailOpen((v) => !v)}
        >
          {/* chevrons reflect open/closed */}
          <Icon d={railOpen ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
        </button>

        <div className="brand-center">GroScales</div>

        <div className="top-actions">
          <div className="profile">
            <button
              className="profile-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title="Account"
            >
              <div className="avatar small">U</div>
            </button>
            {menuOpen && (
              <div className="menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button
                  className="menu-item"
                  onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
                >
                  <Icon d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
                  {theme === "light" ? "Dark mode" : "Light mode"}
                </button>
                <div className="menu-sep" />
                <button
                  className="menu-item danger"
                  onClick={() => {
                    logout();
                    window.location.href = "/login";
                  }}
                >
                  <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Grid: rail / list / thread / details */}
      <main
        className={`p-work grid ${railOpen ? "rail-open" : "rail-closed"}`}
        style={{
          ["--rail-w" as any]: railOpen ? "232px" : "64px", // flush left, pushes content
          ["--detail-w" as any]: "260px",                    // trimmed 20px
        }}
      >
        {/* RAIL (flush-left, anchored) */}
        <aside className={`rail ${railOpen ? "" : "collapsed"} matte`}>
          <nav>
            {/* Contacts (fixed “shoulder” icon) */}
            <a className="rail-item active" title="Contacts" aria-current="page">
              <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 8a7 7 0 1 0-14 0" />
              {railOpen && <span>Contacts</span>}
              <span className="rail-active" />
            </a>
            <a className="rail-item" title="Workflows">
              <Icon d="M4 6h16M4 12h12M4 18h8" />
              {railOpen && <span>Workflows</span>}
            </a>
            <a className="rail-item" title="Phone numbers">
              <Icon d="M6 2h12v20H6zM9 18h6" />
              {railOpen && <span>Phone numbers</span>}
            </a>
            <a className="rail-item" title="Tags">
              <Icon d="M3 6h8l8 8-8 8H3zM7 10h0" />
              {railOpen && <span>Tags</span>}
            </a>
            <a className="rail-item" title="Templates">
              <Icon d="M4 4h16v6H4zM4 14h10" />
              {railOpen && <span>Templates</span>}
            </a>
            <a className="rail-item" title="Uploads">
              <Icon d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
              {railOpen && <span>Uploads</span>}
            </a>
          </nav>
          <div className="rail-foot">
            <a className="rail-item" title="Settings">
              <Icon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.07a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06c.46-.46.6-1.14.33-1.73A1.65 1.65 0 0 0 3 13" />
              {railOpen && <span>Settings</span>}
            </a>
          </div>
        </aside>

        {/* LIST (contacts) */}
        <section className="panel list matte">
          <div className="list-head">
            <div className="h">Contacts</div>
            <div className="list-head-actions">
              <button className="btn-sm">+ New</button>
            </div>
          </div>

          <div className="search">
            <Icon d="M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4" />
            <input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search contacts"
            />
            {/* funnel filter icon */}
            <button className="icon-btn sm" title="Filter">
              <Icon d="M3 5h18M7 12h10M10 19h4" />
            </button>
          </div>

          <ul className="rows">
            {filtered.map((l) => (
              <li
                key={String(l.id)}
                className={`row ${String(l.id) === String(selectedId) ? "selected" : ""}`}
                onClick={() => setSelectedId(l.id)}
              >
                <div className="avatar">
                  {(l.name || l.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="meta" style={{ flex: 1 }}>
                  <div className="name">{placeholder(l.name as string)}</div>
                  <div className="sub">{placeholder(l.email)}</div>
                </div>
              </li>
            ))}
            {!filtered.length && <li className="row">No matches</li>}
          </ul>
        </section>

        {/* THREAD (chat) */}
        <section className="panel thread matte">
          <div className="thread-title">
            <div className="who">
              <div className="avatar">
                {(selected?.name || "T").slice(0, 1).toUpperCase()}
              </div>
              <div className="who-meta">
                <div className="who-name">{placeholder(selected?.name)}</div>
                <div className="who-sub">{placeholder(selected?.email)}</div>
              </div>
            </div>
          </div>

          <div className="messages" key={selected?.id ?? "none"}>
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.from === "me" ? "mine" : ""}`}>
                <div className="txt">{m.text}</div>
                <div className="stamp">{m.at}</div>
              </div>
            ))}
          </div>

          <div className="composer">
            <input
              placeholder="Send a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />

            {/* AI Copilot — slower, intentional pulse */}
            <button
              className={`btn-copilot slow ${copilotBusy ? "is-active" : ""}`}
              title="AI Copilot"
              onClick={() => setCopilotBusy((s) => !s)}
            >
              <span className="copilot-core">
                <Icon d="M12 2l2.5 4.5L19 8l-4.5 2L12 15l-2.5-5L5 8l4.5-1.5L12 2z" />
                <span>Copilot</span>
              </span>
              <span className="copilot-aura" aria-hidden />
            </button>

            <button
              className={`btn-primary ${draft.trim() ? "is-ready" : ""}`}
              disabled={!draft.trim()}
              title={draft.trim() ? "Send" : "Type a message to send"}
            >
              Send
            </button>
          </div>
        </section>

        {/* DETAILS (right) */}
        <aside className="panel details matte">
          <div className="group">
            <div className="group-title">Personal Info</div>

            <div className="kv">
              <label>Full name</label>
              <span>{placeholder(selected?.name)}</span>
            </div>
            <div className="kv">
              <label>First name</label>
              <span>
                {placeholder(((selected?.name || "").split(" ")[0] || "") as string)}
              </span>
            </div>
            <div className="kv">
              <label>Last name</label>
              <span>
                {placeholder(((selected?.name || "").split(" ").slice(1).join(" ")) as string)}
              </span>
            </div>
            <div className="kv">
              <label>Email</label>
              <span className="copy-row">
                <span>{placeholder(selected?.email)}</span>
                {!!selected?.email && (
                  <button className="chip" onClick={() => copy(selected.email)} title="Copy email">
                    <Icon d="M8 7h9a2 2 0 0 1 2 2v9H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" />
                    Copy
                  </button>
                )}
              </span>
            </div>
            <div className="kv">
              <label>Phone</label>
              <span className="copy-row">
                <span>{placeholder(selected?.phone)}</span>
                {!!selected?.phone && (
                  <button className="chip" onClick={() => copy(selected.phone!)} title="Copy phone">
                    <Icon d="M8 7h9a2 2 0 0 1 2 2v9H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" />
                    Copy
                  </button>
                )}
              </span>
            </div>
          </div>

          <div className="group">
            <div className="group-title">Demographics</div>
            <div className="kv"><label>DOB</label><span className="placeholder">Not provided</span></div>
            <div className="kv"><label>Age</label><span className="placeholder">Not provided</span></div>
            <div className="kv"><label>City</label><span className="placeholder">Not provided</span></div>
            <div className="kv"><label>State</label><span className="placeholder">Not provided</span></div>
            <div className="kv"><label>ZIP</label><span className="placeholder">Not provided</span></div>
            <div className="kv"><label>Household size</label><span className="placeholder">Not provided</span></div>
          </div>

          <div className="group">
            <div className="group-title">Tags</div>
            <div className="tag-row">
              <span className="tag" data-color="blue">new</span>
              <span className="tag" data-color="pink">follow-up</span>
              <span className="tag" data-color="green">warm</span>
            </div>
          </div>

          <div className="group">
            <div className="group-title">System Info</div>
            <div className="kv"><label>Quote</label><span className="placeholder">Not provided</span></div>
            <div className="kv"><label>Created</label><span>{placeholder(selected?.createdAt)}</span></div>
          </div>
        </aside>
      </main>
    </div>
  );
}
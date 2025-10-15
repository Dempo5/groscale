// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import "./dashboard-ios.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

const Icon = ({
  d,
  size = 18,
  stroke = "currentColor",
  strokeWidth = 1.75,
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

const CopyIcon = () => (
  <Icon d="M8 8h8v12H8z M12 4h8v12" strokeWidth={1.6} />
);
const SearchIcon = () => <Icon d="M21 21l-5.2-5.2M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14z" />;
const FilterIcon = () => <Icon d="M4 5h16M7 12h10M10 19h4" />;
const ChevronLeft = () => <Icon d="M15 6l-6 6 6 6" />;
const ChevronRight = () => <Icon d="M9 6l6 6-6 6" />;

export default function Dashboard() {
  // data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  // ui
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // theme
  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("gs_theme") as "light" | "dark") || "light"
  );
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("gs_theme", theme);
  }, [theme]);

  // load
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

  // demo thread (replace with real messages later)
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

  return (
    <div className="p-shell">
      {/* TOP BAR */}
      <header className="p-topbar">
        <button
          className="icon-btn rail-toggle"
          aria-label="Toggle left rail"
          onClick={() => setRailOpen((v) => !v)}
          title={railOpen ? "Collapse" : "Expand"}
        >
          {railOpen ? <ChevronLeft /> : <ChevronRight />}
        </button>

        <div className="brand-center">GroScales</div>

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
                <Icon d="M3 12h18M12 3v18" />
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
                <Icon d="M16 17l5-5-5-5M21 12H8" />
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* WORK AREA */}
      <main className={`p-work grid ${railOpen ? "" : "rail-closed"}`}>
        {/* LEFT RAIL */}
        <aside className={`rail ${railOpen ? "" : "collapsed"}`}>
          <nav>
            <a className="rail-item active" title="Contacts">
              <Icon d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 20c0-3.3 2.7-6 6-6h4" />
              {railOpen && <span>Contacts</span>}
            </a>
            <a className="rail-item" title="Workflows">
              <Icon d="M4 6h16M4 12h10M4 18h7" />
              {railOpen && <span>Workflows</span>}
            </a>
            <a className="rail-item" title="Phone numbers">
              <Icon d="M6 2h12v20H6zM9 18h6" />
              {railOpen && <span>Phone numbers</span>}
            </a>
            <a className="rail-item" title="Tags">
              <Icon d="M20 12l-8 8-8-8 8-8 8 8z" />
              {railOpen && <span>Tags</span>}
            </a>
            <a className="rail-item" title="Templates">
              <Icon d="M4 4h16v6H4zM4 14h10" />
              {railOpen && <span>Templates</span>}
            </a>
            <a className="rail-item" title="Uploads">
              <Icon d="M12 3v12m0 0l-4-4m4 4 4-4M4 21h16" />
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

        {/* LIST */}
        <section className="panel list">
          <div className="list-head">
            <div className="h">Contacts</div>
            <div className="list-head-actions">
              <button className="btn-outline sm">+ New</button>
            </div>
          </div>

          <div className="search">
            <SearchIcon />
            <input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="icon-btn sm" title="Filter (coming soon)">
              <FilterIcon />
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
                  <div className="name">{l.name || "—"}</div>
                  <div className="sub">{l.email}</div>
                </div>
              </li>
            ))}
            {!filtered.length && <li className="row">No matches</li>}
          </ul>
        </section>

        {/* THREAD */}
        <section className="panel thread">
          <div className="thread-title">
            <div className="who">
              <div className="avatar">{(selected?.name || "T").slice(0, 1).toUpperCase()}</div>
              <div className="who-meta">
                <div className="who-name">{selected?.name || "—"}</div>
                <div className="who-sub">{selected?.email}</div>
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
              disabled
            />
            <button className="btn-outline sm">Templates</button>
            <button className="btn-primary" disabled>
              Send
            </button>
          </div>
        </section>

        {/* DETAILS */}
        <aside className="panel details">
          <div className="section-head">
            <div className="section-title">Contact</div>
          </div>

          {[
            ["Full name", selected?.name || "—", undefined],
            ["First name", (selected?.name || "").split(" ")[0] || "—", undefined],
            ["Last name", (selected?.name || "").split(" ").slice(1).join(" ") || "—", undefined],
            ["Email", selected?.email || "—", selected?.email],
            ["Phone", selected?.phone || "—", selected?.phone],
            ["DOB", "—", undefined],
            ["Age", "—", undefined],
            ["City", "—", undefined],
            ["State", "—", undefined],
            ["ZIP", "—", undefined],
            ["Household size", "—", undefined],
            ["Quote", "—", undefined],
            ["Created", selected?.createdAt || "—", undefined],
          ].map(([label, val, toCopy]) => (
            <div className="kv" key={label}>
              <label>{label}</label>
              <span className="kv-val">{val}</span>
              <span className="kv-copy">
                {toCopy ? (
                  <button className="copy-chip" onClick={() => copy(String(toCopy))} title="Copy">
                    <CopyIcon />
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </aside>
      </main>
    </div>
  );
}
// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import "./dashboard-ios.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

const OutlineIcon = ({
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

export default function Dashboard() {
  // data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(true);

  // theme
  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("gs_theme") as "light" | "dark") || "light"
  );
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("gs_theme", theme);
  }, [theme]);

  // load leads once
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

  // demo thread
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

  // filters
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

  // profile menu
  const [menuOpen, setMenuOpen] = useState(false);
  function closeMenuSoon() {
    setTimeout(() => setMenuOpen(false), 120);
  }

  return (
    <div className="p-shell">
      {/* TOP BAR (centered brand, account menu on right, rail toggle on left) */}
      <header className="p-topbar matte">
        <button
          className="icon-btn left-toggle"
          aria-label="Toggle left rail"
          title="Toggle left rail"
          onClick={() => setRailOpen((v) => !v)}
        >
          <OutlineIcon d="M9 6l6 6-6 6" />
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
              <div className="menu" role="menu" onBlur={closeMenuSoon}>
                <button
                  className="menu-item"
                  onClick={() =>
                    setTheme((t) => (t === "light" ? "dark" : "light"))
                  }
                >
                  <OutlineIcon d="M12 4a8 8 0 0 0 0 16 8 8 0 0 1 0-16z" />
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
                  <OutlineIcon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 3-column work area (contacts / chat / details) */}
      <main
        className={`p-work grid ${railOpen ? "rail-open" : "rail-closed"}`}
      >
        {/* LEFT RAIL — outline icons, minimal */}
        <aside className={`rail ${railOpen ? "" : "collapsed"} matte`}>
          <nav>
            <a className="rail-item active" title="Contacts">
              {/* fixed shoulder contact icon */}
              <OutlineIcon d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM3 20c0-4 4-7 9-7s9 3 9 7" />
              {railOpen && <span>Contacts</span>}
            </a>
            <a className="rail-item" title="Workflows">
              <OutlineIcon d="M4 6h16M4 12h12M4 18h8" />
              {railOpen && <span>Workflows</span>}
            </a>
            <a className="rail-item" title="Phone numbers">
              <OutlineIcon d="M6 2h12v20H6zM9 18h6" />
              {railOpen && <span>Phone numbers</span>}
            </a>
            <a className="rail-item" title="Tags">
              <OutlineIcon d="M20 12l-8 8-8-8 8-8 8 8z" />
              {railOpen && <span>Tags</span>}
            </a>
            <a className="rail-item" title="Templates">
              <OutlineIcon d="M4 4h16v6H4zM4 14h10" />
              {railOpen && <span>Templates</span>}
            </a>
            <a className="rail-item" title="Uploads">
              <OutlineIcon d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
              {railOpen && <span>Uploads</span>}
            </a>
          </nav>
          <div className="rail-foot">
            <a className="rail-item" title="Settings">
              <OutlineIcon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.07a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06c.46-.46.6-1.14.33-1.73A1.65 1.65 0 0 0 3 13H3a2 2 0 1 1 0-4h.07c.67 0 1.28-.38 1.55-.97.27-.59.13-1.27-.33-1.73l-.06-.06A2 2 0 1 1 7.06 2.4l.06.06c.46.46 1.14.6 1.73.33.59-.27.97-.88.97-1.55V1a2 2 0 1 1 4 0v.07c0 .67.38 1.28.97 1.55.59.27 1.27.13 1.73-.33l.06-.06A2 2 0 1 1 20.6 4.4l-.06.06c-.46.46-.6 1.14-.33 1.73.27.59.88.97 1.55.97H22a2 2 0 1 1 0 4h-.07c-.67 0-1.28.38-1.55.97-.27.59-.13 1.27.33 1.73l.06.06z" />
              {railOpen && <span>Settings</span>}
            </a>
          </div>
        </aside>

        {/* LIST */}
        <section className="panel list matte">
          <div className="list-head">
            <div className="h">Contacts</div>
            <div className="list-head-actions">
              <button className="btn-sm">+ New</button>
            </div>
          </div>

          <div className="search">
            <OutlineIcon d="M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4" />
            <input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search contacts"
            />
            <button className="icon-btn sm" title="Filter">
              {/* filter icon */}
              <OutlineIcon d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />
            </button>
          </div>

          <ul className="rows">
            {filtered.map((l) => (
              <li
                key={String(l.id)}
                className={`row ${
                  String(l.id) === String(selectedId) ? "selected" : ""
                }`}
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
        <section className="panel thread matte">
          <div className="thread-title">
            <div className="who">
              <div className="avatar">
                {(selected?.name || "T").slice(0, 1).toUpperCase()}
              </div>
              <div className="who-meta">
                <div className="who-name">{selected?.name || "—"}</div>
                <div className="who-sub">{selected?.email}</div>
              </div>
            </div>
          </div>

          <div className="messages" key={selected?.id ?? "none"}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`bubble ${m.from === "me" ? "mine" : ""}`}
              >
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
            <button className="btn-sm">Templates</button>
            <button
              className={`btn-primary ${draft.trim() ? "is-ready" : ""}`}
              disabled={!draft.trim()}
              title={draft.trim() ? "Send" : "Type a message to send"}
            >
              Send
            </button>
          </div>
        </section>

        {/* DETAILS */}
        <aside className="panel details matte">
          <div className="group">
            <div className="group-title">Personal Info</div>

            <div className="kv">
              <label>Full name</label>
              <span>{selected?.name || "—"}</span>
            </div>
            <div className="kv">
              <label>First name</label>
              <span>{(selected?.name || "").split(" ")[0] || "—"}</span>
            </div>
            <div className="kv">
              <label>Last name</label>
              <span>
                {(selected?.name || "").split(" ").slice(1).join(" ") || "—"}
              </span>
            </div>

            <div className="kv">
              <label>Email</label>
              <span className="copy-row">
                <span>{selected?.email || "—"}</span>
                {!!selected?.email && (
                  <button
                    className="chip"
                    onClick={() => copy(selected.email)}
                    title="Copy email"
                  >
                    <OutlineIcon d="M8 7h9a2 2 0 0 1 2 2v9H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" />
                    Copy
                  </button>
                )}
              </span>
            </div>

            <div className="kv">
              <label>Phone</label>
              <span className="copy-row">
                <span>{selected?.phone || "—"}</span>
                {!!selected?.phone && (
                  <button
                    className="chip"
                    onClick={() => copy(selected.phone!)}
                    title="Copy phone"
                  >
                    <OutlineIcon d="M8 7h9a2 2 0 0 1 2 2v9H8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8" />
                    Copy
                  </button>
                )}
              </span>
            </div>
          </div>

          <div className="group">
            <div className="group-title">Demographics</div>
            <div className="kv">
              <label>DOB</label>
              <span>—</span>
            </div>
            <div className="kv">
              <label>Age</label>
              <span>—</span>
            </div>
            <div className="kv">
              <label>City</label>
              <span>—</span>
            </div>
            <div className="kv">
              <label>State</label>
              <span>—</span>
            </div>
            <div className="kv">
              <label>ZIP</label>
              <span className="copy-row">
                <span>—</span>
              </span>
            </div>
            <div className="kv">
              <label>Household size</label>
              <span>—</span>
            </div>
          </div>

          <div className="group">
            <div className="group-title">System Info</div>
            <div className="kv">
              <label>Quote</label>
              <span>—</span>
            </div>
            <div className="kv">
              <label>Created</label>
              <span>{selected?.createdAt || "—"}</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
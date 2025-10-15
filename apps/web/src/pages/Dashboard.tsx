// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import "./dashboard-ios.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

const Icon = ({
  d,
  size = 18,
  stroke = "currentColor",
}: {
  d: string;
  size?: number;
  stroke?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const selected =
    useMemo(() => leads.find((l) => String(l.id) === String(selectedId)) || null, [leads, selectedId]);

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
        text: "Great to meet you. I’ll compare Blue Cross and United and send a quick quote today.",
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

  function copy(text?: string | null) {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
  }
  function copyAll() {
    const parts = [
      selected?.name,
      selected?.email,
      selected?.phone,
      // placeholders for future structured fields
      "DOB: —",
      "Age: —",
      "City: —",
      "State: —",
      "ZIP: —",
      "Household size: —",
      "Quote: —",
      selected?.createdAt ? `Created: ${selected.createdAt}` : undefined,
    ].filter(Boolean);
    copy(parts.join("\n"));
  }

  return (
    <div className="p-shell matte">
      {/* TOP BAR */}
      <header className="p-topbar matte">
        <button
          className="icon-btn left-toggle"
          aria-label="Toggle navigation"
          title="Toggle navigation"
          onClick={() => setRailOpen((v) => !v)}
        >
          {/* chevron points in/out */}
          <Icon d={railOpen ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"} />
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
                  <Icon d="M12 3v18M3 12h18" />
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

      {/* MAIN GRID */}
      <main className={`p-work grid ${railOpen ? "rail-open" : "rail-closed"}`}>
        {/* LEFT RAIL — outline icons only */}
        <aside className={`rail ${railOpen ? "" : "collapsed"} matte`}>
          <nav>
            <a className="rail-item active" title="Contacts">
              <Icon d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 20a7 7 0 0 1 12 0" />
              {railOpen && <span>Contacts</span>}
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
              {/* tag outline */}
              <Icon d="M20 12l-7.2 7.2A2 2 0 0 1 10.4 20L4 13.6V6h7.6L20 12zM8 9h.01" />
              {railOpen && <span>Tags</span>}
            </a>
            <a className="rail-item" title="Templates">
              <Icon d="M4 4h16v6H4zM4 14h12M4 18h8" />
              {railOpen && <span>Templates</span>}
            </a>
            <a className="rail-item" title="Uploads">
              <Icon d="M12 3v10m0 0l-4-4m4 4l4-4M4 21h16" />
              {railOpen && <span>Uploads</span>}
            </a>
          </nav>
          <div className="rail-foot">
            <a className="rail-item" title="Settings">
              <Icon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.82-.33V21a2 2 0 1 1-4 0v-.07a1.7 1.7 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.2 16.88l.06-.06c.46-.46.6-1.14.33-1.73A1.7 1.7 0 0 0 3 13a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.55-.97c.27-.59.13-1.27-.33-1.73l-.06-.06A2 2 0 1 1 7.06 2.4l.06.06c.46.46 1.14.6 1.73.33.59-.27.97-.88.97-1.55V1a2 2 0 1 1 4 0v.07c0 .67.38 1.28.97 1.55.59.27 1.27.13 1.73-.33l.06-.06A2 2 0 1 1 20.6 4.4l-.06.06c-.46.46-.6 1.14-.33 1.73.27.59.88.97 1.55.97A2 2 0 1 1 22 11a1.7 1.7 0 0 0-1.55.97z" />
              {railOpen && <span>Settings</span>}
            </a>
          </div>
        </aside>

        {/* LIST */}
        <section className="panel list matte">
          <div className="list-head">
            <div className="h">Contacts</div>
            <div className="list-head-actions">
              <div className="search">
                <Icon d="M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4" />
                <input
                  placeholder="Search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <button className="btn-outline">Filter</button>
              <button className="btn-outline">+ New</button>
            </div>
          </div>

          <ul className="rows">
            {filtered.map((l) => (
              <li
                key={String(l.id)}
                className={`row ${String(l.id) === String(selectedId) ? "selected" : ""}`}
                onClick={() => setSelectedId(l.id)}
              >
                <div className="avatar">{(l.name || l.email || "?").slice(0, 1).toUpperCase()}</div>
                <div className="meta">
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
            <button className="btn-outline">Templates</button>
            <button className="btn-primary" disabled>
              Send
            </button>
          </div>
        </section>

        {/* DETAILS */}
        <aside className="panel details matte">
          <div className="section-head">
            <div className="section-title">Contact</div>
            <button className="btn-outline sm" onClick={copyAll}>
              Copy all
            </button>
          </div>
          {[
            ["Full name", selected?.name],
            ["First name", (selected?.name || "").split(" ")[0] || "—"],
            ["Last name", (selected?.name || "").split(" ").slice(1).join(" ") || "—"],
            ["Email", selected?.email || "—", selected?.email],
            ["Phone", selected?.phone || "—", selected?.phone],
            ["DOB", "—"],
            ["Age", "—"],
            ["City", "—"],
            ["State", "—"],
            ["ZIP", "—"],
            ["Household size", "—"],
            ["Quote", "—"],
            ["Created", selected?.createdAt || "—"],
          ].map(([label, value, copyVal]) => (
            <div className="kv" key={label}>
              <label>{label}</label>
              <span className="copy-row">
                <span>{value as string}</span>
                {copyVal ? (
                  <button className="chip" onClick={() => copy(copyVal as string)}>
                    Copy
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

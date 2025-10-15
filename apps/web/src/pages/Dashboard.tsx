// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import "./dashboard-ios.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

const Icon = ({
  path,
  size = 18,
  stroke = "currentColor",
}: {
  path: string;
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
    <path d={path} />
  </svg>
);

// Crisp outline icons (no emojis)
const paths = {
  chevronRight: "M9 6l6 6-6 6",
  // Contacts (full shoulder)
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 7a7 7 0 0 0-14 0",
  // Workflows (rows)
  rows: "M4 6h16M4 12h12M4 18h8",
  // Phone
  phone: "M22 16.92V19a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.9 3.18 2 2 0 0 1 4.86 1h2.18a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.27-1.2a2 2 0 0 1 2.11.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z",
  // Tag
  tag:
    "M20.59 13.41 13.41 20.59a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z M7.5 7.5h.01",
  // Template / doc
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12V8L14 2Z M14 2v6h6",
  // Upload
  upload: "M12 3v12M8 9l4-4 4 4M4 21h16",
  // Gear
  gear:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.7 1.7 0 0 0 .39 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4 1.7 1.7 0 0 0 13.5 20V21a2 2 0 1 1-4 0v-1a1.7 1.7 0 0 0-1.5-.6 1.7 1.7 0 0 0-1.88.39l-.06.06A2 2 0 1 1 2.71 17l.06-.06A1.7 1.7 0 0 0 3 15c0-.5-.2-.97-.54-1.33L2.4 13.6A2 2 0 1 1 5.23 10.8l.06.06c.46.46 1.14.6 1.73.33.59-.27.97-.88.97-1.55V9a2 2 0 1 1 4 0v.07c0 .67.38 1.28.97 1.55.59.27 1.27.13 1.73-.33l.06-.06A2 2 0 1 1 21.29 13l-.06.06c-.34.36-.53.83-.53 1.34Z",
  // Search
  search: "M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4",
  // Filter funnel
  filter:
    "M3 4h18M6 10h12M9 16h6M11 20h2",
  // Copy
  copy:
    "M9 9h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm-4-4h9a2 2 0 0 1 2 2v1",
};

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(true);

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="p-shell matte">
      {/* TOP BAR */}
      <header className="p-topbar matte">
        <button
          className="icon-btn left-toggle"
          aria-label="Toggle left rail"
          onClick={() => setRailOpen((v) => !v)}
          title="Toggle menu"
        >
          <Icon path={paths.chevronRight} />
        </button>

        <div className="brand-center">GroScales</div>

        <div className="top-actions" ref={menuRef}>
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
            <div className="menu" role="menu">
              <button
                className="menu-item"
                onClick={() =>
                  setTheme((t) => (t === "light" ? "dark" : "light"))
                }
              >
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
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* GRID */}
      <main className={`p-work grid ${railOpen ? "rail-open" : "rail-closed"}`}>
        {/* LEFT RAIL */}
        <aside className={`rail ${railOpen ? "" : "collapsed"} matte`}>
          <nav>
            <a className="rail-item active" title="Contacts">
              <Icon path={paths.user} />
              {railOpen && <span>Contacts</span>}
            </a>
            <a className="rail-item" title="Workflows">
              <Icon path={paths.rows} />
              {railOpen && <span>Workflows</span>}
            </a>
            <a className="rail-item" title="Phone numbers">
              <Icon path={paths.phone} />
              {railOpen && <span>Phone numbers</span>}
            </a>
            <a className="rail-item" title="Tags">
              <Icon path={paths.tag} />
              {railOpen && <span>Tags</span>}
            </a>
            <a className="rail-item" title="Templates">
              <Icon path={paths.doc} />
              {railOpen && <span>Templates</span>}
            </a>
            <a className="rail-item" title="Uploads">
              <Icon path={paths.upload} />
              {railOpen && <span>Uploads</span>}
            </a>
          </nav>
          <div className="rail-foot">
            <a className="rail-item" title="Settings">
              <Icon path={paths.gear} />
              {railOpen && <span>Settings</span>}
            </a>
          </div>
        </aside>

        {/* LIST */}
        <section className="panel list matte">
          <div className="list-head">
            <div className="h">Contacts</div>
            <div className="list-head-actions">
              <button className="btn-outline sm">+ New</button>
            </div>
          </div>

          <div className="search">
            <Icon path={paths.search} />
            <input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="icon-btn" title="Filter">
              <Icon path={paths.filter} />
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
              <div className="avatar">
                {(selected?.name || "T").slice(0, 1).toUpperCase()}
              </div>
              <div className="who-meta">
                <div className="who-name">{selected?.name || "—"}</div>
                <div className="who-sub">{selected?.email || "—"}</div>
              </div>
            </div>
          </div>

          {/* Scrollable messages; composer docked at bottom */}
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
              disabled
            />
            <button className="btn-outline sm">Templates</button>
            <button className="btn-primary" disabled>
              Send
            </button>
          </div>
        </section>

        {/* DETAILS */}
        <aside className="panel details matte">
          <div className="section-head">
            <div className="section-title">Contact</div>
          </div>

          {[
            ["Full name", selected?.name || "—"],
            ["First name", (selected?.name || "").split(" ")[0] || "—"],
            ["Last name", (selected?.name || "").split(" ").slice(1).join(" ") || "—"],
          ].map(([label, val]) => (
            <div className="kv" key={label}>
              <label>{label}</label>
              <span>{val}</span>
            </div>
          ))}

          <div className="kv">
            <label>Email</label>
            <span className="copy-row">
              <span>{selected?.email || "—"}</span>
              {!!selected?.email && (
                <button className="icon-btn xs" onClick={() => copy(selected.email)} title="Copy email">
                  <Icon path={paths.copy} size={16} />
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
                  className="icon-btn xs"
                  onClick={() => copy(selected.phone!)}
                  title="Copy phone"
                >
                  <Icon path={paths.copy} size={16} />
                </button>
              )}
            </span>
          </div>

          {[
            ["DOB", "—"],
            ["Age", "—"],
            ["City", "—"],
            ["State", "—"],
            ["ZIP", "—"],
            ["Household size", "—"],
            ["Quote", "—"],
            ["Created", selected?.createdAt || "—"],
          ].map(([label, val]) => (
            <div className="kv" key={label}>
              <label>{label}</label>
              <span>{val}</span>
            </div>
          ))}
        </aside>
      </main>
    </div>
  );
}
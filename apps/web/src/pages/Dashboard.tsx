// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import "./dashboard-ios.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

/* ---------- tiny outline icons (no emojis) ---------- */
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

const ContactsIcon = () => (
  <Icon d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 20a6 6 0 0 1 12 0H4Z" />
);
const WorkflowsIcon = () => <Icon d="M4 6h16M4 12h12M4 18h8" />;
const NumbersIcon = () => <Icon d="M6 2h12v20H6zM9 18h6" />;
const TagIcon = () => <Icon d="M20 12 12 20 4 12l6-6 10 10Z" />;
const TemplatesIcon = () => <Icon d="M4 4h16v6H4zM4 14h12M4 18h8" />;
const UploadsIcon = () => <Icon d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" />;
const SettingsIcon = () => (
  <Icon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
);
const ChevronIcon = ({ left = false }) => (
  <Icon d={left ? "M15 18 9 12l6-6" : "M9 6l6 6-6 6"} />
);
const SearchIcon = () => <Icon d="M11 19a8 8 0 1 1 5.3-14.3L21 9l-4 4" />;
const FilterIcon = () => <Icon d="M3 5h18M6 12h12M10 19h8" />;
const CopyIcon = () => <Icon d="M9 9h9v12H9zM6 3h9v6" />;

export default function Dashboard() {
  // data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // theme (light | dark)
  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("gs_theme") as "light" | "dark") || "light"
  );
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("gs_theme", theme);
  }, [theme]);

  // load leads
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

  // search filter
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

  // small util
  function copy(v?: string | null) {
    if (!v) return;
    navigator.clipboard?.writeText(v).catch(() => {});
  }

  const CopyChip = ({ value }: { value?: string | null }) =>
    value ? (
      <button className="chip copy-chip" onClick={() => copy(value)} title="Copy">
        <CopyIcon />
      </button>
    ) : (
      <span className="copy-spacer" />
    );

  return (
    <div className="p-shell matte">
      {/* TOP BAR */}
      <header className="p-topbar matte">
        <button
          className="icon-btn rail-toggle"
          aria-label="Toggle left rail"
          onClick={() => setRailOpen((v) => !v)}
          title={railOpen ? "Collapse" : "Expand"}
        >
          <ChevronIcon left={railOpen} />
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

      {/* WORK AREA */}
      <main className={`p-work grid ${railOpen ? "rail-open" : "rail-closed"}`}>
        {/* LEFT RAIL */}
        <aside className={`rail ${railOpen ? "" : "collapsed"} matte`}>
          <nav>
            <a className="rail-item active" title="Contacts">
              <ContactsIcon />
              {railOpen && <span>Contacts</span>}
            </a>
            <a className="rail-item" title="Workflows">
              <WorkflowsIcon />
              {railOpen && <span>Workflows</span>}
            </a>
            <a className="rail-item" title="Phone numbers">
              <NumbersIcon />
              {railOpen && <span>Phone numbers</span>}
            </a>
            <a className="rail-item" title="Tags">
              <TagIcon />
              {railOpen && <span>Tags</span>}
            </a>
            <a className="rail-item" title="Templates">
              <TemplatesIcon />
              {railOpen && <span>Templates</span>}
            </a>
            <a className="rail-item" title="Uploads">
              <UploadsIcon />
              {railOpen && <span>Uploads</span>}
            </a>
          </nav>
          <div className="rail-foot">
            <a className="rail-item" title="Settings">
              <SettingsIcon />
              {railOpen && <span>Settings</span>}
            </a>
          </div>
        </aside>

        {/* LIST */}
        <section className="panel list matte">
          <div className="list-head">
            <div className="h">Contacts</div>
            <button className="btn-sm">+ New</button>
          </div>

          <div className="search">
            <SearchIcon />
            <input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="icon-btn" title="Filter">
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
            <button className="btn-sm">Templates</button>
            <button className="btn-primary" disabled>
              Send
            </button>
          </div>
        </section>

        {/* DETAILS */}
        <aside className="panel details matte">
          <div className="section">
            <div className="section-title">Contact</div>

            <div className="kv">
              <label>Full name</label>
              <span>{selected?.name || "—"}</span>
              <CopyChip value={selected?.name || undefined} />
            </div>

            <div className="kv">
              <label>First name</label>
              <span>{(selected?.name || "").split(" ")[0] || "—"}</span>
              <CopyChip value={(selected?.name || "").split(" ")[0] || undefined} />
            </div>

            <div className="kv">
              <label>Last name</label>
              <span>{(selected?.name || "").split(" ").slice(1).join(" ") || "—"}</span>
              <CopyChip
                value={(selected?.name || "").split(" ").slice(1).join(" ") || undefined}
              />
            </div>

            <div className="kv">
              <label>Email</label>
              <span>{selected?.email || "—"}</span>
              <CopyChip value={selected?.email} />
            </div>

            <div className="kv">
              <label>Phone</label>
              <span>{selected?.phone || "—"}</span>
              <CopyChip value={selected?.phone} />
            </div>

            <div className="kv"><label>DOB</label><span>—</span><span /></div>
            <div className="kv"><label>Age</label><span>—</span><span /></div>
            <div className="kv"><label>City</label><span>—</span><span /></div>
            <div className="kv"><label>State</label><span>—</span><span /></div>
            <div className="kv"><label>ZIP</label><span>—</span><span /></div>
            <div className="kv"><label>Household size</label><span>—</span><span /></div>
            <div className="kv"><label>Quote</label><span>—</span><span /></div>
            <div className="kv">
              <label>Created</label>
              <span>{selected?.createdAt || "—"}</span>
              <CopyChip value={selected?.createdAt} />
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

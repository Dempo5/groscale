// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import "./dashboard-ios.css";
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

const OutlineIcon = ({
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
  // data
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  // ui state
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  // theme (light default; dark is neutral gray)
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

  // filter
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

  // utils
  function copy(v?: string | null) {
    if (!v) return;
    navigator.clipboard?.writeText(v).catch(() => {});
  }
  function copyAll() {
    const obj = {
      name: selected?.name ?? "",
      first: (selected?.name || "").split(" ")[0] ?? "",
      last: (selected?.name || "").split(" ").slice(1).join(" "),
      email: selected?.email ?? "",
      phone: selected?.phone ?? "",
      dob: "",
      age: "",
      city: "",
      state: "",
      zip: "",
      household: "",
      quote: "",
      created: selected?.createdAt ?? "",
    };
    const text = Object.entries(obj)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    navigator.clipboard?.writeText(text);
  }

  return (
    <div className="p-shell matte">
      {/* TOP BAR — minimal */}
      <header className="p-topbar matte">
        <div className="brand">GroScales</div>

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
              <div className="menu" role="menu" onBlur={() => setTimeout(()=>setMenuOpen(false),100)}>
                <button
                  className="menu-item"
                  onClick={() =>
                    setTheme((t) => (t === "light" ? "dark" : "light"))
                  }
                >
                  <OutlineIcon d="M12 3v18M3 12h18" />
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

      {/* GRID: rail | list | rule | thread | details */}
      <main className={`p-work grid ${railOpen ? "rail-open" : "rail-closed"}`}>
        {/* LEFT RAIL with its own toggle */}
        <aside className={`rail ${railOpen ? "" : "collapsed"} matte`}>
          <div className="rail-head">
            <button
              className="icon-btn"
              aria-label={railOpen ? "Collapse" : "Expand"}
              title={railOpen ? "Collapse" : "Expand"}
              onClick={() => setRailOpen((v) => !v)}
            >
              <OutlineIcon d={railOpen ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
            </button>
            {railOpen && <div className="rail-title">Menu</div>}
          </div>

          <nav>
            <a className="rail-item active" title="Contacts">
              <OutlineIcon d="M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM5 20c0-3.31 2.69-6 6-6h2" />
              {railOpen && <span>Contacts</span>}
            </a>
            <a className="rail-item" title="Workflows">
              <OutlineIcon d="M4 6h16M4 12h10M4 18h7" />
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
              <OutlineIcon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
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
            <OutlineIcon d="M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4" />
            <input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn-sm ghost" title="Filter">
              Filter
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

        {/* THIN VERTICAL RULE (not a gap) */}
        <div className="vrule" aria-hidden />

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
            <div className="section-title">
              Contact
              <span className="spacer" />
              <button className="chip" onClick={copyAll}>
                Copy all
              </button>
            </div>

            {[
              ["Full name", selected?.name],
              ["First name", (selected?.name || "").split(" ")[0] || "—"],
              ["Last name", (selected?.name || "").split(" ").slice(1).join(" ") || "—"],
              ["Email", selected?.email],
              ["Phone", selected?.phone],
              ["DOB", "—"],
              ["Age", "—"],
              ["City", "—"],
              ["State", "—"],
              ["ZIP", "—"],
              ["Household size", "—"],
              ["Quote", "—"],
              ["Created", selected?.createdAt || "—"],
            ].map(([label, value]) => (
              <div className="kv" key={label as string}>
                <label>{label}</label>
                <span className="copy-row">
                  <span>{value || "—"}</span>
                  {!!value && value !== "—" && (
                    <button className="chip" onClick={() => copy(String(value))}>
                      Copy
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

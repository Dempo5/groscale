// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import "./dashboard-ios.css";
import {
  getLeads,
  Lead,
  logout,
  listWorkflows,
  startThread,
  type Workflow,
} from "../lib/api";
import { NavLink, useNavigate } from "react-router-dom";
import CopilotModal from "../components/CopilotModal";

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

const CopyBtn = ({ value }: { value?: string | null }) => (
  <button
    className={`icon-chip ${value ? "" : "is-disabled"}`}
    title={value ? "Copy" : "Nothing to copy"}
    aria-disabled={!value}
    onClick={() => {
      if (!value) return;
      navigator.clipboard?.writeText(String(value)).catch(() => {});
    }}
  >
    <OutlineIcon d="M9 9V7a2 2 0 0 1 2-2h6M7 9h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z" />
  </button>
);

/* ---------- tiny utils ---------- */
function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("+")) return digits;
  return `+${digits}`; // best effort
}

/* ---------- quick start box (appears only when showNew = true) ---------- */
function NewConversationBox({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [wf, setWf] = useState<string>("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    listWorkflows()
      .then((ws) => setWorkflows(ws || []))
      .catch(() => setWorkflows([]));
  }, []);

  async function create() {
    setStatus("");
    const n = normalizePhone(phone);
    if (!n || n === "+") {
      setStatus("Enter a valid phone number.");
      return;
    }
    try {
      await startThread({
        phone: n,
        name: name.trim() || undefined,
        workflowId: wf || undefined,
      });
      setStatus("Created!");
      onClose(); // hide after success
    } catch (e: any) {
      setStatus(e?.message || "Failed to create conversation.");
    }
  }

  return (
    <div className="search" style={{ display: "block", paddingTop: 10, paddingBottom: 10 }}>
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <input
          className="input"
          placeholder="Your test number (e.g. +15551234567)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          className="input"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="input"
          value={wf}
          onChange={(e) => setWf(e.target.value)}
          aria-label="Workflow"
        >
          <option value="">(none)</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-primary" onClick={create}>Create</button>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
        </div>

        {status ? (
          <div className="hint" style={{ color: status.includes("Failed") ? "#e5484d" : "inherit" }}>
            {status}
          </div>
        ) : (
          <div className="hint">
            Tip: use your own number to test. Messages will appear here once your backend webhook + send route are wired.
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [copilotOpen, setCopilotOpen] = useState(false);

  // show quick-start only when + New is pressed
  const [showNew, setShowNew] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => leads.find((l) => String(l.id) === String(selectedId)) || null,
    [leads, selectedId]
  );

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

  const [menuOpen, setMenuOpen] = useState(false);
  function closeMenuSoon() {
    setTimeout(() => setMenuOpen(false), 100);
  }

  return (
    <div className="p-shell matte">
      {/* TOP BAR */}
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

      {/* WORK AREA */}
      <main className={`p-work grid ${railOpen ? "rail-open" : "rail-closed"}`}>
        {/* LEFT RAIL */}
        <aside className={`rail ${railOpen ? "" : "collapsed"} matte`}>
          <nav>
            {/* Conversations (was Contacts) → /dashboard */}
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `rail-item ${isActive ? "active" : ""}`}
              title="Conversations"
            >
              <OutlineIcon d="M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM5 20c0-3.31 2.69-6 6-6h2" />
              {railOpen && <span>Conversations</span>}
            </NavLink>

            <NavLink to="/workflows" className={({ isActive }) => `rail-item ${isActive ? "active" : ""}`} title="Workflows">
              <OutlineIcon d="M4 6h16M4 12h10M4 18h7" />
              {railOpen && <span>Workflows</span>}
            </NavLink>

            <NavLink to="/phone-numbers" className={({ isActive }) => `rail-item ${isActive ? "active" : ""}`} title="Phone numbers">
              <OutlineIcon d="M6 2h12v20H6zM9 18h6" />
              {railOpen && <span>Phone numbers</span>}
            </NavLink>

            <NavLink to="/tags" className={({ isActive }) => `rail-item ${isActive ? "active" : ""}`} title="Tags">
              <OutlineIcon d="M20 12l-8 8-8-8 8-8 8 8z" />
              {railOpen && <span>Tags</span>}
            </NavLink>

            <NavLink to="/templates" className={({ isActive }) => `rail-item ${isActive ? "active" : ""}`} title="Templates">
              <OutlineIcon d="M4 4h16v6H4zM4 14h10" />
              {railOpen && <span>Templates</span>}
            </NavLink>

            <NavLink to="/uploads" className={({ isActive }) => `rail-item ${isActive ? "active" : ""}`} title="Uploads">
              <OutlineIcon d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
              {railOpen && <span>Uploads</span>}
            </NavLink>
          </nav>

          <div className="rail-foot">
            <a className="rail-item" title="Settings">
              <OutlineIcon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.07a1.65 1.65 0 0 0-1 1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06c.46-.46.6-1.14.33-1.73A1.65 1.65 0 0 0 3 13H3a2 2 0 1 1 0-4h.07c.67 0 1.28-.38 1.55-.97.27-.59.13-1.27-.33-1.73l-.06-.06z" />
              {railOpen && <span>Settings</span>}
            </a>
          </div>
        </aside>

        {/* LIST */}
        <section className="panel list">
          <div className="list-head">
            <div className="h">Conversations</div>
            <div className="list-head-actions">
              <button className="btn-outline sm" onClick={() => setShowNew(true)}>+ New</button>
            </div>
          </div>

          {/* Quick-start appears ONLY when + New is clicked */}
          {showNew && <NewConversationBox onClose={() => setShowNew(false)} />}

          {/* Search + rows */}
          <div className="search">
            <OutlineIcon d="M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4" />
            <input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="icon-btn" aria-label="Filter" title="Filter">
              <OutlineIcon d="M3 5h18M6 12h12M10 19h4" />
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
                <div className="meta">
                  <div className="name">{l.name || "—"}</div>
                  <div className="sub">{l.email}</div>
                </div>
              </li>
            ))}
            {!filtered.length && <li className="row">No matches</li>}
          </ul>
        </section>

        {/* THREAD – no fake/demo bubbles */}
        <section className="panel thread">
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
            <div className="bubble" style={{ opacity: 0.75 }}>
              Messages will appear here once you start texting.
              <div className="stamp">
                Use “+ New” to text your own number, and wire your webhook to ingest inbound.
              </div>
            </div>
          </div>

          <div className="composer">
            <input
              placeholder="Send a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled
            />
            <button
              className="btn-outline"
              onClick={() => nav("/templates")}
              title="Open templates"
            >
              Templates
            </button>
            <button
              className="btn-copilot"
              title="AI Copilot"
              onClick={() => setCopilotOpen(true)}
            >
              <span className="copilot-static" aria-hidden />
              <OutlineIcon d="M5 12l4 4L19 6" />
              Copilot
            </button>
            <button className="btn-primary" disabled>
              Send
            </button>
          </div>
        </section>

        {/* DETAILS */}
        <aside className="panel details">
          <div className="section">
            <div className="section-title">Personal Info</div>
            <div className="kv">
              <label>Full name</label>
              <span className="copy-row">
                <span>{selected?.name || <i className="placeholder">Not provided</i>}</span>
                <CopyBtn value={selected?.name || undefined} />
              </span>
            </div>
            <div className="kv">
              <label>First name</label>
              <span className="copy-row">
                <span>{(selected?.name || "").split(" ")[0] || <i className="placeholder">Not provided</i>}</span>
                <CopyBtn value={(selected?.name || "").split(" ")[0] || undefined} />
              </span>
            </div>
            <div className="kv">
              <label>Last name</label>
              <span className="copy-row">
                <span>
                  {(selected?.name || "").split(" ").slice(1).join(" ") || (
                    <i className="placeholder">Not provided</i>
                  )}
                </span>
                <CopyBtn value={(selected?.name || "").split(" ").slice(1).join(" ") || undefined} />
              </span>
            </div>
            <div className="kv">
              <label>Email</label>
              <span className="copy-row">
                <span>{selected?.email || <i className="placeholder">Not provided</i>}</span>
                <CopyBtn value={selected?.email || undefined} />
              </span>
            </div>
          </div>

          <div className="section">
            <div className="section-title">Demographics</div>
            {[
              { k: "Phone", v: selected?.phone || "" },
              { k: "DOB", v: "" },
              { k: "Age", v: "" },
              { k: "City", v: "" },
              { k: "State", v: "" },
              { k: "ZIP", v: "" },
              { k: "Household size", v: "" },
            ].map(({ k, v }) => (
              <div className="kv" key={k}>
                <label>{k}</label>
                <span className="copy-row">
                  <span>{v || <i className="placeholder">Not provided</i>}</span>
                  <CopyBtn value={v || undefined} />
                </span>
              </div>
            ))}
          </div>

          <div className="section">
            <div className="section-title">Tags</div>
            <div className="tag-row">
              <button
                className="tag tag-blue"
                onClick={() => nav(`/tags?highlight=${encodeURIComponent("new")}`)}
                title="Open tag: new"
              >
                new
              </button>
              <button
                className="tag tag-pink"
                onClick={() => nav(`/tags?highlight=${encodeURIComponent("follow-up")}`)}
                title="Open tag: follow-up"
              >
                follow-up
              </button>
              <button
                className="tag tag-green"
                onClick={() => nav(`/tags?highlight=${encodeURIComponent("warm")}`)}
                title="Open tag: warm"
              >
                warm
              </button>
            </div>
          </div>

          <div className="section">
            <div className="section-title">System Info</div>
            {[
              { k: "Quote", v: "" },
              { k: "Created", v: selected?.createdAt || "" },
            ].map(({ k, v }) => (
              <div className="kv" key={k}>
                <label>{k}</label>
                <span className="copy-row">
                  <span>{v || <i className="placeholder">Not provided</i>}</span>
                  <CopyBtn value={v || undefined} />
                </span>
              </div>
            ))}
          </div>
        </aside>
      </main>

      <CopilotModal open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}

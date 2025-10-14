// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import "./dashboard-v2.css"; // <— use the single, consolidated stylesheet
import { getLeads, Lead, logout } from "../lib/api";

type Msg = { id: string; from: "lead" | "me"; text: string; at: string };

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
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

  // demo thread; replace with live messages later
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
    <div className="p-shell">
      <header className="p-topbar">
        <div className="brand">
          <span className="dot" />
          GroScales
        </div>
        <div className="actions">
          <button
            className="btn"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title="Toggle light/dark"
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <button className="btn primary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="p-work">
        {/* Left glass rail */}
        <nav className="nav-rail">
          {[
            { k: "analytics", icon: "📊" },
            { k: "contacts", icon: "👤" },
            { k: "workflows", icon: "🔁" },
            { k: "numbers", icon: "📞" },
            { k: "tags", icon: "🏷️" },
            { k: "templates", icon: "📝" },
            { k: "uploads", icon: "📁" },
          ].map((it, i) => (
            <div key={i} className="icon" title={it.k}>
              <span aria-hidden>{it.icon}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div className="icon" title="Settings">⚙️</div>
        </nav>

        {/* Lead list */}
        <section className="panel">
          <div className="panel-head">
            <div className="title">Leads · {leads.length}</div>
            <button className="btn">+ New lead</button>
          </div>
          <div className="search">
            <input
              placeholder="Search leads…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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

        {/* Thread */}
        <section className="panel">
          <div className="thread">
            <div className="thread-head">
              <div className="avatar">
                {(selected?.name || "T").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ fontWeight: 800 }}>
                {selected?.name || "—"}{" "}
                <span style={{ color: "var(--muted)", fontWeight: 500 }}>
                  {selected?.email}
                </span>
              </div>
              <div className="spacer" />
              <div className="pill" aria-hidden>
                Live
              </div>
            </div>

            <div className="panel-head" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="small">Thread</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn">Create Quote</button>
                <button className="btn">Call</button>
                <button className="btn">Schedule</button>
                <button className="btn">Add Tag</button>
              </div>
            </div>

            <div className="messages" key={selected?.id ?? "none"}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`bubble ${m.from === "me" ? "mine" : ""} appear`}
                >
                  {m.text}
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
              <button className="btn">Templates</button>
              <button className="btn primary" disabled>
                Send
              </button>
            </div>
          </div>
        </section>

        {/* Inspector */}
        <aside className="details">
          <div className="card">
            <div className="label">Contact</div>
            <div className="kv-grid">
              <div className="k">
                <span>Full name</span>
                <div className="v">
                  <span>{selected?.name || "—"}</span>
                </div>
              </div>
              <div className="k">
                <span>First name</span>
                <div className="v">
                  <span>{(selected?.name || "").split(" ")[0] || "—"}</span>
                </div>
              </div>
              <div className="k">
                <span>Last name</span>
                <div className="v">
                  <span>{(selected?.name || "").split(" ").slice(1).join(" ") || "—"}</span>
                </div>
              </div>
              <div className="k">
                <span>Email</span>
                <div className="v">
                  <span>{selected?.email || "—"}</span>
                  {selected?.email && (
                    <button className="copy" onClick={() => copy(selected.email)}>
                      Copy
                    </button>
                  )}
                </div>
              </div>
              <div className="k">
                <span>Phone</span>
                <div className="v">
                  <span>{selected?.phone || "—"}</span>
                  {selected?.phone && (
                    <button className="copy" onClick={() => copy(selected.phone!)}>
                      Copy
                    </button>
                  )}
                </div>
              </div>
              <div className="k"><span>DOB</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>Age</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>City</span><div className="v"><span>—</span></div></div>
              <div className="k">
                <span>ZIP</span>
                <div className="v">
                  <span>—</span>
                </div>
              </div>
              <div className="k"><span>Household size</span><div className="v"><span>—</span></div></div>
              <div className="k"><span>Quote</span><div className="v"><span>—</span></div></div>
              <div className="k">
                <span>Created</span>
                <div className="v"><span>{selected?.createdAt || "—"}</span></div>
              </div>
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

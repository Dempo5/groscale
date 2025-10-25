// apps/web/src/pages/Dashboard.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import "./dashboard-ios.css";
import {
  logout,
  listWorkflows,
  startThread,
  listThreads,
  sendMessage,
  getThreadMessages,
  getTags,
  getLeadTags,
  attachTagToLead,
  detachTagFromLead,
  type Workflow,
  type MessageDTO,
  type TagDTO,
} from "../lib/api";
import { NavLink, useNavigate } from "react-router-dom";
import CopilotModal from "../components/CopilotModal";

/* ---------------- small UI helpers ---------------- */
const OutlineIcon = ({
  d,
  size = 18,
  stroke = "currentColor",
}: { d: string; size?: number; stroke?: string }) => (
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

/* ---------------- types ---------------- */
type ThreadRow = {
  id: string;
  ownerId: string;
  leadId: string;
  leadName?: string | null;
  leadEmail?: string | null;
  leadPhone?: string | null;
  phoneNumberSid?: string | null;
  lastMessageAt?: string | null;
};

/* ---------------- utils ---------------- */
function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("+")) return digits;
  return `+${digits}`;
}

/* ---------------- "+ New conversation" box ---------------- */
function NewConversationBox({
  onCreated,
  onCancel,
}: {
  onCreated: (t: ThreadRow) => void;
  onCancel: () => void;
}) {
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

  async function handleCreate() {
    setStatus("");
    const n = normalizePhone(phone);
    if (!n || n === "+") {
      setStatus("Enter a valid phone number.");
      return;
    }
    try {
      const created = await startThread({
        phone: n,
        name: name.trim() || undefined,
        workflowId: wf || undefined,
      });
      const t: ThreadRow = {
        id: (created as any).id ?? (created as any).thread?.id ?? "",
        ownerId:
          (created as any).ownerId ??
          (created as any).thread?.ownerId ??
          "system",
        leadId:
          (created as any).leadId ??
          (created as any).thread?.leadId ??
          "",
        leadName: (created as any).leadName ?? null,
        leadEmail: (created as any).leadEmail ?? null,
        leadPhone:
          (created as any).leadPhone ?? (name ? null : n) ?? null,
        phoneNumberSid: (created as any).phoneNumberSid ?? null,
        lastMessageAt: (created as any).lastMessageAt ?? null,
      };
      onCreated(t);
    } catch (e: any) {
      setStatus(e?.message || "Failed to create conversation.");
    }
  }

  return (
    <div style={{ padding: "10px 10px 0 10px" }}>
      <div className="u-card" style={{ padding: 10 }}>
        <div style={{ display: "grid", gap: 8 }}>
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
          >
            <option value="">(none)</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={handleCreate}>
              Create
            </button>
            <button className="btn-outline" onClick={onCancel}>
              Cancel
            </button>
          </div>

          {status ? (
            <div className="hint" style={{ color: "#e5484d" }}>
              {status}
            </div>
          ) : (
            <div className="hint">
              Tip: use your own number to test. Messages will appear in
              the middle column once your webhook ingests inbound.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
/*                                 PAGE                                   */
/* ====================================================================== */
export default function Dashboard() {
  const nav = useNavigate();

  // threads + selection
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    null
  );

  // messaging state
  const [msgs, setMsgs] = useState<MessageDTO[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const pollRef = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // UI chrome
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // theme
  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("gs_theme") as "light" | "dark") || "light"
  );
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("gs_theme", theme);
  }, [theme]);

  // tagging state
  const [allTags, setAllTags] = useState<TagDTO[]>([]);
  // leadTags is newest-first: [{ tag: TagDTO, createdAt: ISO }]
  const [leadTags, setLeadTags] = useState<
    { tag: TagDTO; createdAt: string }[]
  >([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  // derive most recent tag's color (we assume leadTags[0] = newest)
  const mostRecentColor =
    leadTags.length && leadTags[0]?.tag?.color
      ? leadTags[0].tag.color
      : null;

  // helper to get currently selected thread row
  const selected = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  /* ---------------- initial load ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await listThreads();
        const list: ThreadRow[] = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.threads)
          ? (res as any).threads
          : Array.isArray((res as any)?.data)
          ? (res as any).data
          : [];
        setThreads(list);
        if (!selectedThreadId && list.length)
          setSelectedThreadId(list[0].id);
      } catch (e) {
        console.error(e);
      }

      try {
        const tags = await getTags();
        setAllTags(tags || []);
      } catch (e) {
        console.error("failed to load tags", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- fetch messages & poll ---------------- */
  useEffect(() => {
    async function loadMsgs() {
      if (!selectedThreadId) {
        setMsgs([]);
        return;
      }
      setLoadingMsgs(true);
      try {
        const data = await getThreadMessages(selectedThreadId);
        setMsgs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingMsgs(false);
        requestAnimationFrame(() => {
          scrollerRef.current?.scrollTo({
            top: 999999,
            behavior: "smooth",
          });
        });
      }
    }

    loadMsgs();

    // poll messages every 4s
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(loadMsgs, 4000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [selectedThreadId]);

  /* ---------------- fetch lead tags when selected lead changes ---------------- */
  useEffect(() => {
    async function loadLeadTags() {
      if (!selected?.leadId) {
        setLeadTags([]);
        return;
      }
      try {
        const rows = await getLeadTags(selected.leadId);
        // rows might not be sorted; force newest-first by createdAt
        const sorted = [...rows].sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        );
        // normalize to {tag, createdAt}
        setLeadTags(
          sorted.map((r: any) => ({
            tag: r.tag,
            createdAt: r.createdAt,
          }))
        );
      } catch (e) {
        console.error("failed to load lead tags", e);
        setLeadTags([]);
      }
    }

    loadLeadTags();
  }, [selected?.leadId]);

  /* ---------------- filtering for left list ---------------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const a = `${t.leadName || ""} ${t.leadEmail || ""} ${
        t.leadPhone || ""
      }`.toLowerCase();
      return a.includes(q);
    });
  }, [threads, query]);

  /* ---------------- send handler ---------------- */
  const canSend = () =>
    !!selectedThreadId && draft.trim().length > 0;

  async function handleSend() {
    if (!canSend()) return;
    const text = draft.trim();

    // optimistic bubble
    const temp: MessageDTO = {
      id: `tmp_${Date.now()}`,
      threadId: selectedThreadId!,
      direction: "OUTBOUND",
      body: text,
      status: "QUEUED",
      createdAt: new Date().toISOString(),
      error: null,
      externalSid: null,
      toNumber: null,
      fromNumber: null,
    };
    setMsgs((m) => [...m, temp]);
    setDraft("");
    setSending(true);
    setNotice("");

    try {
      await sendMessage(selectedThreadId!, text);
      setNotice(
        "Queued to send. Delivery will update after your webhook processes."
      );
      // refresh real msgs
      const data = await getThreadMessages(selectedThreadId!);
      setMsgs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setNotice(e?.message || "Failed to send.");
      setMsgs((m) =>
        m.map((mm) =>
          mm.id === temp.id ? { ...mm, status: "FAILED" } : mm
        )
      );
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        scrollerRef.current?.scrollTo({
          top: 999999,
          behavior: "smooth",
        });
      });
    }
  }

  /* ---------------- tag actions ---------------- */
  async function refreshLeadTags() {
    if (!selected?.leadId) {
      setLeadTags([]);
      return;
    }
    try {
      const rows = await getLeadTags(selected.leadId);
      const sorted = [...rows].sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
      );
      setLeadTags(
        sorted.map((r: any) => ({
          tag: r.tag,
          createdAt: r.createdAt,
        }))
      );
    } catch (e) {
      console.error("failed to reload tags", e);
    }
  }

  /* ---------------- menu close helper ---------------- */
  const closeMenuSoon = () =>
    setTimeout(() => setMenuOpen(false), 100);

  /* ================================================================== */
  /* RENDER */
  /* ================================================================== */
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
              {/* top-right avatar ALSO reflects most recent tag color */}
              <div
                className="avatar small"
                style={
                  mostRecentColor
                    ? {
                        background: mostRecentColor,
                        color: "#fff",
                      }
                    : undefined
                }
              >
                U
              </div>
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
                  {theme === "light"
                    ? "Dark mode"
                    : "Light mode"}
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
      <main
        className={`p-work grid ${
          railOpen ? "rail-open" : "rail-closed"
        }`}
      >
        {/* LEFT RAIL NAV */}
        <aside
          className={`rail ${railOpen ? "" : "collapsed"} matte`}
        >
          <nav>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `rail-item ${isActive ? "active" : ""}`
              }
              title="Conversations"
            >
              <OutlineIcon d="M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM5 20c0-3.31 2.69-6 6-6h2" />
              {railOpen && <span>Conversations</span>}
            </NavLink>

            <NavLink
              to="/workflows"
              className={({ isActive }) =>
                `rail-item ${isActive ? "active" : ""}`
              }
              title="Workflows"
            >
              <OutlineIcon d="M4 6h16M4 12h10M4 18h7" />
              {railOpen && <span>Workflows</span>}
            </NavLink>

            <NavLink
              to="/phone-numbers"
              className={({ isActive }) =>
                `rail-item ${isActive ? "active" : ""}`
              }
              title="Phone numbers"
            >
              <OutlineIcon d="M6 2h12v20H6zM9 18h6" />
              {railOpen && <span>Phone numbers</span>}
            </NavLink>

            <NavLink
              to="/tags"
              className={({ isActive }) =>
                `rail-item ${isActive ? "active" : ""}`
              }
              title="Tags"
            >
              <OutlineIcon d="M20 12l-8 8-8-8 8-8 8 8z" />
              {railOpen && <span>Tags</span>}
            </NavLink>

            <NavLink
              to="/templates"
              className={({ isActive }) =>
                `rail-item ${isActive ? "active" : ""}`
              }
              title="Templates"
            >
              <OutlineIcon d="M4 4h16v6H4zM4 14h10" />
              {railOpen && <span>Templates</span>}
            </NavLink>

            <NavLink
              to="/uploads"
              className={({ isActive }) =>
                `rail-item ${isActive ? "active" : ""}`
              }
              title="Uploads"
            >
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

        {/* CONVO LIST */}
        <section className="panel list">
          <div className="list-head">
            <div className="h">Conversations</div>
            <div className="list-head-actions">
              <button
                className="btn-outline sm"
                onClick={() => setShowNew(true)}
              >
                + New
              </button>
            </div>
          </div>

          {showNew && (
            <NewConversationBox
              onCancel={() => setShowNew(false)}
              onCreated={(t) => {
                setThreads((prev) => [
                  t,
                  ...prev.filter((p) => p.id !== t.id),
                ]);
                setSelectedThreadId(t.id);
                setShowNew(false);
              }}
            />
          )}

          <div className="search">
            <OutlineIcon d="M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4" />
            <input
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="icon-btn"
              aria-label="Filter"
              title="Filter"
            >
              <OutlineIcon d="M3 5h18M6 12h12M10 19h4" />
            </button>
          </div>

          <ul className="rows">
            {filtered.map((t) => (
              <li
                key={t.id}
                className={`row ${
                  t.id === selectedThreadId ? "selected" : ""
                }`}
                onClick={() => setSelectedThreadId(t.id)}
              >
                {/* LEFT LIST avatar also uses mostRecentColor */}
                <div
                  className="avatar"
                  style={
                    mostRecentColor
                      ? {
                          background: mostRecentColor,
                          color: "#fff",
                        }
                      : undefined
                  }
                >
                  {(t.leadName ||
                    t.leadEmail ||
                    t.leadPhone ||
                    "?")
                    .toString()
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
                <div className="meta">
                  <div className="name">
                    {t.leadName || t.leadPhone || "—"}
                  </div>
                  <div className="sub">
                    {t.leadEmail || t.leadPhone || ""}
                  </div>
                </div>
              </li>
            ))}
            {!filtered.length && (
              <li
                className="row"
                style={{ opacity: 0.7 }}
              >
                No conversations yet.
              </li>
            )}
          </ul>
        </section>

        {/* MESSAGE THREAD */}
        <section className="panel thread">
          <div className="thread-title">
            <div className="who">
              <div
                className="avatar"
                style={
                  mostRecentColor
                    ? {
                        background: mostRecentColor,
                        color: "#fff",
                      }
                    : undefined
                }
              >
                {(selected?.leadName ||
                  selected?.leadEmail ||
                  selected?.leadPhone ||
                  "T")
                  .toString()
                  .slice(0, 1)
                  .toUpperCase()}
              </div>
              <div className="who-meta">
                <div className="who-name">
                  {selected?.leadName || "—"}
                </div>
                <div className="who-sub">
                  {selected?.leadEmail ||
                    selected?.leadPhone ||
                    ""}
                </div>
              </div>
            </div>
          </div>

          <div
            className="messages"
            key={selected?.id ?? "none"}
            ref={scrollerRef}
          >
            {loadingMsgs && !msgs.length && (
              <div className="hint">Loading messages…</div>
            )}

            {!loadingMsgs && msgs.length === 0 && (
              <div className="hint">
                Messages will appear here once you start texting.
                <br />
                (Wire your outbound send + inbound webhook to
                populate this thread.)
              </div>
            )}

            {/* render bubbles */}
            {(() => {
              const lastOutboundId = [...msgs]
                .reverse()
                .find((x) => x.direction === "OUTBOUND")?.id;

              return msgs.map((m) => {
                const isOut = m.direction === "OUTBOUND";

                const statusLabel = isOut
                  ? m.status === "DELIVERED"
                    ? "Delivered"
                    : m.status === "SENT"
                    ? "Sent"
                    : m.status === "QUEUED"
                    ? "Queued"
                    : m.status === "FAILED"
                    ? "Failed"
                    : m.status
                  : "";

                return (
                  <div
                    key={m.id}
                    className={`m-row ${isOut ? "out" : "in"}`}
                    style={{
                      display: "flex",
                      justifyContent: isOut
                        ? "flex-end"
                        : "flex-start",
                      margin: "6px 0",
                    }}
                  >
                    <div
                      className="bubble"
                      style={{
                        maxWidth: 560,
                        padding: "8px 10px",
                        borderRadius: 10,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        background: isOut
                          ? "var(--btn-primary-bg, #4f46e5)"
                          : "var(--panel-bg, #f3f4f6)",
                        color: isOut
                          ? "var(--btn-primary-fg, #fff)"
                          : "var(--fg, #111)",
                        opacity:
                          m.status === "FAILED"
                            ? 0.6
                            : 1,
                        border:
                          m.status === "FAILED"
                            ? "1px solid #e5484d"
                            : "none",
                      }}
                      title={`${m.direction} • ${
                        m.status
                      } • ${new Date(
                        m.createdAt
                      ).toLocaleString()}`}
                    >
                      {m.body}
                    </div>

                    {/* Only show status line under the most recent outbound */}
                    {isOut &&
                      m.id === lastOutboundId && (
                        <div
                          style={{
                            fontSize: 11,
                            opacity: 0.8,
                            marginTop: 4,
                            marginRight: 6,
                            textAlign: "right",
                          }}
                        >
                          {statusLabel}
                        </div>
                      )}
                  </div>
                );
              });
            })()}

            {notice && (
              <div
                className="hint"
                style={{ marginTop: 8 }}
              >
                {notice}
              </div>
            )}
          </div>

          <div className="composer">
            <input
              placeholder="Send a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!selectedThreadId || sending}
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
              <span
                className="copilot-static"
                aria-hidden
              />
              <OutlineIcon d="M5 12l4 4L19 6" />
              Copilot
            </button>
            <button
              className="btn-primary"
              onClick={handleSend}
              disabled={
                !draft.trim() ||
                !selectedThreadId ||
                sending
              }
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </section>

        {/* RIGHT PANEL (details) */}
        <aside className="panel details">
          {/* PERSONAL INFO */}
          <div className="section">
            <div className="section-title">Personal Info</div>
            <div className="kv">
              <label>Full name</label>
              <span className="copy-row">
                <span>
                  {selected?.leadName || (
                    <i className="placeholder">
                      Not provided
                    </i>
                  )}
                </span>
                <CopyBtn
                  value={
                    selected?.leadName || undefined
                  }
                />
              </span>
            </div>
            <div className="kv">
              <label>Email</label>
              <span className="copy-row">
                <span>
                  {selected?.leadEmail || (
                    <i className="placeholder">
                      Not provided
                    </i>
                  )}
                </span>
                <CopyBtn
                  value={
                    selected?.leadEmail ||
                    undefined
                  }
                />
              </span>
            </div>
            <div className="kv">
              <label>Phone</label>
              <span className="copy-row">
                <span>
                  {selected?.leadPhone || (
                    <i className="placeholder">
                      Not provided
                    </i>
                  )}
                </span>
                <CopyBtn
                  value={
                    selected?.leadPhone ||
                    undefined
                  }
                />
              </span>
            </div>
          </div>

          {/* DEMOGRAPHICS */}
          <div className="section">
            <div className="section-title">
              Demographics
            </div>
            {[
              "DOB",
              "Age",
              "City",
              "State",
              "ZIP",
              "Household size",
            ].map((k) => (
              <div className="kv" key={k}>
                <label>{k}</label>
                <span className="copy-row">
                  <span>
                    <i className="placeholder">
                      Not provided
                    </i>
                  </span>
                </span>
              </div>
            ))}
          </div>

          {/* TAGS */}
          <div className="section">
            <div
              className="section-title"
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
              }}
            >
              <span>Tags</span>
              <button
                className="btn-outline sm"
                onClick={() =>
                  setTagPickerOpen(true)
                }
                disabled={!selected?.leadId}
                title="Attach a tag"
              >
                + Tag
              </button>
            </div>

            {/* applied tags */}
            <div
              className="tag-row"
              style={{
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {leadTags.length ? (
                leadTags.map(({ tag }) => (
                  <span
                    key={tag.id}
                    className="tag"
                    style={{
                      background:
                        tag.color ??
                        "#eef2ff",
                      color: tag.color
                        ? "#fff"
                        : "#374151",
                      borderRadius: 999,
                      padding:
                        "4px 8px",
                      display:
                        "inline-flex",
                      alignItems:
                        "center",
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                    title={
                      tag.name
                    }
                  >
                    {tag.name}
                    <button
                      aria-label={`Remove ${tag.name}`}
                      onClick={async () => {
                        if (
                          !selected?.leadId
                        )
                          return;
                        await detachTagFromLead(
                          selected.leadId,
                          tag.id
                        );
                        await refreshLeadTags();
                      }}
                      style={{
                        border: 0,
        background:
          "transparent",
                        color:
                          "inherit",
                        cursor:
                          "pointer",
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <i className="placeholder">
                  No tags
                </i>
              )}
            </div>

            {/* picker modal */}
            {tagPickerOpen && (
              <div
                style={{
                  position:
                    "fixed",
                  inset: 0,
                  background:
                    "rgba(0,0,0,.35)",
                  display:
                    "grid",
                  placeItems:
                    "center",
                  zIndex: 50,
                }}
                onClick={() =>
                  setTagPickerOpen(false)
                }
              >
                <div
                  className="u-card"
                  style={{
                    width: 360,
                    maxWidth:
                      "90vw",
                    padding: 12,
                    background:
                      "#fff",
                    borderRadius: 12,
                    boxShadow:
                      "0 20px 40px rgba(0,0,0,.18)",
                  }}
                  onClick={(e) =>
                    e.stopPropagation()
                  }
                >
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    Add a tag
                  </div>
                  <div
                    style={{
                      maxHeight: 280,
                      overflow: "auto",
                    }}
                  >
                    {allTags.length ? (
                      allTags.map(
                        (t) => (
                          <button
                            key={
                              t.id
                            }
                            className="row"
                            style={{
                              width:
                                "100%",
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: 10,
                              padding:
                                "6px 8px",
                              cursor:
                                "pointer",
                            }}
                            onClick={async () => {
                              if (
                                !selected?.leadId
                              )
                                return;
                              await attachTagToLead(
                                selected.leadId,
                                t.id
                              );
                              await refreshLeadTags();
                              setTagPickerOpen(
                                false
                              );
                            }}
                          >
                            <span
                              className="dot"
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius:
                                  999,
                                background:
                                  t.color ??
                                  "#e5e7eb",
                                border:
                                  "1px solid #e5e7eb",
                              }}
                            />
                            <span
                              style={{
                                flex: 1,
                                textAlign:
                                  "left",
                              }}
                            >
                              {
                                t.name
                              }
                            </span>
                          </button>
                        )
                      )
                    ) : (
                      <div
                        className="hint"
                        style={{
                          padding: 8,
                        }}
                      >
                        No tags yet.{" "}
                        <a
                          onClick={() => {
                            setTagPickerOpen(
                              false
                            );
                            nav(
                              "/tags"
                            );
                          }}
                          style={{
                            cursor:
                              "pointer",
                          }}
                        >
                          Create one
                        </a>
                        .
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "flex-end",
                      gap: 8,
                      marginTop: 10,
                    }}
                  >
                    <button
                      className="btn-outline"
                      onClick={() =>
                        setTagPickerOpen(
                          false
                        )
                      }
                    >
                      Close
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        setTagPickerOpen(
                          false
                        );
                        nav("/tags");
                      }}
                    >
                      Open Tags
                      page
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SYSTEM INFO */}
          <div className="section">
            <div className="section-title">
              System Info
            </div>
            {[
              { k: "Quote", v: "" },
              { k: "Created", v: "" },
            ].map(({ k, v }) => (
              <div
                className="kv"
                key={k}
              >
                <label>{k}</label>
                <span className="copy-row">
                  <span>
                    {v || (
                      <i className="placeholder">
                        Not
                        provided
                      </i>
                    )}
                  </span>
                  <CopyBtn
                    value={
                      v || undefined
                    }
                  />
                </span>
              </div>
            ))}
          </div>
        </aside>
      </main>

      <CopilotModal
        open={copilotOpen}
        onClose={() =>
          setCopilotOpen(false)
        }
      />
    </div>
  );
}

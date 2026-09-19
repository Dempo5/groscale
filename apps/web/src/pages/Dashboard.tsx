// apps/web/src/pages/Dashboard.tsx
// Inbox: conversation list | message thread | lead details.
// Same data + logic as before (threads, polling, send, tags, Copilot),
// rebuilt on the new design system.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  listWorkflows,
  startThread,
  listThreads,
  sendMessage,
  getThreadMessages,
  getTags,
  createTag,
  getLeadTags,
  attachTagToLead,
  detachTagFromLead,
  type Workflow,
  type MessageDTO,
  type TagDTO,
  type TagColor,
} from "../lib/api";
import { tagChipColors } from "../lib/tagColors";
import CopilotModal from "../components/CopilotModal";
import "./dashboard.css";

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

type LeadTag = { tag: TagDTO; createdAt: string };

/* ---------------- small helpers ---------------- */
const Icon = ({ d, size = 15 }: { d: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

const ICON = {
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  copy: "M9 9V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3M6 9h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
};

const TAG_COLORS: TagColor[] = ["blue", "green", "orange", "violet", "teal", "pink", "amber", "red", "indigo", "gray"];

function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

function formatPhone(p?: string | null): string {
  if (!p) return "";
  const d = p.replace(/\D+/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return p;
}

function displayName(t?: ThreadRow | null): string {
  if (!t) return "";
  return t.leadName || formatPhone(t.leadPhone) || t.leadEmail || "Unknown";
}

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z ]/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "#";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// "9:41 AM" today, "Yesterday", "Mon" this week, "Sep 12" older
function listTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (startOfDay(new Date()) - startOfDay(d)) / DAY;
  if (diff === 0) return timeOf(iso);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const diff = (startOfDay(new Date()) - startOfDay(d)) / DAY;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function sinceLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

// SMS length: 160 chars for plain text, 70 if it has emoji/special chars.
// Long messages split into segments of 153 / 67.
function smsInfo(text: string) {
  const plain = /^[\x20-\x7E\n\r]*$/.test(text);
  const single = plain ? 160 : 70;
  const multi = plain ? 153 : 67;
  const len = text.length;
  const segments = len === 0 ? 1 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, limit: segments === 1 ? single : multi * segments, segments };
}

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed",
};

function copy(text?: string | null) {
  if (text) navigator.clipboard?.writeText(text).catch(() => {});
}

/* ---------------- New conversation ---------------- */
function NewConversationBox({
  onCreated,
  onCancel,
}: {
  onCreated: (t: ThreadRow) => void;
  onCancel: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [wf, setWf] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listWorkflows()
      .then((ws) => setWorkflows(ws || []))
      .catch(() => setWorkflows([]));
  }, []);

  async function handleCreate() {
    setError("");
    const n = normalizePhone(phone);
    if (n.replace(/\D/g, "").length < 10) {
      setError("Enter a 10-digit phone number.");
      return;
    }
    setBusy(true);
    try {
      const created: any = await startThread({
        phone: n,
        name: name.trim() || undefined,
        workflowId: wf || undefined,
      });
      onCreated({
        id: created.id ?? created.thread?.id ?? "",
        ownerId: created.ownerId ?? created.thread?.ownerId ?? "system",
        leadId: created.leadId ?? created.thread?.leadId ?? "",
        leadName: created.leadName ?? (name.trim() || null),
        leadEmail: created.leadEmail ?? null,
        leadPhone: created.leadPhone ?? n,
        phoneNumberSid: created.phoneNumberSid ?? null,
        lastMessageAt: created.lastMessageAt ?? null,
      });
    } catch (e: any) {
      setError(e?.message || "Couldn't start the conversation. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gs-newconvo">
      <div className="gs-newconvo-title">New text</div>
      <input
        className="gs-input"
        placeholder="Phone number"
        value={phone}
        autoFocus
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
      />
      <input
        className="gs-input"
        placeholder="Name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select className="gs-input" value={wf} onChange={(e) => setWf(e.target.value)}>
        <option value="">No workflow</option>
        {workflows.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {error && <div className="gs-error">{error}</div>}
      <div className="gs-row-end">
        <button className="gs-btn gs-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="gs-btn gs-btn--primary" onClick={handleCreate} disabled={busy}>
          {busy ? "Starting…" : "Start conversation"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Tag picker (dropdown) ---------------- */
function TagPicker({
  allTags,
  applied,
  onPick,
  onCreate,
  onClose,
}: {
  allTags: TagDTO[];
  applied: Set<string>;
  onPick: (t: TagDTO) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const query = q.trim().toLowerCase();
  const options = allTags.filter((t) => !applied.has(t.id) && t.name.toLowerCase().includes(query));
  const exact = allTags.some((t) => t.name.toLowerCase() === query);

  return (
    <div className="gs-picker" ref={ref}>
      <input
        className="gs-input"
        placeholder="Find or create a tag"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (options[0]) onPick(options[0]);
          else if (query && !exact) onCreate(q.trim());
        }}
      />
      <div className="gs-picker-list">
        {options.map((t) => {
          const c = tagChipColors(t.color);
          return (
            <button key={t.id} className="gs-picker-item" onClick={() => onPick(t)}>
              <span className="gs-chip" style={{ background: c.bg, color: c.fg }}>
                {t.name}
              </span>
            </button>
          );
        })}
        {query && !exact && (
          <button className="gs-picker-item" onClick={() => onCreate(q.trim())}>
            <Icon d={ICON.plus} size={13} />
            Create “{q.trim()}”
          </button>
        )}
        {!options.length && !query && (
          <div className="gs-picker-empty">Type a name to create your first tag.</div>
        )}
      </div>
    </div>
  );
}

/* ====================================================================== */
/*                                 PAGE                                   */
/* ====================================================================== */
export default function Dashboard() {
  const nav = useNavigate();
  const location = useLocation();

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const [msgs, setMsgs] = useState<MessageDTO[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const pollRef = useRef<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const [allTags, setAllTags] = useState<TagDTO[]>([]);
  const [leadTags, setLeadTags] = useState<LeadTag[]>([]); // newest first
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const selected = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  // Sidebar "New text" button
  useEffect(() => {
    if ((location.state as any)?.newText) setShowNew(true);
  }, [location.state]);

  /* ---------------- initial load ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const res: any = await listThreads();
        const list: ThreadRow[] = Array.isArray(res)
          ? res
          : Array.isArray(res?.threads)
          ? res.threads
          : Array.isArray(res?.data)
          ? res.data
          : [];
        list.sort(
          (a, b) =>
            new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        );
        setThreads(list);
        if (list.length) setSelectedThreadId((cur) => cur ?? list[0].id);
      } catch (e) {
        console.error(e);
      }
      try {
        setAllTags((await getTags()) || []);
      } catch (e) {
        console.error("failed to load tags", e);
      }
    })();
  }, []);

  /* ---------------- messages + polling ---------------- */
  useEffect(() => {
    let first = true;
    async function loadMsgs() {
      if (!selectedThreadId) {
        setMsgs([]);
        return;
      }
      if (first) setLoadingMsgs(true);
      try {
        const data = await getThreadMessages(selectedThreadId);
        setMsgs((prev) => {
          const next = Array.isArray(data) ? data : [];
          // only scroll when something new arrived
          if (next.length !== prev.length) {
            requestAnimationFrame(() =>
              scrollerRef.current?.scrollTo({ top: 1e9, behavior: first ? "auto" : "smooth" })
            );
          }
          return next;
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingMsgs(false);
        first = false;
      }
    }

    setMsgs([]);
    setNotice("");
    loadMsgs();
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(loadMsgs, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [selectedThreadId]);

  /* ---------------- lead tags ---------------- */
  async function refreshLeadTags(leadId = selected?.leadId) {
    if (!leadId) {
      setLeadTags([]);
      return;
    }
    try {
      const rows: any[] = await getLeadTags(leadId);
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setLeadTags(rows.map((r) => ({ tag: r.tag, createdAt: r.createdAt })));
    } catch (e) {
      console.error("failed to load lead tags", e);
      setLeadTags([]);
    }
  }

  useEffect(() => {
    setTagPickerOpen(false);
    refreshLeadTags(selected?.leadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.leadId]);

  async function addTag(tag: TagDTO) {
    if (!selected?.leadId) return;
    setTagPickerOpen(false);
    await attachTagToLead(selected.leadId, tag.id);
    await refreshLeadTags();
  }

  async function createAndAddTag(name: string) {
    const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
    try {
      const tag = await createTag({ name, color });
      setAllTags((prev) => [...prev, tag]);
      await addTag(tag);
    } catch (e: any) {
      setNotice(e?.message || "Couldn't create that tag.");
    }
  }

  async function removeTag(tagId: string) {
    if (!selected?.leadId) return;
    await detachTagFromLead(selected.leadId, tagId);
    await refreshLeadTags();
  }

  /* ---------------- list filter ---------------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    const qDigits = q.replace(/\D/g, "");
    return threads.filter((t) => {
      const text = `${t.leadName || ""} ${t.leadEmail || ""}`.toLowerCase();
      const phone = (t.leadPhone || "").replace(/\D/g, "");
      return text.includes(q) || (qDigits.length > 2 && phone.includes(qDigits));
    });
  }, [threads, query]);

  /* ---------------- send ---------------- */
  const canSend = !!selectedThreadId && draft.trim().length > 0 && !sending;

  async function handleSend() {
    if (!canSend) return;
    const text = draft.trim();
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
    requestAnimationFrame(() => scrollerRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));

    try {
      await sendMessage(selectedThreadId!, text);
      const data = await getThreadMessages(selectedThreadId!);
      setMsgs(Array.isArray(data) ? data : []);
      setThreads((prev) =>
        prev
          .map((t) => (t.id === selectedThreadId ? { ...t, lastMessageAt: new Date().toISOString() } : t))
          .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime())
      );
    } catch (e: any) {
      setNotice(e?.message || "Message failed to send.");
      setMsgs((m) => m.map((mm) => (mm.id === temp.id ? { ...mm, status: "FAILED" } : mm)));
    } finally {
      setSending(false);
    }
  }

  /* ---------------- derived ---------------- */
  const name = displayName(selected);
  const firstName = (selected?.leadName || "").split(" ")[0] || null;
  const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
  const sms = smsInfo(draft);
  const appliedIds = useMemo(() => new Set(leadTags.map((l) => l.tag.id)), [leadTags]);

  // messages with a day divider wherever the date changes
  const timeline = useMemo(() => {
    const out: ({ kind: "day"; key: string; label: string } | { kind: "msg"; m: MessageDTO })[] = [];
    let lastDay = "";
    for (const m of msgs) {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        out.push({ kind: "day", key: `d_${day}`, label: dayLabel(m.createdAt) });
        lastDay = day;
      }
      out.push({ kind: "msg", m });
    }
    return out;
  }, [msgs]);

  /* ================================================================== */
  return (
    <div className="gs-inbox">
      {/* ---------------- Conversation list ---------------- */}
      <section className="gs-list" aria-label="Conversations">
        <div className="gs-list-head">
          <h1>Inbox</h1>
          <span className="gs-list-count">{threads.length || ""}</span>
        </div>

        <label className="gs-search">
          <Icon d={ICON.search} size={14} />
          <input
            placeholder="Search name or number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search conversations"
          />
        </label>

        {showNew && (
          <NewConversationBox
            onCancel={() => setShowNew(false)}
            onCreated={(t) => {
              setThreads((prev) => [t, ...prev.filter((p) => p.id !== t.id)]);
              setSelectedThreadId(t.id);
              setShowNew(false);
            }}
          />
        )}

        <div className="gs-rows">
          {filtered.map((t) => {
            const nm = displayName(t);
            const active = t.id === selectedThreadId;
            return (
              <button
                key={t.id}
                className={`gs-row ${active ? "is-active" : ""}`}
                onClick={() => setSelectedThreadId(t.id)}
                aria-current={active || undefined}
              >
                <div className="gs-row-top">
                  <span className="gs-row-name">{nm}</span>
                  <span className="gs-row-time">{listTime(t.lastMessageAt)}</span>
                </div>
                {t.leadName && t.leadPhone && (
                  <div className="gs-row-sub">{formatPhone(t.leadPhone)}</div>
                )}
              </button>
            );
          })}

          {!threads.length && !showNew && (
            <div className="gs-empty-small">
              No conversations yet.
              <button className="gs-btn" onClick={() => setShowNew(true)}>
                Start your first text
              </button>
            </div>
          )}
          {!!threads.length && !filtered.length && (
            <div className="gs-empty-small">No matches for “{query}”.</div>
          )}
        </div>
      </section>

      {/* ---------------- Thread ---------------- */}
      <section className="gs-thread" aria-label={selected ? `Conversation with ${name}` : "Conversation"}>
        {selected ? (
          <>
            <header className="gs-thread-head">
              <div className="gs-thread-who">
                <span className="gs-thread-name">{name}</span>
                {selected.leadName && selected.leadPhone && (
                  <span className="gs-mono">{formatPhone(selected.leadPhone)}</span>
                )}
              </div>
              <button
                className="gs-btn gs-btn--ghost gs-icon-btn"
                title="Copy phone number"
                aria-label="Copy phone number"
                onClick={() => copy(selected.leadPhone)}
              >
                <Icon d={ICON.copy} />
              </button>
            </header>

            <div className="gs-messages" ref={scrollerRef}>
              {loadingMsgs && !msgs.length && <div className="gs-muted-center">Loading messages…</div>}
              {!loadingMsgs && !msgs.length && (
                <div className="gs-muted-center">No messages yet. Say hi to {firstName || "them"}.</div>
              )}

              {timeline.map((item) =>
                item.kind === "day" ? (
                  <div key={item.key} className="gs-day">
                    {item.label}
                  </div>
                ) : (
                  <div
                    key={item.m.id}
                    className={`gs-msg ${item.m.direction === "OUTBOUND" ? "is-out" : "is-in"} ${
                      item.m.status === "FAILED" ? "is-failed" : ""
                    }`}
                  >
                    <div className="gs-bubble" title={item.m.error || undefined}>
                      {item.m.body}
                    </div>
                    <span className="gs-msg-meta">
                      {timeOf(item.m.createdAt)}
                      {item.m.direction === "OUTBOUND" && STATUS_LABEL[item.m.status]
                        ? ` · ${STATUS_LABEL[item.m.status]}`
                        : ""}
                    </span>
                  </div>
                )
              )}
            </div>

            <div className="gs-composer-wrap">
              {notice && <div className="gs-error">{notice}</div>}
              <div className="gs-composer">
                <textarea
                  rows={2}
                  placeholder={`Text ${firstName || name}…`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  aria-label="Message"
                />
                <div className="gs-composer-bar">
                  <div className="gs-row-start">
                    <button className="gs-btn gs-btn--soft" onClick={() => nav("/templates")}>
                      Templates
                    </button>
                    <button className="gs-btn gs-btn--soft" onClick={() => setCopilotOpen(true)}>
                      <span className="gs-accent-icon">
                        <Icon d={ICON.sparkle} size={13} />
                      </span>
                      Copilot
                    </button>
                  </div>
                  <div className="gs-row-start">
                    <span className="gs-mono gs-counter">
                      {sms.len} / {sms.limit} · {sms.segments} segment{sms.segments > 1 ? "s" : ""}
                    </span>
                    <button className="gs-btn gs-btn--primary" onClick={handleSend} disabled={!canSend}>
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="gs-thread-empty">
            <p>Pick a conversation, or start a new one.</p>
            <button className="gs-btn gs-btn--primary" onClick={() => setShowNew(true)}>
              New text
            </button>
          </div>
        )}
      </section>

      {/* ---------------- Lead details ---------------- */}
      {selected && (
        <aside className="gs-details" aria-label="Lead details">
          <div className="gs-lead-head">
            <span className="gs-lead-avatar">{initials(name)}</span>
            <div className="gs-lead-id">
              <span className="gs-lead-name">{name}</span>
              <span className="gs-lead-sub">{formatPhone(selected.leadPhone) || selected.leadEmail}</span>
            </div>
          </div>

          <div className="gs-card">
            <span className="gs-label">Last contact</span>
            {lastMsg ? (
              lastMsg.direction === "INBOUND" ? (
                <>
                  <span className="gs-strong">
                    {firstName || "They"} replied {listTime(lastMsg.createdAt) === timeOf(lastMsg.createdAt) ? "at " : ""}
                    {listTime(lastMsg.createdAt)}
                  </span>
                  <span className="gs-waiting-you">Waiting on you · {sinceLabel(lastMsg.createdAt)}</span>
                </>
              ) : (
                <>
                  <span className="gs-strong">You texted {listTime(lastMsg.createdAt)}</span>
                  <span className="gs-label">Waiting on {firstName || "them"} · {sinceLabel(lastMsg.createdAt)}</span>
                </>
              )
            ) : (
              <span className="gs-label">No messages yet</span>
            )}
          </div>

          <div className="gs-facts">
            <div>
              <span className="gs-label">Age</span>
              <span className="gs-fact">—</span>
            </div>
            <div>
              <span className="gs-label">Household</span>
              <span className="gs-fact">—</span>
            </div>
            <div>
              <span className="gs-label">ZIP</span>
              <span className="gs-fact">—</span>
            </div>
            <div>
              <span className="gs-label">Email</span>
              <span className="gs-fact gs-truncate" title={selected.leadEmail || undefined}>
                {selected.leadEmail || "—"}
              </span>
            </div>
          </div>

          <div className="gs-section">
            <div className="gs-section-head">
              <span className="gs-label">Tags</span>
            </div>
            <div className="gs-tags">
              {leadTags.map(({ tag }) => {
                const c = tagChipColors(tag.color);
                return (
                  <span key={tag.id} className="gs-chip gs-tag" style={{ background: c.bg, color: c.fg }}>
                    {tag.name}
                    <button aria-label={`Remove ${tag.name}`} title="Remove" onClick={() => removeTag(tag.id)}>
                      <Icon d={ICON.close} size={11} />
                    </button>
                  </span>
                );
              })}
              <div className="gs-picker-anchor">
                <button className="gs-add-tag" onClick={() => setTagPickerOpen((o) => !o)}>
                  + Add
                </button>
                {tagPickerOpen && (
                  <TagPicker
                    allTags={allTags}
                    applied={appliedIds}
                    onPick={addTag}
                    onCreate={createAndAddTag}
                    onClose={() => setTagPickerOpen(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="gs-card gs-notes">
            <span className="gs-label">Notes</span>
            <input className="gs-input" placeholder="Notes are coming soon" disabled />
          </div>
        </aside>
      )}

      <CopilotModal open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}

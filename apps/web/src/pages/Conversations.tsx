// apps/web/src/pages/Conversations.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listThreads,
  getThreadMessages,
  sendMessage,
  startThread,
  type MessageThread,
  type Message,
} from "../lib/api";

export default function Conversations() {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // load threads on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await listThreads();
        setThreads(data);
        if (!activeId && data.length) setActiveId(data[0].id);
      } catch {
        setThreads([]);
      }
    })();
  }, []);

  // load messages for selected thread
  useEffect(() => {
    let t: any;
    async function load() {
      if (!activeId) return;
      try {
        const msgs = await getThreadMessages(activeId);
        setMessages(msgs);
        // autoscroll
        queueMicrotask(() => {
          scrollRef.current?.scrollTo({ top: 1e9 });
        });
      } catch {
        /* ignore */
      }
    }
    load();
    // simple 5s poll
    t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [activeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (th) =>
        th.leadName?.toLowerCase().includes(q) ||
        (th.leadEmail || "").toLowerCase().includes(q) ||
        (th.leadPhone || "").toLowerCase().includes(q)
    );
  }, [threads, search]);

  async function onSend() {
    if (!activeId || !composer.trim()) return;
    setBusy(true);
    try {
      await sendMessage(activeId, composer.trim());
      setComposer("");
      // fetch after send
      const msgs = await getThreadMessages(activeId);
      setMessages(msgs);
      queueMicrotask(() => scrollRef.current?.scrollTo({ top: 1e9 }));
    } catch (e: any) {
      alert(e?.message || "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  async function onNewConversation() {
    const phone = prompt("Enter phone number (E.164 or 10-digit):");
    if (!phone) return;
    const name = prompt("Contact name (optional):") || undefined;

    try {
      const th = await startThread({ phone, name });
      // prepend if not already present
      setThreads((prev) =>
        prev.some((p) => p.id === th.id) ? prev : [th, ...prev]
      );
      setActiveId(th.id);
    } catch (e: any) {
      alert(e?.message || "Could not start conversation");
    }
  }

  return (
    <div className="conv">
      <aside className="left">
        <div className="left-h">
          <div className="title">Conversations</div>
          <button className="btn" onClick={onNewConversation}>+ New</button>
        </div>
        <input
          className="search"
          placeholder="Search name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {!filtered.length ? (
          <div className="empty">
            <div className="empty-title">No conversations yet</div>
            <div className="empty-sub">
              Start one with “New”, or upload a CSV—messages will appear here.
            </div>
          </div>
        ) : (
          <div className="threadlist">
            {filtered.map((th) => (
              <button
                key={th.id}
                className={`row ${activeId === th.id ? "active" : ""}`}
                onClick={() => setActiveId(th.id)}
              >
                <div className="avatar">{(th.leadName || "U").slice(0, 1)}</div>
                <div className="meta">
                  <div className="name">{th.leadName || th.leadEmail || th.leadPhone}</div>
                  <div className="sub">
                    {th.leadEmail || th.leadPhone || "—"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="right">
        {!activeId ? (
          <div className="pick">Pick a conversation</div>
        ) : (
          <>
            <div ref={scrollRef} className="messages">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`bubble ${m.direction === "OUTBOUND" ? "me" : ""}`}
                  title={new Date(m.createdAt).toLocaleString()}
                >
                  {m.body}
                </div>
              ))}
            </div>

            <div className="composer">
              <input
                className="composer-input"
                placeholder="Send a message…"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
              <button className="btn" disabled={busy || !composer.trim()} onClick={onSend}>
                Send
              </button>
            </div>
          </>
        )}
      </section>

      <style>{`
        .conv{display:grid;grid-template-columns:320px 1fr;height:calc(100vh - 64px);gap:14px;padding:10px}
        .left{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;display:grid;grid-template-rows:auto auto 1fr}
        .left-h{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e5e7eb}
        .title{font-weight:800}
        .btn{background:var(--accent,#10b981);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
        .search{margin:10px;border:1px solid #e5e7eb;border-radius:8px;height:36px;padding:0 10px}
        .threadlist{overflow:auto;padding:6px}
        .row{display:flex;gap:10px;align-items:center;width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#fff;margin:6px 0;cursor:pointer;text-align:left}
        .row.active{outline:2px solid rgba(16,185,129,.25);border-color:#bbf7d0;background:#f0fdf4}
        .avatar{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#f3f4f6;font-weight:700}
        .meta .name{font-weight:700}
        .meta .sub{font-size:12px;color:#6b7280}
        .empty{margin:40px 16px;color:#6b7280}
        .empty-title{font-weight:700;color:#111827}
        .right{border:1px solid #e5e7eb;border-radius:12px;display:grid;grid-template-rows:1fr auto;overflow:hidden;min-width:0;background:#fff}
        .messages{padding:16px;overflow:auto;background:#fafafa}
        .bubble{max-width:60ch;margin:8px 0;padding:10px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:12px}
        .bubble.me{margin-left:auto;background:#e8fff7;border-color:#bbf7d0}
        .composer{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}
        .composer-input{flex:1;border:1px solid #e5e7eb;border-radius:10px;height:40px;padding:0 12px}
        .pick{display:grid;place-items:center;color:#6b7280}
      `}</style>
    </div>
  );
}

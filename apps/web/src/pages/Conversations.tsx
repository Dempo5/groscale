// apps/web/src/pages/Conversations.tsx
import { useEffect, useMemo, useState } from "react";
import {
  listThreads,
  getThreadMessages,
  startThread,
  sendMessage,
  type MessageThread,
  type Message,
} from "../lib/api";

export default function Conversations() {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // “New conversation” controls
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newFirst, setNewFirst] = useState("");

  const active = useMemo(
    () => threads.find(t => t.id === activeId) || null,
    [threads, activeId]
  );

  // initial load
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const t = await listThreads();
        setThreads(t);
        if (t.length && !activeId) setActiveId(t[0].id);
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    })();
  }, []);

  // load messages when active changes
  useEffect(() => {
    if (!activeId) {
      setMsgs([]);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const m = await getThreadMessages(activeId);
        setMsgs(m);
      } catch (e: any) {
        setErr(String(e?.message || e));
        setMsgs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeId]);

  async function onStartNew() {
    const phone = newPhone.trim();
    if (!phone) return;
    try {
      setErr(null);
      const { threadId } = await startThread({
        phone,
        name: newName.trim() || undefined,
        firstMessage: newFirst.trim() || undefined,
      });
      // refresh list and select new one
      const t = await listThreads();
      setThreads(t);
      setActiveId(threadId);
      setNewPhone("");
      setNewName("");
      setNewFirst("");
    } catch (e: any) {
      setErr(`Start failed: ${String(e?.message || e)}`);
    }
  }

  async function onSend(body: string) {
    if (!activeId || !body.trim()) return;
    // optimistic
    const temp: Message = {
      id: `temp-${Math.random().toString(36).slice(2)}`,
      threadId: activeId,
      direction: "OUTBOUND",
      body,
      status: "QUEUED",
      createdAt: new Date().toISOString(),
    };
    setMsgs(m => [...m, temp]);
    try {
      await sendMessage(activeId, body.trim());
      // re-pull to show canonical result
      const m = await getThreadMessages(activeId);
      setMsgs(m);
    } catch (e: any) {
      setErr(`Send failed: ${String(e?.message || e)}`);
    }
  }

  return (
    <div className="p-dashboard">
      <div className="dash-cols">
        {/* LEFT: conversations list + new */}
        <aside className="left">
          <div className="panel">
            <div className="panel-h">Conversations</div>
            <div className="stack">
              <input
                className="text"
                placeholder="+15551234567"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
              />
              <input
                className="text"
                placeholder="Name (optional)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <input
                className="text"
                placeholder="First message (optional)"
                value={newFirst}
                onChange={e => setNewFirst(e.target.value)}
              />
              <button className="btn" onClick={onStartNew}>New</button>
            </div>

            <div className="list">
              {threads.length === 0 && (
                <div className="muted">No conversations yet.</div>
              )}
              {threads.map(t => (
                <button
                  key={t.id}
                  className={`row ${t.id === activeId ? "sel" : ""}`}
                  onClick={() => setActiveId(t.id)}
                >
                  <div className="title">
                    {t.leadName || t.leadPhone || "Unknown"}
                  </div>
                  <div className="sub">
                    {t.leadEmail || t.leadPhone || ""}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* RIGHT: messages */}
        <main className="main">
          <div className="panel">
            <div className="panel-h">GroScales</div>

            {err && <div className="err">{err}</div>}

            {!active && (
              <div className="emptyMain">
                Messages will appear here once you start texting.
              </div>
            )}

            {active && (
              <>
                <div className="thread">
                  {loading && <div className="muted">Loading…</div>}
                  {msgs.map(m => (
                    <div
                      key={m.id}
                      className={`bubble ${m.direction === "OUTBOUND" ? "out" : "in"}`}
                    >
                      <div className="body">{m.body}</div>
                      <div className="meta">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        {" · "}
                        {m.status.toLowerCase()}
                      </div>
                    </div>
                  ))}
                  {!loading && msgs.length === 0 && (
                    <div className="muted">No messages yet.</div>
                  )}
                </div>

                <SendBar onSend={onSend} />
              </>
            )}
          </div>
        </main>
      </div>

      {/* a touch of scoped CSS that plays nice with your dashboard-ios.css */}
      <style>{`
        .p-dashboard { padding: 10px; }
        .dash-cols { display: grid; grid-template-columns: 300px 1fr; gap: 12px; }
        .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; display: grid; }
        .panel-h { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 700; }
        .left .stack { display: grid; gap: 6px; padding: 10px; }
        .text { border: 1px solid #e5e7eb; border-radius: 8px; height: 34px; padding: 0 10px; }
        .btn { height: 34px; border-radius: 8px; border: 0; background: var(--accent,#10b981); color: #fff; cursor: pointer; }
        .list { padding: 6px; display: grid; gap: 6px; overflow: auto; max-height: 60vh; }
        .row { text-align: left; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background:#fff; cursor:pointer; }
        .row.sel { outline: 2px solid #10b981; }
        .title { font-weight: 600; }
        .sub { color:#6b7280; font-size:12px; }
        .main .thread { padding: 12px; display: grid; gap: 8px; min-height: 420px; }
        .bubble { max-width: 70%; padding: 10px; border-radius: 10px; border:1px solid #e5e7eb; background:#f9fafb; }
        .bubble.out { margin-left: auto; background:#ecfeff; }
        .bubble .meta { color:#6b7280; font-size:12px; margin-top:4px; }
        .emptyMain { padding: 16px; color:#6b7280; }
        .err { margin: 12px; padding: 10px; background:#fef2f2; border:1px solid #fee2e2; color:#991b1b; border-radius:8px; }
      `}</style>
    </div>
  );
}

function SendBar({ onSend }: { onSend: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, padding:12, borderTop:"1px solid #e5e7eb" }}>
      <input
        className="text"
        placeholder="Send a message…"
        value={v}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { onSend(v); setV(""); } }}
      />
      <button className="btn" onClick={() => { onSend(v); setV(""); }}>Send</button>
    </div>
  );
}

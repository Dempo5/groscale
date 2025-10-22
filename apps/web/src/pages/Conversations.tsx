// apps/web/src/pages/Conversations.tsx
import { useEffect, useMemo, useState } from "react";
import {
  listThreads,
  getThread,
  getThreadMessages,
  sendMessage,
  startThread,
  type Thread,
  type MessageDTO,
} from "../lib/api";

export default function Conversations() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composer, setComposer] = useState("");

  const [newTo, setNewTo] = useState("");       // E.164 phone
  const [newName, setNewName] = useState("");   // optional lead name
  const [newBody, setNewBody] = useState("");   // optional first msg
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // initial load
  useEffect(() => {
    (async () => {
      try {
        const t = await listThreads();
        setThreads(t);
        if (t.length) {
          setActiveId(t[0].id);
        }
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    })();
  }, []);

  // load a thread when activeId changes
  useEffect(() => {
    if (!activeId) {
      setActiveThread(null);
      setMessages([]);
      return;
    }
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const { thread, messages } = await getThread(activeId);
        setActiveThread(thread);
        setMessages(messages);
      } catch {
        // fallback for servers that only implement /api/messages/:id -> messages[]
        try {
          const msgs = await getThreadMessages(activeId);
          const meta = threads.find(t => t.id === activeId) || null;
          setActiveThread(meta);
          setMessages(msgs);
        } catch (e: any) {
          setErr(String(e?.message || e));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [activeId]); // eslint-disable-line

  const activeTitle = useMemo(() => {
    if (!activeThread) return "Pick a conversation";
    return (
      activeThread.leadName ||
      activeThread.leadPhone ||
      activeThread.leadEmail ||
      "Conversation"
    );
  }, [activeThread]);

  async function onSend() {
    if (!composer.trim() || !activeId) return;
    setSending(true);
    setErr(null);
    try {
      const res = await sendMessage({ threadId: activeId, body: composer.trim() });
      if (res?.message) {
        setMessages(m => [...m, res.message!]);
      } else {
        // optimistic append if server doesn't echo message back
        setMessages(m => [
          ...m,
          {
            id: crypto.randomUUID(),
            threadId: activeId,
            direction: "OUTBOUND",
            body: composer.trim(),
            status: "QUEUED",
            createdAt: new Date().toISOString(),
          } as MessageDTO,
        ]);
      }
      setComposer("");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setSending(false);
    }
  }

  async function onCreateThread() {
    if (!newTo.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      const { ok, thread, message, error } = await startThread({
        phone: newTo.trim(),
        name: newName.trim() || undefined,
        body: newBody.trim() || undefined,
      });
      if (!ok || !thread) throw new Error(error || "Failed to start thread");

      // put on top and select
      setThreads(prev => {
        const next = [thread, ...prev.filter(t => t.id !== thread.id)];
        return next;
      });
      setActiveId(thread.id);
      if (message) setMessages([message]);
      setNewTo(""); setNewName(""); setNewBody("");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-conv">
      <aside className="col list">
        <div className="list-h">Conversations</div>

        <div className="new">
          <input
            className="text"
            placeholder="+15551234567"
            value={newTo}
            onChange={e => setNewTo(e.target.value)}
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
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
          />
          <button className="btn" onClick={onCreateThread} disabled={creating || !newTo.trim()}>
            {creating ? "Starting…" : "New"}
          </button>
        </div>

        <div className="items">
          {threads.length === 0 && <div className="empty">No conversations yet.</div>}
          {threads.map(t => (
            <button
              key={t.id}
              className={`row ${activeId === t.id ? "active" : ""}`}
              onClick={() => setActiveId(t.id)}
              title={t.leadPhone || t.leadEmail || ""}
            >
              <div className="name">{t.leadName || t.leadPhone || t.leadEmail || "Conversation"}</div>
              <div className="sub">
                {new Date(t.lastMessageAt).toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="col pane">
        <div className="pane-h">{activeTitle}</div>

        {!activeThread && (
          <div className="placeholder">
            Messages will appear here once you start texting.
          </div>
        )}

        {activeThread && (
          <>
            <div className="msgs">
              {loading && <div className="loading">Loading…</div>}
              {!loading && messages.map(m => (
                <div key={m.id} className={`msg ${m.direction === "OUTBOUND" ? "out" : "in"}`}>
                  <div className="bubble">
                    <div className="body">{m.body}</div>
                    <div className="meta">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} • {m.status || ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="composer">
              <input
                className="text"
                placeholder="Send a message…"
                value={composer}
                onChange={e => setComposer(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onSend(); }}
              />
              <button className="btn" onClick={onSend} disabled={sending || !composer.trim()}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}

        {err && <div className="err">{err}</div>}
      </main>

      <style>{`
        .p-conv{display:grid;grid-template-columns:320px 1fr;gap:12px;padding:12px;height:calc(100vh - 56px)}
        .col{background:#fff;border:1px solid #e5e7eb;border-radius:12px;display:flex;flex-direction:column;overflow:hidden}
        .list-h,.pane-h{padding:10px 12px;font-weight:700;border-bottom:1px solid #e5e7eb;background:#f8fafc}
        .new{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;border-bottom:1px solid #e5e7eb}
        .new .text{grid-column:span 2}
        .items{overflow:auto}
        .row{width:100%;text-align:left;border:0;border-bottom:1px solid #f1f5f9;background:#fff;padding:10px;cursor:pointer}
        .row:hover{background:#f8fafc}
        .row.active{background:#ecfeff}
        .name{font-weight:600}
        .sub{font-size:12px;color:#6b7280}
        .pane{display:flex;flex-direction:column}
        .placeholder{margin:24px;color:#6b7280}
        .msgs{flex:1;overflow:auto;padding:14px;display:grid;gap:10px;background:#f9fafb}
        .msg{display:flex}
        .msg.out{justify-content:flex-end}
        .bubble{max-width:min(75%,720px);background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:8px 10px}
        .msg.out .bubble{background:#ecfeff;border-color:#bae6fd}
        .body{white-space:pre-wrap}
        .meta{font-size:11px;color:#6b7280;margin-top:4px}
        .composer{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb}
        .text{flex:1;height:36px;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px}
        .btn{height:36px;border:0;background:#10b981;color:#fff;border-radius:8px;padding:0 12px;cursor:pointer}
        .loading{color:#6b7280}
        .err{margin:10px;color:#991b1b;background:#fee2e2;border:1px solid #fecaca;padding:8px;border-radius:8px}
      `}</style>
    </div>
  );
}

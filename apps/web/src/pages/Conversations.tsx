import { useEffect, useMemo, useState } from "react";
import { listThreads, getThreadForLead, sendMessage } from "../lib/api";

type Thread = {
  id: string;
  lastMessageAt: string;
  lead: { id: string; name: string; email?: string; phone?: string };
  messages?: Array<{ id: string; body: string; direction: "INBOUND" | "OUTBOUND"; createdAt: string }>;
};

export default function Conversations() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Thread["messages"]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  // load list
  useEffect(() => {
    (async () => {
      const res = await listThreads();
      setThreads(res.threads || []);
      if (!activeLeadId && res.threads?.[0]?.lead?.id) {
        setActiveLeadId(res.threads[0].lead.id);
      }
    })();
  }, []);

  // load a thread’s messages when lead changes
  useEffect(() => {
    if (!activeLeadId) return;
    (async () => {
      const res = await getThreadForLead(activeLeadId);
      setMsgs(res.thread?.messages || []);
    })();
  }, [activeLeadId]);

  const activeLead = useMemo(
    () => threads.find(t => t.lead.id === activeLeadId)?.lead || null,
    [threads, activeLeadId]
  );

  async function onSend() {
    if (!activeLeadId || !draft.trim()) return;
    setLoading(true);
    try {
      await sendMessage(activeLeadId, draft.trim());
      setDraft("");
      // refresh thread
      const res = await getThreadForLead(activeLeadId);
      setMsgs(res.thread?.messages || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="conv">
      <aside className="list">
        <div className="h">Conversations</div>
        {threads.map(t => (
          <button
            key={t.id}
            className={`row ${t.lead.id === activeLeadId ? "active" : ""}`}
            onClick={() => setActiveLeadId(t.lead.id)}
          >
            <div className="name">{t.lead.name}</div>
            <div className="sub">{t.lead.phone || t.lead.email}</div>
          </button>
        ))}
        {!threads.length && <div className="empty">No conversations yet.</div>}
      </aside>

      <main className="room">
        {activeLead ? (
          <>
            <div className="hdr">
              <div className="title">{activeLead.name}</div>
              <div className="meta">{activeLead.phone || activeLead.email}</div>
            </div>

            <div className="msgs">
              {(msgs || []).map(m => (
                <div key={m.id} className={`msg ${m.direction === "OUTBOUND" ? "out" : "in"}`}>
                  <div className="bubble">{m.body}</div>
                  <div className="time">{new Date(m.createdAt).toLocaleTimeString()}</div>
                </div>
              ))}
              {!msgs?.length && <div className="empty mid">No messages yet.</div>}
            </div>

            <div className="composer">
              <input
                className="input"
                placeholder="Send a message…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") onSend(); }}
              />
              <button className="send" disabled={loading || !draft.trim()} onClick={onSend}>
                {loading ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        ) : (
          <div className="empty mid">Pick a conversation</div>
        )}
      </main>

      <style>{`
        .conv{display:grid;grid-template-columns:320px 1fr;height:calc(100vh - 90px);gap:12px;padding:12px}
        .list{border:1px solid #e5e7eb;border-radius:12px;overflow:auto}
        .h{padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb}
        .row{display:block;width:100%;text-align:left;border:0;background:none;padding:10px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer}
        .row.active{background:#eefaf6}
        .name{font-weight:700}
        .sub{font-size:12px;color:#6b7280}
        .room{border:1px solid #e5e7eb;border-radius:12px;display:grid;grid-template-rows:auto 1fr auto;min-width:0}
        .hdr{padding:12px;border-bottom:1px solid #e5e7eb}
        .title{font-weight:800}
        .meta{font-size:12px;color:#6b7280}
        .msgs{padding:12px;overflow:auto;display:grid;gap:10px;align-content:start}
        .msg{display:grid;justify-content:start}
        .msg.out{justify-content:end}
        .bubble{max-width:60ch;padding:10px 12px;border-radius:12px;background:#f3f4f6}
        .msg.out .bubble{background:#10b981;color:#fff}
        .time{font-size:11px;color:#6b7280;margin-top:2px;justify-self:end}
        .composer{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb}
        .input{flex:1;border:1px solid #e5e7eb;border-radius:10px;height:38px;padding:0 12px}
        .send{background:#10b981;color:#fff;border:0;border-radius:10px;padding:0 14px;min-width:88px}
        .empty{color:#6b7280;padding:12px}
        .empty.mid{display:grid;place-items:center;color:#9ca3af}
      `}</style>
    </div>
  );
}

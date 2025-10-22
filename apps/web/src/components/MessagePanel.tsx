import { useEffect, useRef, useState } from "react";
import { MessageDTO, getThreadMessages, sendMessageToThread } from "../lib/api";

export default function MessagePanel({ threadId }: { threadId?: string | null }) {
  const [msgs, setMsgs] = useState<MessageDTO[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  async function load() {
    if (!threadId) return setMsgs([]);
    try { setMsgs(await getThreadMessages(threadId)); } catch { /* noop */ }
  }

  useEffect(() => {
    void load();
    // simple polling so the pane refreshes while you test
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(load, 4000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function send() {
    if (!threadId || !text.trim()) return;
    setLoading(true);
    try {
      // optimistic add
      const mine: MessageDTO = {
        id: `tmp_${Date.now()}`,
        threadId,
        direction: "OUTBOUND",
        body: text.trim(),
        status: "QUEUED",
        createdAt: new Date().toISOString(),
      } as any;
      setMsgs((m) => [...m, mine]);
      setText("");
      await sendMessageToThread(threadId, mine.body);
      await load();
    } finally { setLoading(false); }
  }

  if (!threadId) {
    return (
      <div className="messages">
        <div className="bubble">
          Messages will appear here once you start texting.
          <div className="stamp">Tip: use the “New” box on the left to text your own number.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="thread">
      <div className="messages">
        {msgs.map(m => (
          <div key={m.id} className={`bubble ${m.direction === "OUTBOUND" ? "mine" : ""}`}>
            <div>{m.body}</div>
            <div className="stamp">
              {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              {m.direction === "OUTBOUND" ? ` • ${m.status.toLowerCase()}` : ""}
            </div>
          </div>
        ))}
        {!msgs.length && (
          <div className="bubble">
            No messages yet.
            <div className="stamp">Send one below to get started.</div>
          </div>
        )}
      </div>

      <div className="composer">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message…"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
        />
        <button className="btn-primary" onClick={send} disabled={loading || !text.trim()}>
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

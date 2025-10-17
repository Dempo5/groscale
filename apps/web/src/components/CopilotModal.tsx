import { useState } from "react";
import { copilotDraft } from "../lib/api";

export default function CopilotModal({ open, onClose, onInsert, lastMessage }: {
  open: boolean; onClose: () => void; onInsert: (text: string) => void; lastMessage: string;
}) {
  const [tone, setTone] = useState<"friendly"|"direct"|"formal">("friendly");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");

  async function generate() {
    setLoading(true);
    try {
      const r = await copilotDraft(lastMessage, tone);
      setDraft(r.draft || "");
    } finally { setLoading(false); }
  }

  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.25)", display:"grid", placeItems:"center", zIndex:50 }}>
      <div className="card" style={{ width:560, maxWidth:"90vw", padding:12 }}>
        <div className="card-head">Copilot</div>
        <div style={{ display:"grid", gap:8 }}>
          <label className="hint">Tone</label>
          <select className="input" value={tone} onChange={e => setTone(e.target.value as any)}>
            <option value="friendly">Friendly</option>
            <option value="direct">Direct</option>
            <option value="formal">Formal</option>
          </select>
          <button className="btn" onClick={generate} disabled={loading}>{loading ? "Thinking…" : "Generate reply"}</button>
          <textarea className="input" style={{ minHeight:120 }} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Draft will appear here…" />
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
            <button className="btn-outline" onClick={onClose}>Close</button>
            <button className="btn" disabled={!draft.trim()} onClick={() => { onInsert(draft.trim()); onClose(); }}>Insert</button>
          </div>
        </div>
      </div>
    </div>
  );
}
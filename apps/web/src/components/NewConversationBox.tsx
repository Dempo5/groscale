import { useState } from "react";
import { startThread } from "../lib/api";

export default function NewConversationBox({ onCreated }: { onCreated: (threadId: string) => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [first, setFirst] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    const p = phone.replace(/[^\d+]/g, "");
    if (!p) return setErr("Enter a phone number.");
    setBusy(true);
    try {
      const res = await startThread({ phone: p, name: name || undefined, firstMessage: first || undefined });
      if ((res as any)?.thread?.id) onCreated(res.thread.id);
      setPhone(""); setName(""); setFirst("");
    } catch (e: any) {
      setErr(String(e?.message || "Failed"));
    } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: "8px 10px", display: "grid", gap: 6 }}>
      <input className="input" placeholder="+15551234567" value={phone} onChange={(e)=>setPhone(e.target.value)} />
      <input className="input" placeholder="Name (optional)" value={name} onChange={(e)=>setName(e.target.value)} />
      <input className="input" placeholder="First message (optional)" value={first} onChange={(e)=>setFirst(e.target.value)} />
      {err && <div className="label" style={{ color: "crimson" }}>{err}</div>}
      <button className="btn-outline" onClick={create} disabled={busy}>{busy ? "Starting…" : "New"}</button>
    </div>
  );
}

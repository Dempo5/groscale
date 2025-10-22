// apps/web/src/components/NewConversationBox.tsx
import { useEffect, useState } from "react";
import { listWorkflows, startThread, type Workflow } from "../lib/api";

type Props = {
  onCreated: (threadId: string) => void;
  onCancel?: () => void;
};

export default function NewConversationBox({ onCreated, onCancel }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [workflowId, setWorkflowId] = useState<string>("");
  const [wfs, setWfs] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listWorkflows();
        if (alive) setWfs(data || []);
      } catch {
        if (alive) setWfs([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function create() {
    setErr(null);
    if (!phone.trim()) {
      setErr("Phone is required");
      return;
    }
    setBusy(true);
    try {
      const res = await startThread({
        phone: phone.trim(),
        name: name.trim() || undefined,
        workflowId: workflowId || undefined,
      });

      // backends may return {id} or {thread:{id}}; handle both
      const id =
        (res as any)?.id ||
        (res as any)?.threadId ||
        (res as any)?.thread?.id ||
        "";
      if (!id) throw new Error("Start API returned no id");
      onCreated(id);
      setPhone("");
      setName("");
      setWorkflowId("");
    } catch (e: any) {
      setErr(e?.message || "Failed to start conversation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 8 }}>
      <input
        className="input"
        placeholder="Phone (ex: +15551234567)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <input
        className="input"
        placeholder="Name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <select
        className="input"
        value={workflowId}
        onChange={(e) => setWorkflowId(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      >
        <option value="">(none)</option>
        {wfs.map((w) => (
          <option value={w.id} key={w.id}>
            {w.name}
          </option>
        ))}
      </select>

      {err && (
        <div
          style={{
            color: "#b91c1c",
            fontSize: 12,
            marginBottom: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn-primary" onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </button>
        <button className="btn-outline" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

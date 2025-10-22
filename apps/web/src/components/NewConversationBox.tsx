import { useEffect, useMemo, useState } from "react";
import { listWorkflows, startThread, Workflow } from "../lib/api";

type Props = {
  onCreated: (threadId: string) => void;
};

export default function NewConversationBox({ onCreated }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [workflowId, setWorkflowId] = useState<string>("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await listWorkflows(); // returns Workflow[]
        setWorkflows(Array.isArray(rows) ? rows : []);
      } catch {
        // ignore
      }
    })();
  }, []);

  const canSubmit = useMemo(() => {
    return /\d/.test(phone); // some digits present
  }, [phone]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload: { phone: string; name?: string; workflowId?: string } = {
        phone: phone.replace(/\D/g, ""),
      };
      if (name.trim()) payload.name = name.trim();
      if (workflowId) payload.workflowId = workflowId;

      const res = await startThread(payload);
      // Accept several shapes: {threadId}, {id}, {thread:{id}}
      const threadId =
        (res as any)?.threadId || (res as any)?.id || (res as any)?.thread?.id;
      if (!threadId) throw new Error("No thread id returned");

      // clear inputs and bubble up
      setPhone("");
      setName("");
      setWorkflowId("");
      onCreated(String(threadId));
    } catch (err: any) {
      setError(err?.message || "Failed to start conversation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="p-2" style={{ display: "grid", gap: 6 }}>
      <input
        className="input"
        placeholder="Phone (e.g. +15551234567)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className="input"
        placeholder="Name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {/* Workflow dropdown (optional) */}
      <select
        className="input"
        value={workflowId}
        onChange={(e) => setWorkflowId(e.target.value)}
        title="Workflow to start for this contact (optional)"
      >
        <option value="">(no workflow)</option>
        {workflows.map((wf) => (
          <option key={wf.id} value={wf.id}>
            {wf.name}
          </option>
        ))}
      </select>

      {error && (
        <div style={{ color: "#b91c1c", fontSize: 12, padding: "2px 0" }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary"
        disabled={!canSubmit || submitting}
      >
        {submitting ? "Creating..." : "New"}
      </button>
    </form>
  );
}

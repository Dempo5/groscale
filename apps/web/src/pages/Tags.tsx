import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Tag = { id: string; name: string; color?: string | null; workflowId?: string | null };
type Workflow = { id: string; name: string };

export default function TagsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/tags?q=${encodeURIComponent(q)}`, { credentials: "include" });
    if (res.ok) setTags(await res.json());
  }
  useEffect(() => { load(); }, [q]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/workflows", { credentials: "include" });
      if (res.ok) setWorkflows(await res.json());
    })();
  }, []);

  const onSave = async () => {
    if (!editing) return;
    setBusy(true); setErr(null);
    try {
      const method = editing.id ? "PATCH" : "POST";
      const url = editing.id ? `/api/tags/${editing.id}` : `/api/tags`;
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, color: editing.color, workflowId: editing.workflowId || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditing(null);
      await load();
    } catch (e: any) { setErr(e?.message || "Save failed"); }
    finally { setBusy(false); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this tag?")) return;
    await fetch(`/api/tags/${id}`, { method: "DELETE", credentials: "include" });
    if (editing?.id === id) setEditing(null);
    await load();
  };

  const list = useMemo(() => tags.sort((a, b) => a.name.localeCompare(b.name)), [tags]);

  return (
    <div className="p">
      <div className="crumbs"><button className="link" onClick={() => nav("/dashboard")}>← Dashboard</button><span>› Tags</span></div>
      <div className="grid">
        <aside className="pane">
          <div className="pane-h">
            <input className="inp" placeholder="Search tags…" value={q} onChange={e => setQ(e.target.value)} />
            <button className="btn" onClick={() => setEditing({ id: "", name: "", color: "", workflowId: "" })}>+ New</button>
          </div>
          <div className="list">
            {list.map(t => (
              <button key={t.id} className={`row ${editing?.id === t.id ? "sel" : ""}`} onClick={() => setEditing(t)}>
                <span className="dot" style={{ background: t.color || "#d1d5db" }} />
                <span className="name">{t.name}</span>
                {t.workflowId && <span className="chip">wf</span>}
              </button>
            ))}
            {!list.length && <div className="empty">No tags.</div>}
          </div>
        </aside>

        <section className="editor">
          {!editing ? (
            <div className="placeholder">Select or create a tag.</div>
          ) : (
            <div className="card">
              <div className="card-h">Tag</div>
              <div className="form">
                <label>Name<input className="inp" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
                <label>Color<input className="inp" placeholder="#10B981" value={editing.color || ""} onChange={e => setEditing({ ...editing, color: e.target.value })} /></label>
                <label>Workflow
                  <select className="inp" value={editing.workflowId || ""} onChange={e => setEditing({ ...editing, workflowId: e.target.value || null })}>
                    <option value="">(none)</option>
                    {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </label>

                {err && <div className="err">{err}</div>}
                <div className="actions">
                  {editing.id && <button className="btn ghost" onClick={() => onDelete(editing.id!)}>Delete</button>}
                  <div style={{ flex: 1 }} />
                  <button className="btn ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
                  <button className="btn" onClick={onSave} disabled={!editing.name.trim() || busy}>{busy ? "Saving…" : "Save"}</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
.p{padding:14px}
.link{background:none;border:0;color:var(--accent,#10b981);cursor:pointer}
.grid{display:grid;grid-template-columns:320px 1fr;gap:14px}
.pane{border:1px solid #e5e7eb;border-radius:12px;display:grid;grid-template-rows:auto 1fr;overflow:hidden}
.pane-h{display:flex;gap:8px;padding:10px;border-bottom:1px solid #e5e7eb}
.inp{border:1px solid #e5e7eb;border-radius:8px;height:36px;padding:0 10px;width:100%}
.btn{background:var(--accent,#10b981);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
.btn.ghost{background:#fff;color:#374151;border:1px solid #e5e7eb}
.list{overflow:auto}
.row{display:flex;gap:8px;align-items:center;width:100%;text-align:left;border:0;background:#fff;padding:10px;border-bottom:1px solid #f3f4f6;cursor:pointer}
.row.sel{background:#f0fdf4}
.dot{width:10px;height:10px;border-radius:50%}
.name{flex:1}
.chip{font-size:11px;background:#eef2ff;color:#3730a3;padding:2px 6px;border-radius:999px}
.editor{min-height:420px}
.placeholder{display:grid;place-items:center;height:100%;color:#6b7280}
.card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
.card-h{padding:10px;border-bottom:1px solid #e5e7eb;font-weight:700}
.form{display:grid;gap:10px;padding:12px}
.err{background:#fef2f2;border:1px solid #fee2e2;color:#991b1b;padding:8px 10px;border-radius:8px}
.actions{display:flex;gap:8px;margin-top:4px}
`;

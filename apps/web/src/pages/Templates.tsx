import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Tpl = { id: string; name: string; body: string; createdAt: string };

export default function TemplatesPage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Tpl[]>([]);
  const [editing, setEditing] = useState<Tpl | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/templates?q=${encodeURIComponent(q)}`, { credentials: "include" });
    if (res.ok) setList(await res.json());
  }
  useEffect(() => { load(); }, [q]);

  const onSave = async () => {
    if (!editing) return;
    setBusy(true); setErr(null);
    try {
      const method = editing.id ? "PATCH" : "POST";
      const url = editing.id ? `/api/templates/${editing.id}` : `/api/templates`;
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, body: editing.body }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditing(null);
      await load();
    } catch (e: any) { setErr(e?.message || "Save failed"); }
    finally { setBusy(false); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE", credentials: "include" });
    if (editing?.id === id) setEditing(null);
    await load();
  };

  const sorted = useMemo(() => list.slice().sort((a,b)=>a.name.localeCompare(b.name)), [list]);

  return (
    <div className="p">
      <div className="crumbs"><button className="link" onClick={()=>nav("/dashboard")}>← Dashboard</button><span>› Templates</span></div>
      <div className="grid">
        <aside className="pane">
          <div className="pane-h">
            <input className="inp" placeholder="Search templates…" value={q} onChange={e=>setQ(e.target.value)} />
            <button className="btn" onClick={()=>setEditing({ id:"", name:"", body:"", createdAt:new Date().toISOString() })}>+ New</button>
          </div>
          <div className="list">
            {sorted.map(t => (
              <button key={t.id} className={`row ${editing?.id===t.id?"sel":""}`} onClick={()=>setEditing(t)}>
                <span className="name">{t.name}</span>
                <span className="meta">{new Date(t.createdAt).toLocaleDateString()}</span>
              </button>
            ))}
            {!sorted.length && <div className="empty">No templates.</div>}
          </div>
        </aside>

        <section className="editor">
          {!editing ? (
            <div className="placeholder">Select or create a template.</div>
          ) : (
            <div className="card">
              <div className="card-h">Template</div>
              <div className="form">
                <label>Name<input className="inp" value={editing.name} onChange={e=>setEditing({...editing, name:e.target.value})}/></label>
                <label>Body
                  <textarea className="ta" rows={12} value={editing.body} onChange={e=>setEditing({...editing, body:e.target.value})}
                    placeholder="Hi {{first_name}}, …"/>
                </label>
                <div className="hint">Supports liquid variables: <code>{`{{first_name}}`}</code>, <code>{`{{last_name}}`}</code>, etc.</div>
                {err && <div className="err">{err}</div>}
                <div className="actions">
                  {editing.id && <button className="btn ghost" onClick={()=>onDelete(editing.id!)}>Delete</button>}
                  <div style={{flex:1}}/>
                  <button className="btn ghost" onClick={()=>setEditing(null)} disabled={busy}>Cancel</button>
                  <button className="btn" onClick={onSave} disabled={!editing.name.trim() || !editing.body.trim() || busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
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
.ta{border:1px solid #e5e7eb;border-radius:8px;padding:10px;width:100%;font-family:inherit}
.btn{background:var(--accent,#10b981);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
.btn.ghost{background:#fff;color:#374151;border:1px solid #e5e7eb}
.list{overflow:auto}
.row{display:flex;gap:8px;align-items:center;width:100%;text-align:left;border:0;background:#fff;padding:10px;border-bottom:1px solid #f3f4f6;cursor:pointer}
.row.sel{background:#f0fdf4}
.name{flex:1}
.meta{color:#6b7280;font-size:12px}
.editor{min-height:420px}
.placeholder{display:grid;place-items:center;height:100%;color:#6b7280}
.card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
.card-h{padding:10px;border-bottom:1px solid #e5e7eb;font-weight:700}
.form{display:grid;gap:10px;padding:12px}
.hint{font-size:12px;color:#6b7280}
.err{background:#fef2f2;border:1px solid #fee2e2;color:#991b1b;padding:8px 10px;border-radius:8px}
.actions{display:flex;gap:8px;margin-top:4px}
`;

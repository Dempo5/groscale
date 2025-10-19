import { useEffect, useMemo, useState } from "react";
import { getTags, createTag, updateTag, deleteTag, TagDTO } from "../lib/api";

type WF = { id: string; name: string };
const COLORS = ["#ef4444","#f97316","#f59e0b","#10b981","#14b8a6","#3b82f6","#8b5cf6","#ec4899","#6b7280"];

export default function Tags() {
  const [tags, setTags] = useState<TagDTO[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<TagDTO | null>(null);

  // optional workflows list (if you’ve exposed /api/workflows)
  const [workflows, setWorkflows] = useState<WF[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const [t] = await Promise.all([
          getTags(),
          // quietly fetch workflows; ignore if 404
          fetch("/api/workflows", { credentials: "include" })
            .then(r => r.ok ? r.json() : { ok: false, workflows: [] })
            .then(j => setWorkflows((j?.workflows || []).map((w: any) => ({ id: w.id, name: w.name })) ))
            .catch(() => setWorkflows([])),
        ]);
        setTags(t);
        setSel(t[0] || null);
      } catch (e: any) {
        setError(e?.message || "Failed to load tags/workflows");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(t => t.name.toLowerCase().includes(q));
  }, [tags, query]);

  async function addTag() {
    const name = prompt("New tag name?")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const tag = await createTag({ name, color: COLORS[8] });
      setTags(t => {
        const next = [...t, tag].sort((a,b)=>a.name.localeCompare(b.name));
        if (!sel) setSel(tag);
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Failed to create tag");
    } finally { setBusy(false); }
  }

  async function savePatch(patch: Partial<TagDTO>) {
    if (!sel) return;
    setBusy(true);
    try {
      const updated = await updateTag(sel.id, patch);
      setTags(ts => ts.map(t => (t.id === updated.id ? updated : t)));
      setSel(updated);
    } catch (e: any) {
      setError(e?.message || "Failed to update tag");
    } finally { setBusy(false); }
  }

  async function removeTag(id: string) {
    if (!confirm("Delete this tag? This detaches it from all leads.")) return;
    setBusy(true);
    try {
      await deleteTag(id);
      setTags(ts => ts.filter(t => t.id !== id));
      setSel(s => (s?.id === id ? null : s));
    } catch (e: any) {
      setError(e?.message || "Failed to delete tag");
    } finally { setBusy(false); }
  }

  return (
    <div className="page px">
      <div className="bar">
        <h1>Tags</h1>
        <button className="btn" onClick={addTag} disabled={busy}>+ New tag</button>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="grid">
        <div className="left">
          <div className="search">
            <input placeholder="Search tags…" value={query} onChange={e=>setQuery(e.target.value)} />
          </div>

          <ul className="list">
            {filtered.length === 0 && <li className="empty">No tags</li>}
            {filtered.map(t => (
              <li key={t.id}
                  className={`row ${t.id===sel?.id?"sel":""}`}
                  onClick={()=>setSel(t)}>
                <span className="dot" style={{ background: t.color || "#6b7280" }} />
                <span className="name">{t.name}</span>
                <span className="spacer" />
                <button className="icon" title="Delete" onClick={(e)=>{e.stopPropagation(); removeTag(t.id);}}>🗑️</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="right">
          {!sel && <div className="placeholder">Select a tag to edit its name, color, or attached workflow.</div>}
          {sel && (
            <div className="card">
              <div className="rowf">
                <label>Name</label>
                <input
                  value={sel.name}
                  onChange={e=>setSel({ ...sel, name: e.target.value })}
                  onBlur={()=> sel && sel.name.trim() && savePatch({ name: sel.name.trim() })}
                />
              </div>

              <div className="rowf">
                <label>Color</label>
                <div className="swatches">
                  {COLORS.map(c=>(
                    <button key={c}
                      className={`sw ${sel.color===c?"on":""}`}
                      style={{ background:c }}
                      onClick={()=>savePatch({ color: c })} />
                  ))}
                </div>
              </div>

              <div className="rowf">
                <label>Workflow (optional)</label>
                <select
                  value={sel.workflowId || ""}
                  onChange={e=>savePatch({ workflowId: e.target.value || null })}
                >
                  <option value="">(none)</option>
                  {workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <div className="hint">Leads tagged with <b>{sel.name}</b> can automatically start this workflow.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .page.px{padding:14px}
        .bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
        h1{font-weight:800;margin:0}
        .btn{background:var(--accent,#10b981);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
        .err{background:#fee2e2;border:1px solid #fecaca;color:#991b1b;padding:8px 10px;border-radius:8px;margin-bottom:10px}

        .grid{display:grid;grid-template-columns: 320px 1fr; gap:14px}
        .left{border:1px solid #e5e7eb;border-radius:12px;background:#fff;display:grid;grid-template-rows:auto 1fr}
        .search{padding:8px;border-bottom:1px solid #e5e7eb}
        .search input{width:100%;height:36px;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px}
        .list{list-style:none;margin:0;padding:6px;overflow:auto;max-height:64vh}
        .row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer}
        .row:hover{background:#f9fafb}
        .row.sel{background:#f0fdf4}
        .dot{width:10px;height:10px;border-radius:999px;display:inline-block}
        .name{font-weight:600}
        .spacer{flex:1}
        .icon{background:none;border:0;opacity:.7;cursor:pointer}
        .icon:hover{opacity:1}
        .empty{padding:10px;color:#6b7280}

        .right{min-height:280px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:12px}
        .placeholder{color:#6b7280;padding:10px}
        .card{display:grid;gap:12px}
        .rowf{display:grid;gap:6px}
        .rowf input, .rowf select{height:36px;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px}
        .swatches{display:flex;flex-wrap:wrap;gap:8px}
        .sw{width:26px;height:26px;border-radius:999px;border:2px solid #fff;box-shadow:0 0 0 1px #e5e7eb inset;cursor:pointer}
        .sw.on{box-shadow:0 0 0 2px #10b981}
        .hint{font-size:12px;color:#6b7280}
      `}</style>
    </div>
  );
}

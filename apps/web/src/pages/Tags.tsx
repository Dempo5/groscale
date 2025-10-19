// apps/webapp/src/pages/Tags.tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type Tag = { id: string; name: string; color?: string | null; workflowId?: string | null };
type Workflow = { id: string; name: string };

export default function Tags() {
  const [params] = useSearchParams();
  const highlightId = params.get("highlight");

  const [tags, setTags] = useState<Tag[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Tag | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tRes, wRes] = await Promise.all([
          fetch("/api/tags", { credentials: "include" }),
          fetch("/api/workflows", { credentials: "include" }),
        ]);
        if (tRes.ok) setTags(await tRes.json());
        if (wRes.ok) setWorkflows(await wRes.json());
      } catch (e) {
        setErr("Failed to load tags/workflows");
      }
    })();
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    const t = tags.find(x => x.id === highlightId);
    if (t) setEditing(t);
  }, [highlightId, tags]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return tags;
    return tags.filter(t => t.name.toLowerCase().includes(f));
  }, [tags, filter]);

  async function createTag() {
    const name = prompt("New tag name?");
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await res.text());
      const t = await res.json();
      setTags(s => [t, ...s]);
      setEditing(t);
    } catch (e: any) {
      setErr(e.message || "Failed to create tag");
    } finally {
      setBusy(false);
    }
  }

  async function saveTag(next: Tag) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(next.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next.name, color: next.color, workflowId: next.workflowId || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTags(s => s.map(t => (t.id === next.id ? next : t)));
      setEditing(next);
    } catch (e: any) {
      setErr(e.message || "Failed to save tag");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTag(id: string) {
    if (!confirm("Delete this tag?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setTags(s => s.filter(t => t.id !== id));
      setEditing(null);
    } catch (e: any) {
      setErr(e.message || "Failed to delete tag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page tags">
      <div className="header">
        <h1>Tags</h1>
        <div className="spacer" />
        <button className="btn" onClick={createTag} disabled={busy}>+ New tag</button>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="grid">
        <aside className="list">
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search tags…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>

          <div className="rows">
            {shown.map(t => (
              <button
                key={t.id}
                className={`row ${editing?.id === t.id ? "sel" : ""} ${t.id === highlightId ? "hl" : ""}`}
                onClick={() => setEditing(t)}
              >
                <span className="dot" style={{ background: t.color || "#d1d5db" }} />
                <span className="name">{t.name}</span>
                {t.workflowId && <span className="chip">wf</span>}
              </button>
            ))}
            {!shown.length && <div className="empty">No tags</div>}
          </div>
        </aside>

        <section className="editor">
          {!editing ? (
            <div className="hint">Select a tag to edit its name, color, or attached workflow.</div>
          ) : (
            <TagEditor tag={editing} workflows={workflows} onChange={saveTag} onDelete={deleteTag} busy={busy} />
          )}
        </section>
      </div>

      <style>{`
        .page.tags { padding: 16px; }
        .header { display:flex; align-items:center; gap:12px; }
        .spacer { flex:1 }
        .btn { background: var(--accent,#10b981); color:#fff; border:0; border-radius:10px; padding:8px 12px; cursor:pointer }
        .grid { display:grid; grid-template-columns: 320px 1fr; gap:16px; margin-top:12px }
        .list { border:1px solid #e5e7eb; border-radius:12px; background:#fff; overflow:hidden }
        .toolbar { padding:10px; border-bottom:1px solid #e5e7eb }
        .search { width:100%; height:36px; border:1px solid #e5e7eb; border-radius:8px; padding:0 10px }
        .rows { max-height:60vh; overflow:auto }
        .row { width:100%; display:flex; align-items:center; gap:8px; padding:10px; background:#fff; border:0; text-align:left; cursor:pointer; border-bottom:1px solid #f3f4f6 }
        .row.sel { background:#f9fafb }
        .row.hl { outline:2px solid #10b981; background:#ecfdf5 }
        .dot { width:10px; height:10px; border-radius:50% }
        .chip { margin-left:auto; font-size:11px; padding:2px 6px; border-radius:999px; background:#eef2ff; color:#3730a3 }
        .editor { border:1px solid #e5e7eb; border-radius:12px; background:#fff; padding:12px }
        .err { background:#fef2f2; border:1px solid #fee2e2; color:#991b1b; padding:8px 10px; border-radius:8px; margin-top:10px }
      `}</style>
    </div>
  );
}

function TagEditor({
  tag, workflows, onChange, onDelete, busy
}: {
  tag: Tag; workflows: Workflow[];
  onChange: (t: Tag) => void; onDelete: (id: string) => void; busy: boolean;
}) {
  const [draft, setDraft] = useState<Tag>(tag);
  useEffect(() => setDraft(tag), [tag]);

  return (
    <div className="editor-inner">
      <div className="row">
        <label>Name</label>
        <input
          className="input"
          value={draft.name}
          onChange={e => setDraft({ ...draft, name: e.target.value })}
        />
      </div>
      <div className="row">
        <label>Color</label>
        <input
          className="input"
          type="color"
          value={draft.color || "#10b981"}
          onChange={e => setDraft({ ...draft, color: e.target.value })}
        />
      </div>
      <div className="row">
        <label>Workflow</label>
        <select
          className="input"
          value={draft.workflowId || ""}
          onChange={e => setDraft({ ...draft, workflowId: e.target.value || null })}
        >
          <option value="">(none)</option>
          {workflows.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div className="actions">
        <button className="btn danger" onClick={() => onDelete(tag.id)} disabled={busy}>Delete</button>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => setDraft(tag)} disabled={busy}>Reset</button>
        <button className="btn" onClick={() => onChange(draft)} disabled={busy}>Save</button>
      </div>

      <style>{`
        .editor-inner { display:grid; gap:10px }
        .row { display:grid; grid-template-columns: 120px 1fr; align-items:center; gap:10px }
        .input { height:36px; border:1px solid #e5e7eb; border-radius:8px; padding:0 10px }
        .actions { display:flex; align-items:center; gap:8px; margin-top:8px }
        .btn { background: var(--accent,#10b981); color:#fff; border:0; border-radius:10px; padding:8px 12px; cursor:pointer }
        .btn.ghost { background:#fff; color:#374151; border:1px solid #e5e7eb }
        .btn.danger { background:#ef4444 }
      `}</style>
    </div>
  );
}

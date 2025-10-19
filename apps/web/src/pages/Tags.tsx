import { useEffect, useMemo, useState } from "react";
import { listWorkflows } from "../lib/api";
import {
  createTag,
  deleteTag,
  getTags,
  TagDTO,
  updateTag,
} from "../lib/api";

const COLORS = [
  "#ef4444","#f97316","#f59e0b","#10b981","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#6b7280","#111827",
];

export default function Tags() {
  const [tags, setTags] = useState<TagDTO[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<TagDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [wf, setWf] = useState<{id:string; name:string}[]>([]);

  // right editor inputs (decoupled from sel for safe editing)
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rows, wfs] = await Promise.all([
          getTags(),
          listWorkflows().catch(() => []),
        ]);
        setTags(rows);
        setWf(wfs.map((w) => ({ id: w.id, name: w.name })));
        if (rows.length && !sel) select(rows[0]);
      } catch (e: any) {
        setErr(e?.message || "Failed to load tags/workflows");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(qq));
  }, [tags, q]);

  function select(t: TagDTO) {
    setSel(t);
    setName(t.name);
    setColor(t.color ?? null);
    setWorkflowId(t.workflowId ?? null);
  }

  async function handleCreate() {
    const nm = prompt("New tag name?")?.trim();
    if (!nm) return;
    setBusy(true);
    setErr(null);
    try {
      const t = await createTag({ name: nm, color: null, workflowId: null });
      setTags((cur) => [t, ...cur].sort((a, b) => a.name.localeCompare(b.name)));
      select(t);
    } catch (e: any) {
      setErr(e?.message || "Failed to create tag");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!sel) return;
    if (!name.trim()) return setErr("Name is required.");
    setBusy(true); setErr(null);
    try {
      const t = await updateTag(sel.id, { name: name.trim(), color, workflowId });
      setTags((cur) => cur.map((x) => (x.id === t.id ? t : x)).sort((a,b)=>a.name.localeCompare(b.name)));
      select(t);
    } catch (e: any) {
      setErr(e?.message || "Failed to save changes");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!sel) return;
    if (!confirm(`Delete tag “${sel.name}”?`)) return;
    setBusy(true); setErr(null);
    try {
      await deleteTag(sel.id);
      setTags((cur) => cur.filter((x) => x.id !== sel.id));
      const next = filtered[0] || tags[0] || null;
      next ? select(next) : setSel(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to delete tag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tags-page">
      <div className="head">
        <div className="title">Tags</div>
        <button className="btn" disabled={busy} onClick={handleCreate}>+ New tag</button>
      </div>

      {err && <div className="inline-err">⚠️ {err}</div>}

      <div className="grid">
        {/* LIST */}
        <aside className="list">
          <div className="search">
            <input
              placeholder="Search tags…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="rows">
            {!filtered.length && <li className="empty">No tags</li>}
            {filtered.map((t) => (
              <li
                key={t.id}
                className={`row ${sel?.id === t.id ? "selected" : ""}`}
                onClick={() => select(t)}
              >
                <span className="dot" style={{ background: t.color || "#e5e7eb" }} />
                <span className="name">{t.name}</span>
              </li>
            ))}
          </ul>
        </aside>

        {/* EDITOR */}
        <section className="editor">
          {!sel ? (
            <div className="emptystate">Select a tag to edit its name, color, or attached workflow.</div>
          ) : (
            <>
              <div className="card">
                <div className="label">Name</div>
                <input
                  className="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tag name"
                />
              </div>

              <div className="card">
                <div className="label">Color</div>
                <div className="palette">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`swatch ${color === c ? "on" : ""}`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                      title={c}
                    />
                  ))}
                  <button
                    className={`swatch none ${color == null ? "on" : ""}`}
                    onClick={() => setColor(null)}
                    title="No color"
                  >
                    <span className="slash" />
                  </button>
                </div>
                <div className="preview">
                  <span className="pill" style={{ background: color || "#e5e7eb", color: color ? "#fff" : "#374151" }}>
                    {name || "Tag Preview"}
                  </span>
                </div>
              </div>

              <div className="card">
                <div className="label">Workflow (optional)</div>
                <select
                  className="select"
                  value={workflowId || ""}
                  onChange={(e) => setWorkflowId(e.target.value || null)}
                >
                  <option value="">(none)</option>
                  {wf.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <div className="hint">
                  When attached, any lead tagged with <b>{name || "this tag"}</b> can auto-start the selected workflow.
                </div>
              </div>

              <div className="actions">
                <button className="btn ghost" disabled={busy} onClick={handleDelete}>Delete</button>
                <div className="spacer" />
                <button className="btn" disabled={busy} onClick={handleSave}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* styles */}
      <style>{`
        .tags-page{padding:16px;}
        .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .title{font-weight:800}
        .btn{background:var(--accent,#10b981);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
        .btn.ghost{background:#fff;color:#374151;border:1px solid #e5e7eb}
        .inline-err{margin:8px 0;padding:10px 12px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:10px}

        .grid{display:grid;grid-template-columns: 300px 1fr; gap:16px;}
        .list{border:1px solid #e5e7eb;border-radius:12px;background:#fff;display:flex;flex-direction:column;height:540px;overflow:hidden}
        .search{padding:10px;border-bottom:1px solid #e5e7eb}
        .search input{width:100%;height:36px;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px}
        .rows{list-style:none;margin:0;padding:0;overflow:auto}
        .row{display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid #f3f4f6;cursor:pointer}
        .row:hover{background:#f9fafb}
        .row.selected{background:#f0fdf4}
        .row .dot{width:10px;height:10px;border-radius:999px;display:inline-block;border:1px solid #e5e7eb}
        .row .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .empty{padding:16px;color:#6b7280}

        .editor{display:grid;gap:12px;min-height:540px}
        .emptystate{border:1px dashed #e5e7eb;border-radius:12px;padding:18px;color:#6b7280;display:grid;place-items:center}
        .card{border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:12px}
        .label{font-weight:700;margin-bottom:8px}
        .text,.select{width:100%;height:36px;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px}
        .palette{display:flex;gap:8px;flex-wrap:wrap}
        .swatch{width:28px;height:28px;border-radius:999px;border:2px solid transparent;cursor:pointer}
        .swatch.on{box-shadow:0 0 0 2px #fff, 0 0 0 4px rgba(16,185,129,.6)}
        .swatch.none{background:#fff;border:1px dashed #d1d5db;position:relative}
        .slash{position:absolute;inset:0;display:block;background:linear-gradient(45deg, transparent 47%, #d1d5db 47%, #d1d5db 53%, transparent 53%)}
        .preview{margin-top:10px}
        .pill{display:inline-block;padding:6px 10px;border-radius:999px;font-size:12px}
        .hint{font-size:12px;color:#6b7280;margin-top:6px}
        .actions{display:flex;align-items:center;gap:12px;margin-top:8px}
        .spacer{flex:1}
      `}</style>
    </div>
  );
}

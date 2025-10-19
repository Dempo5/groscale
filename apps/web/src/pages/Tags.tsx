import { useEffect, useMemo, useState } from "react";
import {
  getTags,
  listTags, // alias; harmless if you keep it
  createTag,
  updateTag,
  deleteTag,
  listWorkflows,
  type Workflow,
  type TagDTO,
  type TagColor,
} from "../lib/api";

/* ---------- palette & helpers ---------- */
const PALETTE: { id: TagColor; swatch: string }[] = [
  { id: "red", swatch: "#ef4444" },
  { id: "orange", swatch: "#f97316" },
  { id: "amber", swatch: "#f59e0b" },
  { id: "green", swatch: "#10b981" },
  { id: "teal", swatch: "#14b8a6" },
  { id: "blue", swatch: "#3b82f6" },
  { id: "indigo", swatch: "#6366f1" },
  { id: "violet", swatch: "#8b5cf6" },
  { id: "pink", swatch: "#ec4899" },
  { id: "gray", swatch: "#6b7280" },
];

function pillStyle(color?: TagColor | null) {
  const hex =
    PALETTE.find((p) => p.id === color)?.swatch ??
    "#cbd5e1"; // slate-300 fallback
  return {
    background: `${hex}20`, // 12.5% opacity bg
    color: hex,
    borderColor: `${hex}55`,
  } as React.CSSProperties;
}

/* ---------- page ---------- */
export default function Tags() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [rows, setRows] = useState<TagDTO[]>([]);
  const [q, setQ] = useState("");

  // creator bar
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor | null>(null);

  // editor panel
  const [sel, setSel] = useState<TagDTO | null>(null);
  const [eName, setEName] = useState("");
  const [eColor, setEColor] = useState<TagColor | null>(null);
  const [eWorkflow, setEWorkflow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* ----- load ----- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [ws, ts] = await Promise.all([listWorkflows(), getTags().catch(() => listTags())]);
        setWorkflows(ws || []);
        setRows(Array.isArray(ts) ? ts : []);
      } catch (e: any) {
        setErr(String(e?.message || e || "Failed to load tags/workflows"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ----- filtered & grouped ----- */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let arr = rows;
    if (term) {
      arr = rows.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          (t.workflowId ? t.workflowId.toLowerCase().includes(term) : false)
      );
    }
    // sort by color then name
    return [...arr].sort((a, b) => {
      const ca = a.color || "";
      const cb = b.color || "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [rows, q]);

  /* ----- select sync ----- */
  useEffect(() => {
    if (!sel) return;
    const fresh = rows.find((r) => r.id === sel.id) || null;
    if (fresh) {
      setSel(fresh);
      setEName(fresh.name || "");
      setEColor((fresh.color as TagColor) ?? null);
      setEWorkflow(fresh.workflowId ?? null);
    } else {
      setSel(null);
      setEName("");
      setEColor(null);
      setEWorkflow(null);
    }
  }, [rows]);

  /* ----- actions ----- */
  async function onCreate() {
    if (!newName.trim()) return;
    setErr(null);
    setSaving(true);
    try {
      const created = await createTag({
        name: newName.trim(),
        color: newColor ?? null,
        workflowId: null,
      });
      setRows((r) => [created, ...r]);
      setNewName("");
      setNewColor(null);
    } catch (e: any) {
      setErr("Failed to create tag");
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    if (!sel) return;
    setSaving(true);
    setErr(null);
    try {
      const updated = await updateTag(sel.id, {
        name: eName.trim() || sel.name,
        color: eColor ?? null,
        workflowId: eWorkflow ?? null,
      });
      setRows((r) => r.map((t) => (t.id === sel.id ? updated : t)));
    } catch (e: any) {
      setErr("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this tag?")) return;
    setErr(null);
    try {
      await deleteTag(id);
      setRows((r) => r.filter((t) => t.id !== id));
      if (sel?.id === id) {
        setSel(null);
        setEName("");
        setEColor(null);
        setEWorkflow(null);
      }
    } catch (e: any) {
      setErr("Failed to delete tag");
    }
  }

  /* ----- UI ----- */
  return (
    <div className="p-tags">
      <header className="page-h">
        <div className="title">Tags</div>
        <div className="sub">Organize contacts and auto-start workflows per tag.</div>
      </header>

      {!!err && <div className="alert error">⚠️ {err}</div>}

      {/* Creator bar */}
      <div className="creator">
        <input
          className="name"
          placeholder="New tag name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
        />
        <div className="colors">
          {PALETTE.map((p) => (
            <button
              key={p.id}
              className={`dot ${newColor === p.id ? "on" : ""}`}
              style={{ background: p.swatch }}
              aria-label={p.id}
              onClick={() => setNewColor((c) => (c === p.id ? null : p.id))}
            />
          ))}
        </div>
        <button className="btn" disabled={!newName.trim() || saving} onClick={onCreate}>
          Add
        </button>
      </div>

      <div className="grid">
        {/* LEFT: search + list */}
        <aside className="left">
          <div className="search">
            <input
              placeholder="Search tags…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="list">
            {loading && <div className="hint">Loading…</div>}
            {!loading && !filtered.length && (
              <div className="hint">No tags</div>
            )}

            {filtered.map((t) => (
              <button
                key={t.id}
                className={`row ${sel?.id === t.id ? "active" : ""}`}
                onClick={() => setSel(t)}
                title={t.name}
              >
                <span className="pill" style={pillStyle(t.color)}>
                  {t.name}
                </span>
                {t.workflowId && <span className="wf">WF</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* RIGHT: editor */}
        <section className="editor">
          {!sel && (
            <div className="editor-empty">
              Select a tag to edit its name, color, or attached workflow.
            </div>
          )}

          {sel && (
            <div className="card">
              <div className="card-h">
                <div className="preview">
                  <span className="pill big" style={pillStyle(eColor)}>
                    {eName.trim() || sel.name}
                  </span>
                </div>
                <button className="trash" onClick={() => onDelete(sel.id)} title="Delete">
                  🗑
                </button>
              </div>

              <div className="form">
                <label>Name</label>
                <input
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                  placeholder="Tag name"
                />

                <label>Color</label>
                <div className="colors lg">
                  {PALETTE.map((p) => (
                    <button
                      key={p.id}
                      className={`dot ${eColor === p.id ? "on" : ""}`}
                      style={{ background: p.swatch }}
                      aria-label={p.id}
                      onClick={() => setEColor((c) => (c === p.id ? null : p.id))}
                    />
                  ))}
                </div>

                <label>Attached workflow</label>
                <select
                  value={eWorkflow ?? ""}
                  onChange={(e) =>
                    setEWorkflow(e.currentTarget.value ? e.currentTarget.value : null)
                  }
                >
                  <option value="">(none)</option>
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>

                <div className="actions">
                  <button
                    className="btn primary"
                    disabled={saving}
                    onClick={onSave}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* scoped styles */}
      <style>{`
        .p-tags { padding: 16px 18px 28px; }
        .page-h { margin-bottom: 10px; }
        .page-h .title { font-weight: 800; font-size: 18px; }
        .page-h .sub { color:#6b7280; font-size:12px; }

        .alert.error { background:#fef2f2; border:1px solid #fee2e2; color:#991b1b; padding:8px 10px; border-radius:10px; margin:10px 0; }

        .creator {
          display:grid; grid-template-columns: 1fr auto auto; gap:10px;
          align-items:center; background:#fff; border:1px solid #e5e7eb;
          border-radius:12px; padding:10px 12px; margin:6px 0 14px;
        }
        .creator .name{ height:36px; border:1px solid #e5e7eb; border-radius:10px; padding:0 10px; }
        .colors{ display:flex; gap:8px; align-items:center; }
        .colors .dot{ width:20px; height:20px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,.08); cursor:pointer; }
        .colors .dot.on{ outline:3px solid rgba(16,185,129,.25); }

        .btn{ background:#111827; color:#fff; border:0; height:36px; padding:0 12px; border-radius:10px; cursor:pointer; }
        .btn:disabled{ opacity:.5; cursor:not-allowed; }
        .btn.primary{ background:var(--accent,#10b981); }

        .grid{ display:grid; grid-template-columns: 260px 1fr; gap:16px; min-height:540px; }
        .left{ background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:10px; display:flex; flex-direction:column; }
        .left .search input{ width:100%; height:34px; border:1px solid #e5e7eb; border-radius:8px; padding:0 10px; }
        .left .list{ margin-top:8px; overflow:auto; display:grid; gap:8px; }
        .left .hint{ color:#6b7280; font-size:12px; padding:8px; text-align:center; }

        .row{ display:flex; align-items:center; justify-content:space-between; gap:8px; background:#fff; border:1px solid #eef2f7; padding:6px 8px; border-radius:10px; cursor:pointer; }
        .row:hover{ border-color:#dbe3ee; }
        .row.active{ background:#f0fdf4; border-color:#bbf7d0; }
        .row .wf{ font-size:10px; color:#6b7280; }

        .pill{ display:inline-flex; align-items:center; gap:8px; padding:4px 10px; border-radius:999px; border:1px solid transparent; font-weight:600; line-height:1; }
        .pill.big{ font-size:14px; padding:6px 12px; }

        .editor{ background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:0; min-height:480px; }
        .editor-empty{ color:#6b7280; font-size:13px; display:grid; place-items:center; height:100%; }

        .card{ display:grid; grid-template-rows:auto 1fr; height:100%; }
        .card-h{ display:flex; justify-content:space-between; align-items:center; padding:12px 14px; border-bottom:1px solid #eef2f7; }
        .trash{ background:none; border:0; font-size:18px; cursor:pointer; opacity:.8; }
        .trash:hover{ opacity:1; }

        .form{ display:grid; gap:10px; padding:14px; }
        .form label{ font-size:12px; color:#6b7280; }
        .form input, .form select{
          height:36px; border:1px solid #e5e7eb; border-radius:10px; padding:0 10px; background:#fff;
        }
        .colors.lg .dot{ width:22px; height:22px; }

        .actions{ display:flex; justify-content:flex-end; margin-top:6px; }
      `}</style>
    </div>
  );
}

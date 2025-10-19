// apps/web/src/pages/Tags.tsx
import { useEffect, useMemo, useState, useId } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  listWorkflows,
  type TagDTO,
  type Workflow,
} from "../lib/api";

type BusyState = "idle" | "loading" | "saving" | "deleting";

/** Default palette chips (hex) */
const PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#10b981", // green
  "#06b6d4", // teal
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
];

/* ---------- Reusable color wheel chip (label+input binding = always clickable) ---------- */
function WheelChip({
  value,
  onChange,
  selected,
  title,
}: {
  value: string | null;
  onChange: (hex: string) => void;
  selected: boolean;
  title?: string;
}) {
  const inputId = useId();
  return (
    <div className="wheel-wrap">
      <input
        id={inputId}
        type="color"
        className="visually-hidden-color"
        value={value ?? "#888888"}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Custom color"
      />
      <label
        htmlFor={inputId}
        className={`chip wheel ${selected ? "sel" : ""}`}
        title={title || value || "Custom color"}
      />
    </div>
  );
}

export default function Tags() {
  const nav = useNavigate();

  const [busy, setBusy] = useState<BusyState>("loading");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [tags, setTags] = useState<TagDTO[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<TagDTO | null>(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(PALETTE[4]); // default teal

  // Edit form (mirrors selection)
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        setBusy("loading");
        const [t, wf] = await Promise.all([getTags(), listWorkflows()]);
        setTags(t);
        setWorkflows(wf);
        setErr(null);
      } catch {
        setErr("Failed to load tags/workflows");
      } finally {
        setBusy("idle");
      }
    })();
  }, []);

  // Sync editor with selection
  useEffect(() => {
    if (!sel) {
      setName("");
      setColor(null);
      setWorkflowId(null);
    } else {
      setName(sel.name);
      setColor(sel.color ?? null);
      setWorkflowId(sel.workflowId ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  // Filter list
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(k));
  }, [q, tags]);

  function bannerError(msg: string) {
    setErr(msg);
    setOk(null);
    setTimeout(() => setErr(null), 3500);
  }
  function bannerOk(msg: string) {
    setOk(msg);
    setErr(null);
    setTimeout(() => setOk(null), 1800);
  }

  async function onCreate() {
    const n = newName.trim();
    if (!n) return;
    try {
      setBusy("saving");
      const tag = await createTag({
        name: n,
        color: newColor ?? null,
        workflowId: null,
      } as any);
      setTags((xs) => [tag, ...xs].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      bannerOk("Tag created");
    } catch {
      bannerError("Failed to create tag");
    } finally {
      setBusy("idle");
    }
  }

  async function onSave() {
    if (!sel) return;
    try {
      setBusy("saving");
      const patch = {
        name: name.trim(),
        color: color ?? null,
        workflowId: workflowId ?? null,
      };
      const updated = await updateTag(sel.id, patch as any);
      setTags((xs) =>
        xs.map((t) => (t.id === updated.id ? updated : t)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setSel(updated);
      bannerOk("Saved");
    } catch {
      bannerError("Failed to save");
    } finally {
      setBusy("idle");
    }
  }

  async function onDelete() {
    if (!sel) return;
    if (!confirm(`Delete "${sel.name}"?`)) return;
    try {
      setBusy("deleting");
      await deleteTag(sel.id);
      setTags((xs) => xs.filter((t) => t.id !== sel.id));
      setSel(null);
      bannerOk("Deleted");
    } catch {
      bannerError("Failed to delete");
    } finally {
      setBusy("idle");
    }
  }

  // Helpers to detect custom color vs palette
  const isCustom = (v: string | null) => !!(v && !PALETTE.includes(v));

  return (
    <div className="p-tags">
      <div className="page-h">
        <div className="left">
          {/* Always-visible back button */}
          <Link className="back" to="/dashboard" onClick={(e) => { e.preventDefault(); nav("/dashboard"); }}>
            ← Back to Dashboard
          </Link>
          <div>
            <div className="title">Tags</div>
            <div className="sub">
              Organize contacts and optionally auto-start a workflow when a tag is applied.
            </div>
          </div>
        </div>
        <div />
      </div>

      {err && <div className="banner error">⚠️ {err}</div>}
      {ok && <div className="banner ok">✅ {ok}</div>}

      {/* Create row */}
      <div className="create">
        <input
          className="name"
          placeholder="New tag…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
        />

        {/* palette + wheel */}
        <div className="chips" role="radiogroup" aria-label="Tag color">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`chip ${newColor === c ? "sel" : ""}`}
              style={{ background: c }}
              aria-checked={newColor === c}
              role="radio"
              onClick={() => setNewColor(c)}
              title={c}
            />
          ))}

          {/* Reliable wheel (click label triggers input) */}
          <WheelChip
            value={newColor}
            onChange={(hex) => setNewColor(hex)}
            selected={isCustom(newColor)}
            title="Pick custom color"
          />

          {/* show hex box only if using a custom color */}
          {isCustom(newColor) && (
            <input
              className="hex"
              value={newColor!}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="Hex color"
            />
          )}
        </div>

        <button className="btn" onClick={onCreate} disabled={!newName.trim() || busy !== "idle"}>
          Add
        </button>
      </div>

      <div className="grid">
        {/* LEFT: tag list */}
        <aside className="list">
          <div className="search">
            <input
              placeholder="Search tags…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul>
            {filtered.map((t) => (
              <li
                key={t.id}
                className={`row ${sel?.id === t.id ? "active" : ""}`}
                onClick={() => setSel(t)}
              >
                <span className="dot" style={{ background: t.color ?? "#e5e7eb" }} />
                <span className="name">{t.name}</span>
              </li>
            ))}
            {!filtered.length && <li className="empty">No tags</li>}
          </ul>
        </aside>

        {/* RIGHT: editor */}
        <section className="editor">
          {!sel ? (
            <div className="hint">Select a tag to edit its name, color, or attached workflow.</div>
          ) : (
            <div className="card">
              <div className="card-h">
                <div className="h">Edit tag</div>
                <div className="actions">
                  <button className="btn ghost" onClick={onDelete} disabled={busy !== "idle"}>
                    Delete
                  </button>
                  <button className="btn" onClick={onSave} disabled={busy !== "idle" || !name.trim()}>
                    Save
                  </button>
                </div>
              </div>

              <div className="form">
                {/* Name */}
                <label className="row">
                  <span className="lab">Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>

                {/* Color */}
                <label className="row">
                  <span className="lab">Color</span>
                  <div className="colorPicker">
                    <div className="chips" role="radiogroup" aria-label="Tag color">
                      {PALETTE.map((c) => (
                        <button
                          key={c}
                          className={`chip ${color === c ? "sel" : ""}`}
                          style={{ background: c }}
                          aria-checked={color === c}
                          role="radio"
                          onClick={() => setColor(c)}
                          title={c}
                        />
                      ))}

                      <WheelChip
                        value={color}
                        onChange={(hex) => setColor(hex)}
                        selected={isCustom(color)}
                        title="Pick custom color"
                      />

                      {/* clear color */}
                      <button className="chip none" onClick={() => setColor(null)} title="No color">
                        ×
                      </button>

                      {/* show hex for custom color */}
                      {isCustom(color) && (
                        <input
                          className="hex"
                          value={color!}
                          onChange={(e) => setColor(e.target.value)}
                          aria-label="Hex color"
                        />
                      )}
                    </div>
                  </div>
                </label>

                {/* Workflow */}
                <label className="row">
                  <span className="lab">Workflow</span>
                  <select
                    value={workflowId ?? ""}
                    onChange={(e) => setWorkflowId(e.target.value || null)}
                  >
                    <option value="">(none)</option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}
        </section>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

/* ---------------- styles ---------------- */
const CSS = `
.p-tags{padding:16px}

/* header */
.page-h{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.page-h .left{display:flex;align-items:flex-start;gap:12px}
.back{
  display:inline-flex;align-items:center;gap:6px;
  height:36px;padding:0 12px;border-radius:10px;
  background:#fff;border:1px solid #e5e7eb;color:#111;text-decoration:none;
  font-weight:600;
}
.back:hover{background:#f8fafc}

.title{font-weight:800;font-size:20px}
.sub{color:#6b7280;font-size:12px;margin-top:2px}

/* banners */
.banner{padding:10px 12px;border-radius:10px;margin:10px 0;font-weight:600}
.banner.error{background:#fef2f2;color:#991b1b;border:1px solid #fee2e2}
.banner.ok{background:#ecfdf5;color:#065f46;border:1px solid #d1fae5}

/* create row */
.create{
  display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;
  background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px
}
.create .name{height:36px;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px}

/* chips */
.chips{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.chip{
  width:22px;height:22px;border-radius:999px;border:2px solid #fff;
  box-shadow:0 0 0 1px #e5e7eb;cursor:pointer;position:relative
}
.chip.sel{box-shadow:0 0 0 2px #10b981}
.chip.sel::after{content:"";position:absolute;inset:5px;border:2px solid #fff;border-radius:999px}

/* clear chip */
.chip.none{
  display:grid;place-items:center;background:#f3f4f6;color:#111;border:1px dashed #d1d5db;font-weight:700;width:26px;height:26px
}

/* wheel chip always clickable thanks to label+input */
.wheel-wrap{position:relative}
.chip.wheel{
  width:26px;height:26px;border-radius:999px;border:2px solid #fff;
  background:conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);
  box-shadow:0 0 0 1px #e5e7eb;cursor:pointer
}
.visually-hidden-color{
  position:absolute;left:-9999px;top:-9999px;width:0;height:0;opacity:0;pointer-events:none
}

/* hex input shown when using a custom color */
.hex{
  height:28px;border:1px solid #e5e7eb;border-radius:6px;padding:0 8px;
  font-family:ui-monospace, SFMono-Regular, Menlo, monospace;width:96px
}

/* layout */
.btn{background:#10b981;color:#fff;border:0;border-radius:10px;padding:8px 12px;height:36px;cursor:pointer}
.btn.ghost{background:#fff;color:#374151;border:1px solid #e5e7eb}

.grid{display:grid;grid-template-columns:280px 1fr;gap:16px;margin-top:12px}
.list{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px}
.search input{width:100%;height:34px;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px}
.list ul{list-style:none;margin:8px 0 0;padding:0;max-height:520px;overflow:auto}
.row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer}
.row:hover{background:#f8fafc}
.row.active{background:#ecfdf5;box-shadow:inset 0 0 0 1px #bbf7d0}
.dot{width:12px;height:12px;border-radius:999px;background:#e5e7eb;border:1px solid #e5e7eb}
.name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.empty{color:#6b7280;padding:10px}

.editor .hint{display:grid;place-items:center;height:360px;color:#6b7280;border:1px dashed #e5e7eb;border-radius:12px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
.card-h{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #e5e7eb}
.h{font-weight:700}
.actions{display:flex;gap:8px}
.form{display:grid;gap:12px;padding:12px}
.row{display:grid;grid-template-columns:120px 1fr;align-items:center}
.lab{color:#374151;font-weight:600}
.form input,.form select{height:36px;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px}
.colorPicker{display:flex;align-items:center}
`;
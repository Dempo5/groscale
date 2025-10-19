import { useEffect, useMemo, useState } from "react";
import {
  getTags, createTag, updateTag, deleteTag,
  listWorkflows, type TagDTO, type Workflow, type TagColor
} from "../lib/api";

type BusyState = "idle" | "loading" | "saving" | "deleting";

const PALETTE: TagColor[] = [
  "red","orange","amber","green","teal","blue","indigo","violet","pink","gray"
];

// map brand colors to hex for previews
const HEX: Record<TagColor, string> = {
  red:"#ef4444", orange:"#f97316", amber:"#f59e0b", green:"#10b981",
  teal:"#06b6d4", blue:"#3b82f6", indigo:"#6366f1", violet:"#8b5cf6",
  pink:"#ec4899", gray:"#6b7280"
};

export default function Tags() {
  const [busy, setBusy] = useState<BusyState>("loading");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [tags, setTags] = useState<TagDTO[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<TagDTO | null>(null);

  // create form
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(HEX.teal);
  const [customColor, setCustomColor] = useState("#22c55e"); // visible color wheel value

  // editor form (mirrors sel)
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [editorCustom, setEditorCustom] = useState("#999999");

  useEffect(() => {
    (async () => {
      try {
        setBusy("loading");
        const [t, wf] = await Promise.all([getTags(), listWorkflows()]);
        setTags(t);
        setWorkflows(wf);
        setErr(null);
      } catch (e: any) {
        setErr("Failed to load tags/workflows");
      } finally {
        setBusy("idle");
      }
    })();
  }, []);

  // sync editor with selection
  useEffect(() => {
    if (!sel) {
      setName(""); setColor(null); setWorkflowId(null);
    } else {
      setName(sel.name);
      setColor(sel.color ? HEX[sel.color as TagColor] ?? sel.color : null);
      setWorkflowId(sel.workflowId ?? null);
      setEditorCustom(sel.color ? (HEX[sel.color as TagColor] ?? "#999999") : "#999999");
    }
  }, [sel?.id]);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(k));
  }, [q, tags]);

  function bannerError(msg: string) { setErr(msg); setOk(null); }
  function bannerOk(msg: string) { setOk(msg); setErr(null); setTimeout(() => setOk(null), 1600); }

  /* ---------- Create ---------- */
  async function onCreate() {
    const n = newName.trim();
    if (!n) return;
    try {
      setBusy("saving");
      // prefer customColor if different from preset selection
      const chosen = newColor || customColor;
      // send a semantic color token if it exactly matches our known palette, else send hex
      const token = Object.entries(HEX).find(([_, hex]) => hex.toLowerCase() === chosen.toLowerCase())?.[0] as TagColor | undefined;
      const tag = await createTag({ name: n, color: (token ?? (chosen as any)) });
      setTags((xs) => [tag, ...xs].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      bannerOk("Tag created");
    } catch {
      bannerError("Failed to create tag");
    } finally {
      setBusy("idle");
    }
  }

  /* ---------- Save / Delete ---------- */
  async function onSave() {
    if (!sel) return;
    try {
      setBusy("saving");
      const chosen = color || editorCustom;
      const token = Object.entries(HEX).find(([_, hex]) => hex.toLowerCase() === chosen.toLowerCase())?.[0] as TagColor | undefined;
      const patch = {
        name: name.trim(),
        color: (token ?? (chosen as any)),
        workflowId: workflowId ?? null,
      };
      const updated = await updateTag(sel.id, patch);
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

  return (
    <div className="tags-wrap">
      <div className="page-bar">
        <div>
          <div className="title">Tags</div>
          <div className="sub">Organize contacts and optionally auto-start a workflow when a tag is applied.</div>
        </div>
      </div>

      {err && <div className="banner error">⚠️ {err}</div>}
      {ok && <div className="banner ok">✅ {ok}</div>}

      {/* Create Panel */}
      <div className="create-card">
        <input
          className="name"
          placeholder="New tag…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
        />

        {/* preset chips */}
        <div className="chips">
          {PALETTE.map((key) => (
            <button
              key={key}
              className={`chip ${newColor === HEX[key] ? "sel" : ""}`}
              style={{ background: HEX[key] }}
              title={key}
              onClick={() => setNewColor(HEX[key])}
            />
          ))}

          {/* Visible circular "wheel" + input color */}
          <div className="wheel">
            <input
              type="color"
              value={customColor}
              onChange={(e) => { setCustomColor(e.target.value); setNewColor(null); }}
              aria-label="Custom color"
            />
          </div>
        </div>

        <button className="btn" onClick={onCreate} disabled={!newName.trim() || busy !== "idle"}>
          Add
        </button>
      </div>

      <div className="layout">
        {/* LEFT: list */}
        <aside className="panel list">
          <div className="search">
            <input placeholder="Search tags…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul>
            {busy === "loading" ? (
              <li className="skeleton">Loading…</li>
            ) : filtered.length ? (
              filtered.map((t) => (
                <li
                  key={t.id}
                  className={`row ${sel?.id === t.id ? "active" : ""}`}
                  onClick={() => setSel(t)}
                >
                  <span
                    className="dot"
                    style={{ background: t.color ? (HEX[t.color as TagColor] ?? (t.color as string)) : "#e5e7eb" }}
                  />
                  <span className="name">{t.name}</span>
                </li>
              ))
            ) : (
              <li className="empty">No tags</li>
            )}
          </ul>
        </aside>

        {/* RIGHT: editor */}
        <section className="panel editor">
          {!sel ? (
            <div className="hint">Select a tag to edit its name, color, or attached workflow.</div>
          ) : (
            <div className="card">
              <div className="card-h">
                <div className="h">Edit tag</div>
                <div className="actions">
                  <button className="btn ghost" onClick={onDelete} disabled={busy !== "idle"}>Delete</button>
                  <button className="btn" onClick={onSave} disabled={busy !== "idle" || !name.trim()}>Save</button>
                </div>
              </div>

              <div className="form">
                <label className="row">
                  <span className="lab">Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>

                <label className="row">
                  <span className="lab">Color</span>
                  <div className="picker">
                    <div className="chips">
                      {PALETTE.map((key) => (
                        <button
                          key={key}
                          className={`chip ${color === HEX[key] ? "sel" : ""}`}
                          style={{ background: HEX[key] }}
                          title={key}
                          onClick={() => setColor(HEX[key])}
                        />
                      ))}
                      <div className="wheel lg">
                        <input
                          type="color"
                          value={editorCustom}
                          onChange={(e) => { setEditorCustom(e.target.value); setColor(null); }}
                          aria-label="Custom color"
                        />
                      </div>
                      <button className="chip none" onClick={() => { setColor(null); }} title="No color">×</button>
                    </div>
                  </div>
                </label>

                <label className="row">
                  <span className="lab">Workflow</span>
                  <select
                    value={workflowId ?? ""}
                    onChange={(e) => setWorkflowId(e.target.value || null)}
                  >
                    <option value="">(none)</option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
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
.tags-wrap{padding:16px}
.page-bar{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px}
.title{font-weight:800;font-size:20px}
.sub{color:#6b7280;font-size:12px;margin-top:2px}

.banner{padding:10px 12px;border-radius:12px;margin:10px 0;font-weight:600}
.banner.error{background:#fef2f2;color:#991b1b;border:1px solid #fee2e2}
.banner.ok{background:#ecfdf5;color:#065f46;border:1px solid #d1fae5}

/* Create card */
.create-card{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;
  background:#fff;border:1px solid #e6e7eb;border-radius:14px;padding:12px}
.create-card .name{height:38px;border:1px solid #e6e7eb;border-radius:10px;padding:0 12px}
.chips{display:flex;gap:10px;align-items:center}
.chip{width:24px;height:24px;border-radius:999px;border:2px solid #fff;box-shadow:0 0 0 1px #e5e7eb;cursor:pointer}
.chip.sel{box-shadow:0 0 0 2px #10b981}
.chip.none{display:grid;place-items:center;background:#f3f4f6;color:#111;border:1px dashed #d1d5db;font-weight:700}
.btn{background:#10b981;color:#fff;border:0;border-radius:10px;padding:8px 12px;height:38px;cursor:pointer}
.btn.ghost{background:#fff;color:#374151;border:1px solid #e5e7eb}

/* Wheel: visible circular control that opens the native color dialog */
.wheel{position:relative;width:30px;height:30px;border-radius:999px;overflow:hidden;box-shadow:inset 0 0 0 1px #e5e7eb}
.wheel.lg{width:36px;height:36px}
.wheel input{appearance:none;-webkit-appearance:none;border:none;padding:0;margin:0;width:100%;height:100%;
  background:conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)}
.wheel input::-webkit-color-swatch-wrapper{padding:0}
.wheel input::-webkit-color-swatch{border:none}

.layout{display:grid;grid-template-columns:300px 1fr;gap:16px;margin-top:14px}
.panel{background:#fff;border:1px solid #e6e7eb;border-radius:14px}
.list{padding:12px}
.search input{width:100%;height:36px;border:1px solid #e6e7eb;border-radius:10px;padding:0 10px}
.list ul{list-style:none;margin:10px 0 0;padding:0;max-height:520px;overflow:auto}
.row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;cursor:pointer}
.row:hover{background:#f8fafc}
.row.active{background:#ecfdf5;box-shadow:inset 0 0 0 1px #bbf7d0}
.dot{width:12px;height:12px;border-radius:999px;background:#e5e7eb;border:1px solid #e5e7eb}
.name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.empty{color:#6b7280;padding:12px}
.skeleton{color:#6b7280;padding:12px}

.editor{padding:0}
.card{border-radius:14px;overflow:hidden}
.card-h{display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #e6e7eb}
.h{font-weight:700}
.actions{display:flex;gap:8px}
.form{display:grid;gap:14px;padding:14px}
.row{display:grid;grid-template-columns:140px 1fr;align-items:center}
.lab{color:#374151;font-weight:600}
.form input,.form select{height:38px;border:1px solid #e6e7eb;border-radius:10px;padding:0 10px}
.picker .chips{gap:10px}
`;

// apps/web/src/pages/Tags.tsx
import { useEffect, useMemo, useState } from "react";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  listWorkflows,
  type Workflow,
  type TagDTO,
  type TagColor,
} from "../lib/api";

type SaveState = "idle" | "saving" | "saved" | "error";

const COLORS: TagColor[] = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "violet",
  "pink",
  "gray",
];

const HEX: Record<TagColor, string> = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  green: "#10b981",
  teal: "#14b8a6",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  pink: "#ec4899",
  gray: "#6b7280",
};

export default function Tags() {
  const [rows, setRows] = useState<TagDTO[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // new tag bar
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState<TagColor>("blue");
  const [adding, setAdding] = useState(false);

  // editor state
  const selected = rows.find((t) => t.id === selectedId) || null;
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagColor>("blue");
  const [workflowId, setWorkflowId] = useState<string>("");
  const [save, setSave] = useState<SaveState>("idle");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [ts, wfs] = await Promise.all([listTags(), listWorkflows()]);
        setRows(ts);
        setWorkflows(wfs);
        if (ts.length) setSelectedId(ts[0].id);
      } catch (e: any) {
        setErr(`Failed to load tags/workflows`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // whenever selection changes, hydrate the editor
  useEffect(() => {
    if (!selected) return;
    setName(selected.name || "");
    setColor((selected.color as TagColor) || "blue");
    setWorkflowId(selected.workflowId || "");
    setSave("idle");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((t) => t.name.toLowerCase().includes(q));
  }, [rows, query]);

  async function onCreate() {
    const nm = addName.trim();
    if (!nm) return;
    setAdding(true);
    setErr(null);
    try {
      const t = await createTag({ name: nm, color: addColor });
      setRows((r) => [t, ...r].sort(sorter));
      setAddName("");
      setAddOpen(false);
      setSelectedId(t.id);
    } catch (e: any) {
      setErr("Failed to create tag");
    } finally {
      setAdding(false);
    }
  }

  async function onSave() {
    if (!selected) return;
    const nm = name.trim();
    if (!nm) return;
    setSave("saving");
    setErr(null);
    try {
      const updated = await updateTag(selected.id, {
        name: nm,
        color: color || "blue",
        workflowId: workflowId || undefined, // avoid null
      });
      setRows((r) =>
        r
          .map((x) => (x.id === updated.id ? updated : x))
          .sort(sorter)
      );
      setSave("saved");
      setTimeout(() => setSave("idle"), 1200);
    } catch (e: any) {
      setSave("error");
      setErr("Failed to save changes");
    }
  }

  async function onDelete(id: string) {
    const row = rows.find((t) => t.id === id);
    if (!row) return;
    if (!confirm(`Delete tag “${row.name}”? This cannot be undone.`)) return;
    setErr(null);
    try {
      await deleteTag(id);
      const next = rows.filter((t) => t.id !== id);
      setRows(next);
      if (selectedId === id) setSelectedId(next[0]?.id || "");
    } catch (e: any) {
      setErr("Failed to delete tag");
    }
  }

  return (
    <div className="p-tags">
      <div className="top">
        <div className="title">Tags</div>
        <div className="actions">
          {!addOpen ? (
            <button className="btn" onClick={() => setAddOpen(true)}>
              + New tag
            </button>
          ) : (
            <div className="addbar">
              <input
                className="text"
                placeholder="New tag name…"
                autoFocus
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
              />
              <div className="swatches">
                {COLORS.map((c) => (
                  <Swatch key={c} color={c} active={c === addColor} onClick={() => setAddColor(c)} />
                ))}
              </div>
              <button className="btn" onClick={onCreate} disabled={!addName.trim() || adding}>
                {adding ? "Adding…" : "Add"}
              </button>
              <button className="btn ghost" onClick={() => setAddOpen(false)} disabled={adding}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {err && <div className="banner error">⚠️ {err}</div>}
      {loading && <div className="loading">Loading…</div>}

      {!loading && (
        <div className="grid">
          {/* LEFT: list */}
          <div className="col list">
            <div className="search">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <input
                placeholder="Search tags…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <ul className="rows">
              {!filtered.length && <li className="empty">No tags</li>}
              {filtered.map((t) => (
                <li
                  key={t.id}
                  className={`row ${t.id === selectedId ? "active" : ""}`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <span className="dot" style={{ background: HEX[(t.color as TagColor) || "blue"] }} />
                  <span className="name">{t.name}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* RIGHT: editor */}
          <div className="col editor">
            {!selected ? (
              <div className="placeholder">Select a tag to edit its name, color, or attached workflow.</div>
            ) : (
              <div className="card">
                <div className="card-h">
                  <div className="pill" style={{ background: HEX[color] }} />
                  <div className="h">Edit tag</div>
                  <button className="danger" onClick={() => onDelete(selected.id)} title="Delete">
                    Delete
                  </button>
                </div>

                <div className="form">
                  <div className="group">
                    <label>Name</label>
                    <input
                      className="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Tag name"
                    />
                  </div>

                  <div className="group">
                    <label>Color</label>
                    <div className="swatches big">
                      {COLORS.map((c) => (
                        <Swatch key={c} color={c} active={c === color} onClick={() => setColor(c)} />
                      ))}
                    </div>
                  </div>

                  <div className="group">
                    <label>Attached workflow (optional)</label>
                    <select
                      className="select"
                      value={workflowId}
                      onChange={(e) => setWorkflowId(e.target.value)}
                    >
                      <option value="">(none)</option>
                      {workflows.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="card-f">
                  <div className={`save ${save}`}>
                    {save === "saving" && "Saving…"}
                    {save === "saved" && "Saved ✓"}
                    {save === "error" && "Error"}
                  </div>
                  <button className="btn" onClick={onSave} disabled={!name.trim() || save === "saving"}>
                    Save changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{css}</style>
    </div>
  );
}

function Swatch({
  color,
  active,
  onClick,
}: {
  color: TagColor;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`swatch ${active ? "active" : ""}`}
      style={{ background: HEX[color] }}
      aria-label={color}
      onClick={onClick}
    >
      {active && (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M5 12l4 4L19 6" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>
      )}
    </button>
  );
}

function sorter(a: TagDTO, b: TagDTO) {
  return a.name.localeCompare(b.name);
}

const css = `
.p-tags { padding: 16px; }
.top { display:flex; align-items:center; justify-content:space-between; }
.title { font-weight:800; }
.actions { display:flex; align-items:center; gap:8px; }
.btn { background: var(--accent,#10b981); color:#fff; border:0; border-radius:10px; padding:8px 12px; cursor:pointer; }
.btn.ghost { background:#fff; color:#374151; border:1px solid #e5e7eb; }
.banner.error { margin:10px 0; padding:10px; border:1px solid #fee2e2; background:#fef2f2; color:#991b1b; border-radius:10px; }
.loading { margin:20px 0; color:#6b7280; }
.grid { display:grid; grid-template-columns: 280px 1fr; gap:14px; margin-top:12px; }
.col { background:#fff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
.col.list { display:grid; grid-template-rows:auto 1fr; }
.search { display:flex; align-items:center; gap:8px; padding:10px; border-bottom:1px solid #e5e7eb; }
.search input { width:100%; border:0; outline:0; background:#f9fafb; padding:8px 10px; border-radius:8px; }
.rows { list-style:none; margin:0; padding:6px; max-height: calc(100vh - 220px); overflow:auto; }
.row { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; cursor:pointer; }
.row:hover { background:#f7fafc; }
.row.active { background:#ecfdf5; }
.row .dot { width:10px; height:10px; border-radius:50%; }
.row .name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.empty { color:#6b7280; padding:10px; }
.editor { padding:14px; }
.placeholder { color:#6b7280; display:grid; place-items:center; height:220px; border:1px dashed #e5e7eb; border-radius:12px; }
.card { border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
.card-h { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid #e5e7eb; }
.card-h .h { font-weight:800; flex:1; }
.card-h .pill { width:18px; height:18px; border-radius:999px; }
.card-h .danger { background:#fff; border:1px solid #fee2e2; color:#991b1b; border-radius:10px; padding:6px 10px; cursor:pointer; }
.form { display:grid; gap:14px; padding:14px; }
.group { display:grid; gap:6px; }
.group label { font-size:12px; color:#6b7280; }
.text, .select { width:100%; height:38px; border:1px solid #e5e7eb; border-radius:10px; padding:0 10px; }
.swatches { display:flex; align-items:center; gap:8px; }
.swatches.big .swatch { width:26px; height:26px; }
.swatch { width:22px; height:22px; border-radius:999px; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,.08); position:relative; display:grid; place-items:center; cursor:pointer; }
.swatch.active { box-shadow:0 0 0 2px rgba(16,185,129,.55); }
.card-f { display:flex; align-items:center; gap:10px; padding:12px 14px; border-top:1px solid #e5e7eb; }
.save { font-size:12px; color:#6b7280; }
.save.saved { color:#065f46; }
.addbar { display:flex; align-items:center; gap:10px; }
.addbar .text { width:240px; }
`;

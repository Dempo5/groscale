// apps/web/src/pages/Tags.tsx
// Tags: color, lead count, and the workflow each one starts.
import { useEffect, useMemo, useState } from "react";
import {
  createTag,
  deleteTag,
  getTags,
  listWorkflows,
  updateTag,
  type TagColor,
  type TagDTO,
} from "../lib/api";
import { tagChipColors } from "../lib/tagColors";
import "./tags.css";

type Tag = TagDTO & { leadCount?: number };

const COLORS: TagColor[] = ["red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink", "gray"];

const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const WF_ICON = "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9v3a3 3 0 0 0 3 3h6";
const DOTS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

function Swatches({ value, onChange }: { value: TagColor; onChange: (c: TagColor) => void }) {
  return (
    <div className="tg-swatches" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => {
        const col = tagChipColors(c);
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            className={`tg-swatch ${value === c ? "is-on" : ""}`}
            style={{ background: col.bg, color: col.fg }}
            onClick={() => onChange(c)}
          />
        );
      })}
    </div>
  );
}

/* ---------------- editor (inline, under the row) ---------------- */
function Editor({
  tag,
  workflows,
  onSaved,
  onDeleted,
  onCancel,
}: {
  tag: Tag;
  workflows: { id: string; name: string }[];
  onSaved: (t: Tag) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<TagColor>((tag.color as TagColor) || "gray");
  const [workflowId, setWorkflowId] = useState(tag.workflowId || "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("Give the tag a name.");
    setBusy(true);
    setError(null);
    try {
      const t = await updateTag(tag.id, { name: name.trim(), color, workflowId: workflowId || null });
      onSaved({ ...t, leadCount: tag.leadCount });
    } catch (e: any) {
      setError(e?.message || "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteTag(tag.id);
      onDeleted(tag.id);
    } catch (e: any) {
      setError(e?.message || "Couldn't delete.");
      setBusy(false);
    }
  }

  return (
    <div className="tg-editor">
      <div className="tg-editor-row">
        <label className="tg-field tg-field--name">
          <span className="tg-label">Name</span>
          <input
            className="gs-input tg-input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </label>
        <div className="tg-field">
          <span className="tg-label">Color</span>
          <Swatches value={color} onChange={setColor} />
        </div>
        <label className="tg-field tg-field--wf">
          <span className="tg-label">Linked workflow</span>
          <span className={`tg-wf-select ${workflowId ? "is-set" : ""}`}>
            <span className="tg-wf-icon"><Icon d={WF_ICON} /></span>
            <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
              <option value="">None</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </span>
          <span className="tg-hint">Starts whenever this tag is added to a lead.</span>
        </label>
      </div>
      {error && <div className="tg-error">{error}</div>}
      <div className="tg-editor-actions">
        {confirmDelete ? (
          <span className="tg-confirm">
            Delete “{tag.name}”{tag.leadCount ? ` from ${tag.leadCount.toLocaleString()} leads` : ""}?
            <button className="gs-btn tg-btn-danger" onClick={remove} disabled={busy}>Delete</button>
            <button className="gs-btn gs-btn--ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        ) : (
          <button className="gs-btn gs-btn--ghost tg-delete" onClick={() => setConfirmDelete(true)}>
            Delete tag
          </button>
        )}
        <span className="tg-actions-right">
          <button className="gs-btn gs-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="gs-btn gs-btn--primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </span>
      </div>
    </div>
  );
}

/* ====================================================================== */
export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // new tag
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("blue");

  useEffect(() => {
    (async () => {
      try {
        const [t, w] = await Promise.all([getTags(), listWorkflows()]);
        setTags(t as Tag[]);
        setWorkflows((w || []).map((x: any) => ({ id: x.id, name: x.name })));
      } catch (e: any) {
        setError(e?.message || "Couldn't load tags.");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const wfName = useMemo(() => new Map(workflows.map((w) => [w.id, w.name])), [workflows]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const t = await createTag({ name, color: newColor });
      setTags((x) => [...x, { ...t, leadCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setCreating(false);
      // next new tag gets the next color
      setNewColor(COLORS[(COLORS.indexOf(newColor) + 3) % COLORS.length]);
    } catch (e: any) {
      setError(e?.message || "Couldn't create that tag.");
    }
  }

  return (
    <div className="gs-page">
      <div className="gs-page-panel">
        <div className="tg">
          <header className="tg-head">
            <div>
              <h1>Tags</h1>
              <p>Label leads so you can filter, bulk text, or start a workflow automatically.</p>
            </div>
            <button className="gs-btn gs-btn--primary tg-new" onClick={() => setCreating(true)}>
              New tag
            </button>
          </header>

          {error && <div className="tg-error">{error}</div>}

          {creating && (
            <div className="tg-create">
              <input
                className="gs-input tg-input"
                placeholder="Tag name, like hot-leads"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                  if (e.key === "Escape") setCreating(false);
                }}
              />
              <Swatches value={newColor} onChange={setNewColor} />
              <span className="tg-actions-right">
                <button className="gs-btn gs-btn--ghost" onClick={() => setCreating(false)}>Cancel</button>
                <button className="gs-btn gs-btn--primary" onClick={create} disabled={!newName.trim()}>
                  Create
                </button>
              </span>
            </div>
          )}

          <div className="tg-table">
            <div className="tg-row tg-row--head">
              <span>Tag</span>
              <span>Leads</span>
              <span>Workflow</span>
              <span />
            </div>

            {loaded && !tags.length && !creating && (
              <p className="tg-empty">No tags yet. Create one to start organizing your leads.</p>
            )}

            {tags.map((t) => {
              const c = tagChipColors(t.color);
              const open = editing === t.id;
              const wf = t.workflowId ? wfName.get(t.workflowId) : null;
              return (
                <div key={t.id} className="tg-item">
                  <div
                    className={`tg-row ${open ? "is-open" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => setEditing(open ? null : t.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setEditing(open ? null : t.id)}
                  >
                    <span>
                      <span className="gs-chip" style={{ background: c.bg, color: c.fg }}>{t.name}</span>
                    </span>
                    <span className="tg-muted">
                      {t.leadCount !== undefined ? `${t.leadCount.toLocaleString()} lead${t.leadCount === 1 ? "" : "s"}` : "—"}
                    </span>
                    {wf ? (
                      <span className="tg-wf"><Icon d={WF_ICON} size={13} />{wf}</span>
                    ) : (
                      <span className="tg-none">None</span>
                    )}
                    <span className="tg-dots" aria-hidden>{DOTS}</span>
                  </div>
                  {open && (
                    <Editor
                      tag={t}
                      workflows={workflows}
                      onCancel={() => setEditing(null)}
                      onSaved={(nt) => {
                        setTags((x) => x.map((y) => (y.id === nt.id ? nt : y)));
                        setEditing(null);
                      }}
                      onDeleted={(id) => {
                        setTags((x) => x.filter((y) => y.id !== id));
                        setEditing(null);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

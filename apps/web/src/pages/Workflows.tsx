import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import "./dashboard-ios.css";

/** ---------- Types (MVP, local only) ---------- */
type Step = {
  id: string;
  delayMinutes: number;     // minutes after previous step
  message: string;
};

type Workflow = {
  id: string;
  name: string;
  trigger: "on_upload" | "manual";
  stopOnReply: boolean;
  enabled: boolean;
  sendFrom?: string | null; // optional number/MS
  createdAt: string;
  updatedAt: string;
  steps: Step[];
};

const LS_KEY = "gs_workflows_v1";

/** ---------- Local storage helpers ---------- */
function loadAll(): Workflow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Workflow[]) : [];
  } catch {
    return [];
  }
}
function saveAll(items: Workflow[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {}
}

/** Simple id */
const uid = () => Math.random().toString(36).slice(2, 10);

/** Debounce */
function useDebounced(fn: () => void, delay = 400) {
  const t = useRef<number | null>(null);
  return () => {
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(fn, delay);
  };
}

/** ---------- Page ---------- */
export default function Workflows() {
  const [items, setItems] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const list = loadAll();
    setItems(list);
    if (list.length) setSelectedId(list[0].id);
  }, []);

  const selected = useMemo(
    () => items.find(w => w.id === selectedId) || null,
    [items, selectedId]
  );

  /** persist on any change (debounced) */
  const persist = useDebounced(() => saveAll(items), 350);
  useEffect(() => {
    persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  /** create new */
  function createNew() {
    const now = new Date().toISOString();
    const w: Workflow = {
      id: uid(),
      name: "Opening message",
      trigger: "on_upload",
      stopOnReply: true,
      enabled: true,
      sendFrom: null,
      createdAt: now,
      updatedAt: now,
      steps: [
        { id: uid(), delayMinutes: 0, message: "Hi {{first_name}} — quick question about your coverage. (Reply STOP to opt out)" },
      ],
    };
    setItems(prev => [w, ...prev]);
    setSelectedId(w.id);
  }

  /** duplicate */
  function duplicate(id: string) {
    const src = items.find(i => i.id === id);
    if (!src) return;
    const now = new Date().toISOString();
    const dupe: Workflow = {
      ...src,
      id: uid(),
      name: `${src.name} (copy)`,
      createdAt: now,
      updatedAt: now,
      steps: src.steps.map(s => ({ ...s, id: uid() })),
    };
    setItems(prev => [dupe, ...prev]);
    setSelectedId(dupe.id);
  }

  /** delete */
  function remove(id: string) {
    if (!confirm("Delete this workflow?")) return;
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  /** patch selected */
  function patchSelected(patch: Partial<Workflow>) {
    setItems(prev =>
      prev.map(w =>
        w.id === selectedId ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w
      )
    );
  }

  /** step ops */
  function addStep() {
    if (!selected) return;
    const last = selected.steps[selected.steps.length - 1];
    const step: Step = {
      id: uid(),
      delayMinutes: last ? Math.max(5, last.delayMinutes) : 0,
      message: "",
    };
    patchSelected({ steps: [...selected.steps, step] });
  }
  function updateStep(id: string, patch: Partial<Step>) {
    if (!selected) return;
    patchSelected({
      steps: selected.steps.map(s => (s.id === id ? { ...s, ...patch } : s)),
    });
  }
  function deleteStep(id: string) {
    if (!selected) return;
    patchSelected({ steps: selected.steps.filter(s => s.id !== id) });
  }
  function moveStep(id: string, dir: -1 | 1) {
    if (!selected) return;
    const idx = selected.steps.findIndex(s => s.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= selected.steps.length) return;
    const clone = [...selected.steps];
    const [sp] = clone.splice(idx, 1);
    clone.splice(j, 0, sp);
    patchSelected({ steps: clone });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(w => w.name.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div className="p-uploads" style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Breadcrumbs */}
      <div className="crumbs" style={{ marginTop: 6, marginBottom: 8 }}>
        <NavLink className="crumb-back" to="/dashboard">← Dashboard</NavLink>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Workflows</span>
      </div>

      {/* Header row */}
      <div className="uploads-head">
        <div className="title" style={{ fontWeight: 750 }}>Your workflows</div>
        <div className="list-head-actions">
          <button className="btn-outline sm" onClick={createNew}>+ New workflow</button>
        </div>
      </div>

      {/* Search & toggle row (keeps your components) */}
      <div className="card" style={{ padding: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="search" style={{ margin: 0, flex: 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <input placeholder="Search workflows…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {/* (Future) global enable/disable, filters, etc. */}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 12, alignItems: "stretch" }}>
        {/* LEFT: list */}
        <div className="card" style={{ display: "flex", minHeight: 420, overflow: "hidden" }}>
          <div className="table-wrap" style={{ width: "100%" }}>
            <table className="u-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trigger</th>
                  <th>Steps</th>
                  <th>Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      <span className="empty-icon">🧩</span>
                      No workflows yet — click <b>New workflow</b> to build your first automation.
                    </td>
                  </tr>
                )}
                {filtered.map(w => (
                  <tr
                    key={w.id}
                    onClick={() => setSelectedId(w.id)}
                    style={{
                      cursor: "pointer",
                      background: w.id === selectedId ? "color-mix(in srgb, var(--surface-1) 96%, var(--line))" : undefined,
                    }}
                  >
                    <td className="file">
                      <div className="filecell">
                        <div className="fname">{w.name || "Untitled"}</div>
                        <div className="fmeta">
                          {new Date(w.updatedAt).toLocaleDateString()} • {w.steps.length} step{w.steps.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </td>
                    <td>{w.trigger === "on_upload" ? "On lead upload" : "Manual"}</td>
                    <td className="num">{w.steps.length}</td>
                    <td>
                      <span
                        className="pill"
                        style={{
                          background: w.enabled ? "rgba(16,185,129,.12)" : "rgba(148,163,184,.18)",
                          color: w.enabled ? "rgb(16,185,129)" : "rgb(100,116,139)",
                        }}
                      >
                        {w.enabled ? "Enabled" : "Paused"}
                      </span>
                    </td>
                    <td className="right">
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button className="icon-btn ghost" title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicate(w.id); }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                            <path d="M9 9H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M9 15h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button className="icon-btn ghost" title="Delete" onClick={(e) => { e.stopPropagation(); remove(w.id); }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                            <path d="M3 6h18M8 6v12m8-12v12M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: editor */}
        <div className="card" style={{ padding: 12, minHeight: 420 }}>
          {!selected ? (
            <div className="u-table empty" style={{ height: "100%" }}>
              <div style={{ opacity: .35, fontSize: 22, marginBottom: 8 }}>🧠</div>
              Select a workflow on the left, or create a new one.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
              {/* Name + enable */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="input"
                  placeholder="Workflow name"
                  value={selected.name}
                  onChange={e => patchSelected({ name: e.target.value })}
                  onBlur={() => persist()}
                  style={{ flex: 1, height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", background: "var(--surface-1)" }}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={selected.enabled}
                    onChange={e => patchSelected({ enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>

              {/* Trigger + stop on reply */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="hint">Trigger</span>
                  <select
                    className="input"
                    value={selected.trigger}
                    onChange={e => patchSelected({ trigger: e.target.value as Workflow["trigger"] })}
                    onBlur={() => persist()}
                    style={{ height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", background: "var(--surface-1)" }}
                  >
                    <option value="on_upload">On lead upload</option>
                    <option value="manual">Manual enroll</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 4 }}>
                  <span className="hint">Stop on reply</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 36 }}>
                    <input
                      type="checkbox"
                      checked={selected.stopOnReply}
                      onChange={e => patchSelected({ stopOnReply: e.target.checked })}
                    />
                    <span className="hint">Recommended</span>
                  </div>
                </label>
              </div>

              {/* Send-from (optional) */}
              <label style={{ display: "grid", gap: 4 }}>
                <span className="hint">Send from (optional number / Messaging Service SID)</span>
                <input
                  className="input"
                  placeholder="Leave blank to use default number"
                  value={selected.sendFrom || ""}
                  onChange={e => patchSelected({ sendFrom: e.target.value })}
                  onBlur={() => persist()}
                  style={{ height: 36, border: "1px solid var(--line)", borderRadius: 8, padding: "0 10px", background: "var(--surface-1)" }}
                />
              </label>

              {/* Steps */}
              <div className="card" style={{ padding: 10 }}>
                <div className="card-head">Steps</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {selected.steps.map((s, idx) => (
                    <div key={s.id} className="u-card" style={{ borderRadius: 12, padding: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 8, alignItems: "center" }}>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span className="hint">Delay</span>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={s.delayMinutes}
                            onChange={e => updateStep(s.id, { delayMinutes: parseInt(e.target.value || "0", 10) })}
                            onBlur={() => persist()}
                            style={{ height: 32, border: "1px solid var(--line)", borderRadius: 8, padding: "0 8px", background: "var(--surface-1)" }}
                          />
                          <span className="hint" style={{ fontSize: 11 }}>minutes</span>
                        </label>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span className="hint">Message</span>
                          <textarea
                            className="input"
                            value={s.message}
                            onChange={e => updateStep(s.id, { message: e.target.value })}
                            onBlur={() => persist()}
                            rows={3}
                            style={{ resize: "vertical", padding: 8, border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface-1)" }}
                          />
                        </label>
                        <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button className="icon-btn ghost" title="Move up" onClick={() => moveStep(s.id, -1)} disabled={idx === 0}>
                              ↑
                            </button>
                            <button className="icon-btn ghost" title="Move down" onClick={() => moveStep(s.id, +1)} disabled={idx === selected.steps.length - 1}>
                              ↓
                            </button>
                            <button className="icon-btn ghost" title="Delete step" onClick={() => deleteStep(s.id)}>✕</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div>
                    <button className="btn-outline sm" onClick={addStep}>+ Add step</button>
                  </div>
                </div>
              </div>

              {/* Save (local) + tiny helper */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="btn-primary" onClick={() => saveAll(items)}>Save</button>
                <span className="hint">Autosaves when you click out. This MVP stores in your browser while we wire the API.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
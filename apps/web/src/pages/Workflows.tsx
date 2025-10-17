import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import "./dashboard-ios.css";

/** ---------- Small shared icon (same style as Dashboard) ---------- */
const OutlineIcon = ({
  d,
  size = 18,
  stroke = "currentColor",
}: { d: string; size?: number; stroke?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

/** ---------- Types ---------- */
type Step = {
  id: string;
  type: "sms";          // room to add "wait", "email" later
  delayMin: number;     // minutes after previous step
  text: string;         // sms body
};

type Workflow = {
  id: string;
  name: string;
  trigger: "manual" | "on_upload" | "on_tag";
  tag?: string | null;      // if trigger === on_tag
  isActive: boolean;
  steps: Step[];
  updatedAt: number;
};

/** ---------- Local persistence (simple + safe) ---------- */
const LS_KEY = "gs_workflows";

function loadAll(): Workflow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Workflow[]) : [];
  } catch {
    return [];
  }
}
function saveAll(rows: Workflow[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch {}
}
function uid(prefix = "wf"): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${r}`;
}

/** ---------- Debounce hook (for autosave) ---------- */
function useDebouncedCallback<T extends any[]>(fn: (...args: T) => void, ms = 500) {
  const t = useRef<number | null>(null);
  return (...args: T) => {
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => fn(...args), ms);
  };
}

/** ---------- Page ---------- */
export default function Workflows() {
  // data
  const [rows, setRows] = useState<Workflow[]>(() => loadAll());
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id || null);
  const [query, setQuery] = useState("");

  // derive
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  // persist on list change
  useEffect(() => saveAll(rows), [rows]);

  /** --------- CRUD helpers --------- */
  function addWorkflow() {
    const baseName = "New workflow";
    const dupeCount = rows.filter((r) => r.name.startsWith(baseName)).length;
    const wf: Workflow = {
      id: uid(),
      name: dupeCount ? `${baseName} ${dupeCount + 1}` : baseName,
      trigger: "manual",
      tag: null,
      isActive: false,
      steps: [
        {
          id: uid("step"),
          type: "sms",
          delayMin: 0,
          text: "Hi {{first_name}}, thanks for opting in — reply YES to connect.",
        },
      ],
      updatedAt: Date.now(),
    };
    setRows((r) => [wf, ...r]);
    setSelectedId(wf.id);
  }

  function updateSelected(patch: Partial<Workflow>) {
    if (!selected) return;
    setRows((all) =>
      all.map((w) => (w.id === selected.id ? { ...w, ...patch, updatedAt: Date.now() } : w))
    );
  }

  function deleteSelected() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    setRows((all) => all.filter((w) => w.id !== selected.id));
    setSelectedId((cur) => (cur === selected.id ? null : cur));
  }

  function addStep() {
    if (!selected) return;
    const step: Step = { id: uid("step"), type: "sms", delayMin: 5, text: "New SMS step…" };
    updateSelected({ steps: [...selected.steps, step] });
  }
  function updateStep(stepId: string, patch: Partial<Step>) {
    if (!selected) return;
    updateSelected({
      steps: selected.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    });
  }
  function removeStep(stepId: string) {
    if (!selected) return;
    updateSelected({ steps: selected.steps.filter((s) => s.id !== stepId) });
  }

  // debounced autosave hint (no server — localStorage already persists via useEffect)
  const debouncedField = useDebouncedCallback((patch: Partial<Workflow>) => {
    updateSelected(patch);
  }, 350);

  /** --------- UI --------- */
  return (
    <div className="p-uploads" style={{ maxWidth: 1180, margin: "0 auto" }}>
      {/* Breadcrumbs + title — keep same rhythm as Uploads/Numbers */}
      <div className="crumbs" style={{ marginTop: 6, marginBottom: 8 }}>
        <NavLink className="crumb-back" to="/dashboard">← Dashboard</NavLink>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Workflows</span>
      </div>

      <div className="uploads-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="title" style={{ fontWeight: 750 }}>Workflows</div>
        <div>
          <button className="btn-outline sm" onClick={addWorkflow}>+ New workflow</button>
        </div>
      </div>

      {/* Grid: list (left) + editor (right) — reusing your panel/card style */}
      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}>
        {/* ------- LIST ------- */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
            <OutlineIcon d="M11 19a8 8 0 1 1 5.29-14.29L21 9l-4 4" />
            <input
              className="input"
              placeholder="Search workflows…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                border: "0",
                outline: "none",
                background: "transparent",
                color: "inherit",
                height: 28,
              }}
            />
          </div>

          {/* Empty state */}
          {!filtered.length ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-secondary)" }}>
              <div style={{ marginBottom: 8 }}>
                <OutlineIcon
                  d="M4 12h6v6H4zM14 6h6v6h-6zM14 14l6 6"
                  size={36}
                  stroke="var(--text-muted)"
                />
              </div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                No workflows yet
              </div>
              <div style={{ fontSize: 13 }}>
                Click <b>New workflow</b> to build your first automation.
              </div>
            </div>
          ) : (
            <ul className="rows" style={{ paddingTop: 6 }}>
              {filtered.map((w) => (
                <li
                  key={w.id}
                  className={`row ${w.id === selectedId ? "selected" : ""}`}
                  onClick={() => setSelectedId(w.id)}
                  title={w.isActive ? "Active" : "Paused"}
                >
                  <div className="avatar" style={{ width: 26, height: 26 }}>
                    {w.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="meta" style={{ flex: 1, minWidth: 0 }}>
                    <div className="name" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {w.name || "Untitled"}
                    </div>
                    <div className="sub">
                      {w.trigger === "manual" && "Manual"}
                      {w.trigger === "on_upload" && "On lead upload"}
                      {w.trigger === "on_tag" && (w.tag ? `On tag: ${w.tag}` : "On tag")}
                      {" • "}
                      {w.steps.length} step{w.steps.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <span
                    className="tag"
                    style={{
                      marginLeft: "auto",
                      background: w.isActive ? "rgba(34,197,94,.14)" : "rgba(0,0,0,.06)",
                      color: w.isActive ? "#22c55e" : "var(--text-secondary)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {w.isActive ? "Active" : "Paused"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ------- EDITOR ------- */}
        <div className="card" style={{ padding: 12 }}>
          {!selected ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
              Select a workflow to edit.
            </div>
          ) : (
            <form
              onSubmit={(e) => e.preventDefault()}
              onBlur={() => updateSelected({}) /* touch updatedAt so the list reflects changes */}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input
                  value={selected.name}
                  onChange={(e) => debouncedField({ name: e.target.value })}
                  onBlur={(e) => updateSelected({ name: e.target.value })}
                  placeholder="Workflow name"
                  className="input"
                  style={{
                    flex: 1,
                    height: 34,
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: "0 10px",
                    background: "var(--surface-1)",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => updateSelected({ isActive: !selected.isActive })}
                  title={selected.isActive ? "Pause" : "Activate"}
                >
                  {selected.isActive ? "Pause" : "Activate"}
                </button>
                <button type="button" className="btn-outline" onClick={deleteSelected}>
                  Delete
                </button>
              </div>

              {/* Trigger */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span className="hint">Trigger</span>
                  <select
                    className="input"
                    value={selected.trigger}
                    onChange={(e) => {
                      const t = e.target.value as Workflow["trigger"];
                      updateSelected({ trigger: t });
                    }}
                    style={{ height: 34, borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-1)" }}
                  >
                    <option value="manual">Manual (run yourself)</option>
                    <option value="on_upload">On lead upload</option>
                    <option value="on_tag">On tag added</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span className="hint">Tag (if “On tag”)</span>
                  <input
                    className="input"
                    placeholder="e.g. warm"
                    value={selected.tag || ""}
                    onChange={(e) => debouncedField({ tag: e.target.value })}
                    onBlur={(e) => updateSelected({ tag: e.target.value })}
                    disabled={selected.trigger !== "on_tag"}
                    style={{
                      height: 34,
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      background: "var(--surface-1)",
                      opacity: selected.trigger !== "on_tag" ? 0.6 : 1,
                    }}
                  />
                </label>
              </div>

              {/* Steps */}
              <div className="card" style={{ padding: 10, marginBottom: 12 }}>
                <div className="card-head" style={{ border: "0", padding: 0, marginBottom: 8, fontWeight: 700 }}>
                  Steps
                </div>

                {!selected.steps.length ? (
                  <div style={{ padding: 14, color: "var(--text-secondary)" }}>
                    <em>No steps yet.</em> Add your first SMS step below.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {selected.steps.map((s, idx) => (
                      <div
                        key={s.id}
                        className="u-card"
                        style={{
                          padding: 10,
                          display: "grid",
                          gap: 8,
                          borderRadius: 10,
                          border: "1px solid var(--line)",
                          background: "var(--surface-1)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="tag tag-green" style={{ fontWeight: 700 }}>SMS</span>
                          <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>Step {idx + 1}</span>
                          <button
                            type="button"
                            className="icon-chip"
                            title="Remove step"
                            onClick={() => removeStep(s.id)}
                            style={{ marginLeft: "auto" }}
                          >
                            <OutlineIcon d="M18 6L6 18M6 6l12 12" />
                          </button>
                        </div>

                        <label style={{ display: "grid", gap: 6 }}>
                          <span className="hint">Delay (minutes after previous step)</span>
                          <input
                            type="number"
                            min={0}
                            className="input"
                            value={s.delayMin}
                            onChange={(e) => updateStep(s.id, { delayMin: Math.max(0, Number(e.target.value || 0)) })}
                            style={{ height: 34, width: 140, borderRadius: 8, border: "1px solid var(--line)" }}
                          />
                        </label>

                        <label style={{ display: "grid", gap: 6 }}>
                          <span className="hint">Message</span>
                          <textarea
                            className="input"
                            value={s.text}
                            onChange={(e) => updateStep(s.id, { text: e.target.value })}
                            placeholder="Hi {{first_name}} …"
                            rows={3}
                            style={{
                              borderRadius: 8,
                              border: "1px solid var(--line)",
                              padding: 10,
                              resize: "vertical",
                              background: "var(--surface-1)",
                            }}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 10 }}>
                  <button type="button" className="btn-outline sm" onClick={addStep}>
                    + Add SMS step
                  </button>
                </div>
              </div>

              {/* Footer actions (non-destructive; autosave already runs) */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                  {selected.updatedAt ? `Saved ${new Date(selected.updatedAt).toLocaleTimeString()}` : "Saved"}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => alert("This will run the workflow against a small test list later.")}
                  >
                    Test run
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => alert("Already saved. This button can trigger a server save once API exists.")}
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  type Workflow,
} from "../lib/api";

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

export default function Workflows() {
  const [rows, setRows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await listWorkflows();
        setRows(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Start a new, inline-edit workflow row
  async function onNew() {
    // create an optimistic row
    const tempId = `tmp_${Date.now()}`;
    const optimistic: Workflow = {
      id: tempId,
      name: "Untitled workflow",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setRows((r) => [optimistic, ...r]);
    setEditingId(tempId);
    setDraft(optimistic.name);

    // autofocus after mount
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // Commit editing (blur or Enter)
  async function commitEdit(id: string) {
    const name = draft.trim() || "Untitled workflow";
    setBusy(id);
    try {
      if (id.startsWith("tmp_")) {
        const created = await createWorkflow({ name });
        // replace temp with real result
        setRows((r) => {
          const i = r.findIndex((x) => x.id === id);
          if (i === -1) return r;
          const nn = [...r];
          nn[i] = created;
          return nn;
        });
      } else {
        const updated = await updateWorkflow(id, { name });
        setRows((r) => r.map((x) => (x.id === id ? updated : x)));
      }
    } catch {
      // keep optimistic name even if server fails (LS fallback already saved)
      setRows((r) =>
        r.map((x) => (x.id === id ? { ...x, name, updatedAt: new Date().toISOString() } : x))
      );
    } finally {
      setBusy(null);
      setEditingId(null);
      setDraft("");
    }
  }

  // Cancel edit (optional: on ESC)
  function cancelEdit(id: string) {
    setEditingId(null);
    setDraft("");
    // if it was a temp row and user cleared the name entirely, remove it
    if (id.startsWith("tmp_")) {
      setRows((r) => r.filter((x) => x.id !== id));
    }
  }

  return (
    <div className="p-uploads" style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* Breadcrumbs */}
      <div className="crumbs" style={{ marginTop: 6, marginBottom: 8 }}>
        <NavLink className="crumb-back" to="/dashboard">← Dashboard</NavLink>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Workflows</span>
      </div>

      {/* Title row */}
      <div className="uploads-head">
        <div className="title" style={{ fontWeight: 700 }}>Your workflows</div>
        <div className="list-head-actions">
          <button className="btn-outline sm" onClick={onNew}>+ New workflow</button>
        </div>
      </div>

      {/* Card list */}
      <div className="card">
        <div className="card-head">All workflows</div>

        {loading ? (
          <div className="u-table">
            <div className="empty" style={{ padding: 20 }}>Loading…</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="u-table">
            <div className="empty" style={{ padding: 28 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <OutlineIcon d="M4 7h16M8 11h8M10 15h4" size={20} stroke="currentColor" />
                <span>No workflows yet — click <b>New workflow</b> to build your first automation.</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="u-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th className="right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((wf) => {
                  const isEditing = editingId === wf.id;
                  return (
                    <tr key={wf.id} onDoubleClick={() => {
                      setEditingId(wf.id);
                      setDraft(wf.name);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}>
                      <td className="file" style={{ maxWidth: 520 }}>
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            className="input"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(wf.id);
                              if (e.key === "Escape") cancelEdit(wf.id);
                            }}
                            onBlur={() => commitEdit(wf.id)}
                            disabled={busy === wf.id}
                            placeholder="Untitled workflow"
                            style={{ width: "100%" }}
                          />
                        ) : (
                          <div className="filecell" style={{ cursor: "text" }}>
                            <div className="fname">{wf.name}</div>
                            <div className="fmeta">Double-click to rename</div>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="pill" style={{ opacity: wf.status === "draft" ? 0.9 : 1 }}>
                          {wf.status}
                        </span>
                      </td>
                      <td className="right">
                        {new Date(wf.updatedAt || wf.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

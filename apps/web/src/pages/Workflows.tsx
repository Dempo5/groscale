import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import "./dashboard-ios.css";

type Workflow = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "DRAFT";
  steps: WorkflowStep[];
  createdAt: string;
};

type WorkflowStep = {
  id: string;
  order: number;
  type: "SEND_TEXT" | "WAIT";
  textBody?: string | null;
  waitMs?: number | null;
};

async function getJSON<T>(url: string) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}
async function postJSON<T>(url: string, body?: any, method = "POST") {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export default function Workflows() {
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<Workflow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => list.find(w => w.id === selectedId) || null,
    [list, selectedId]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await getJSON<{ ok: boolean; data: Workflow[] }>("/api/workflows");
      setList(res.data || []);
      if (!selectedId && res.data?.length) setSelectedId(res.data[0].id);
    } catch (e: any) {
      setErr(e?.message || "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function createWorkflow() {
    const name = prompt("Workflow name?");
    if (!name) return;
    try {
      const res = await postJSON<{ ok: boolean; data: Workflow }>("/api/workflows", { name });
      setList([res.data, ...list]);
      setSelectedId(res.data.id);
    } catch (e: any) {
      alert(e?.message || "Create failed");
    }
  }

  async function updateWorkflow(patch: Partial<Workflow>) {
    if (!selected) return;
    const res = await postJSON<{ ok: boolean; data: Workflow }>(
      `/api/workflows/${selected.id}`,
      patch,
      "PATCH"
    );
    setList(list.map(w => (w.id === selected.id ? res.data : w)));
  }

  async function addStep(type: "SEND_TEXT" | "WAIT") {
    if (!selected) return;
    if (type === "SEND_TEXT") {
      const textBody = prompt("Message text?");
      if (!textBody) return;
      await postJSON(`/api/workflows/${selected.id}/steps`, { type, textBody });
    } else {
      const min = prompt("Wait minutes? (e.g. 10)");
      const ms = Math.max(1, Number(min || "0")) * 60_000;
      await postJSON(`/api/workflows/${selected.id}/steps`, { type, waitMs: ms });
    }
    await load();
    setSelectedId(selected.id);
  }

  async function deleteStep(stepId: string) {
    if (!selected) return;
    if (!confirm("Delete this step?")) return;
    await postJSON(`/api/workflows/${selected.id}/steps/${stepId}`, undefined, "DELETE");
    await load();
    setSelectedId(selected.id);
  }

  return (
    <div className="p-uploads" style={{ maxWidth: 1060, margin: "0 auto" }}>
      <div className="crumbs" style={{ marginTop: 6, marginBottom: 8 }}>
        <NavLink to="/dashboard" className="crumb-back">← Dashboard</NavLink>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Workflows</span>
      </div>

      <div className="uploads-head">
        <div className="title">Workflows</div>
        <div className="list-head-actions">
          <button className="btn-outline sm" onClick={createWorkflow}>+ New</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
        {/* Left: list */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">Your workflows</div>
          <div className="table-wrap">
            <table className="u-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td className="empty" colSpan={2}>Loading…</td></tr>}
                {err && !loading && <tr><td className="empty" colSpan={2} style={{ color: "var(--danger)" }}>{err}</td></tr>}
                {!loading && !err && list.length === 0 && (
                  <tr><td className="empty" colSpan={2}>No workflows yet.</td></tr>
                )}
                {list.map(w => (
                  <tr
                    key={w.id}
                    className={w.id === selectedId ? "row selected" : "row"}
                    onClick={() => setSelectedId(w.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="file">
                      <div className="filecell">
                        <div className="fname">{w.name}</div>
                        <div className="fmeta">Updated {new Date(w.createdAt).toLocaleDateString()}</div>
                      </div>
                    </td>
                    <td>
                      <span className="pill" style={{
                        background: w.status === "ACTIVE" ? "rgba(16,185,129,.12)" :
                                   w.status === "PAUSED" ? "rgba(245,158,11,.12)" :
                                   "rgba(99,102,241,.12)",
                        color: w.status === "ACTIVE" ? "rgb(16,185,129)" :
                               w.status === "PAUSED" ? "rgb(217,119,6)" :
                               "rgb(99,102,241)"
                      }}>{w.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: editor */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">Editor</div>
          {!selected ? (
            <div className="empty">Select a workflow on the left.</div>
          ) : (
            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label className="hint">Name</label>
                <input
                  className="input"
                  value={selected.name}
                  onChange={(e) => updateWorkflow({ name: e.target.value })}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label className="hint">Status</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["DRAFT","ACTIVE","PAUSED"] as const).map(s => (
                    <button
                      key={s}
                      className={`chip ${selected.status === s ? "" : "ghost"}`}
                      onClick={() => updateWorkflow({ status: s })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="section-title" style={{ marginTop: 6 }}>Steps</div>
              <div className="table-wrap">
                <table className="u-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Config</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.steps.length === 0 && (
                      <tr><td className="empty" colSpan={4}>No steps yet.</td></tr>
                    )}
                    {selected.steps.map((s, i) => (
                      <tr key={s.id}>
                        <td className="num">{i + 1}</td>
                        <td>{s.type}</td>
                        <td>
                          {s.type === "SEND_TEXT" ? (
                            <div className="filecell">
                              <div className="fname">Message</div>
                              <div className="fmeta">{s.textBody}</div>
                            </div>
                          ) : (
                            <div className="filecell">
                              <div className="fname">Wait</div>
                              <div className="fmeta">{Math.round((s.waitMs || 0) / 60000)} min</div>
                            </div>
                          )}
                        </td>
                        <td className="right">
                          <button className="icon-btn ghost" onClick={() => deleteStep(s.id)} title="Delete">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-outline sm" onClick={() => addStep("SEND_TEXT")}>+ Send text</button>
                <button className="btn-outline sm" onClick={() => addStep("WAIT")}>+ Wait</button>
              </div>

              <div className="hint" style={{ marginTop: 6 }}>
                Trigger is <b>“New lead added”</b> by default. When active, GroScales will enqueue step 1 on each new lead.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// apps/web/src/pages/Workflows.tsx
// Workflows saved to the server (not the browser anymore).
// Steps: Send text / Wait. Tags linked on the Tags page start them.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createWorkflow, deleteWorkflow, listWorkflowsFull, replaceWorkflowSteps, updateWorkflow, type WfStep } from "../lib/api";
import { tagChipColors } from "../lib/tagColors";
import { fillVariables, smsInfo, VARIABLES } from "../lib/sms";
import "./split.css";

type Status = "ACTIVE" | "PAUSED" | "DRAFT";
type ServerStep = { id?: string; type: "SEND_TEXT" | "WAIT"; textBody?: string | null; waitMs?: number | null };
type ServerWorkflow = {
  id: string;
  name: string;
  status: string;
  steps?: ServerStep[];
  tags?: { id: string; name: string; color?: any }[];
};

// Local editing shape: waits are edited as amount + unit.
type EditStep =
  | { key: string; type: "SEND_TEXT"; text: string }
  | { key: string; type: "WAIT"; amount: number; unit: "hours" | "days" };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const key = () => Math.random().toString(36).slice(2);

function toEdit(steps: ServerStep[] = []): EditStep[] {
  return steps.map((s) => {
    if (s.type === "WAIT") {
      const ms = Number(s.waitMs || 0);
      return ms && ms % DAY === 0
        ? { key: key(), type: "WAIT", amount: ms / DAY, unit: "days" }
        : { key: key(), type: "WAIT", amount: Math.max(1, Math.round(ms / HOUR)), unit: "hours" };
    }
    return { key: key(), type: "SEND_TEXT", text: s.textBody || "" };
  });
}

function toServer(steps: EditStep[]): WfStep[] {
  return steps.map((s) =>
    s.type === "WAIT"
      ? { type: "WAIT", waitMs: Math.max(1, s.amount) * (s.unit === "days" ? DAY : HOUR) }
      : { type: "SEND_TEXT", textBody: s.text }
  );
}

const norm = (s: string): Status => {
  const u = String(s || "").toUpperCase();
  return u === "ACTIVE" || u === "PAUSED" ? u : "DRAFT";
};
const STATUS_LABEL: Record<Status, string> = { ACTIVE: "Active", PAUSED: "Paused", DRAFT: "Draft" };

const Icon = ({ d, size = 14 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const I = {
  text: "M21 12a8 8 0 0 1-11.6 7.2L4 20l.9-4.6A8 8 0 1 1 21 12z",
  wait: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
};

/* ====================================================================== */
export default function Workflows() {
  const [items, setItems] = useState<ServerWorkflow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [steps, setSteps] = useState<EditStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = items.find((w) => w.id === selectedId) || null;

  useEffect(() => {
    listWorkflowsFull()
      .then((res: any) => {
        const rows: ServerWorkflow[] = res?.data ?? res ?? [];
        setItems(rows);
        if (rows[0]) setSelectedId(rows[0].id);
      })
      .catch((e) => setError(e?.message || "Couldn't load workflows."))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    setName(selected?.name || "");
    setSteps(toEdit(selected?.steps));
    setDirty(false);
    setConfirmDelete(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // warn before leaving with unsaved steps
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  function patchItem(id: string, patch: Partial<ServerWorkflow>) {
    setItems((x) => x.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  function editSteps(next: EditStep[]) {
    setSteps(next);
    setDirty(true);
  }

  async function createNew() {
    setError(null);
    try {
      const w: any = await createWorkflow({ name: "Untitled workflow" });
      const row: ServerWorkflow = { ...w, steps: [], tags: [] };
      setItems((x) => [row, ...x]);
      setSelectedId(row.id);
      setSteps([{ key: key(), type: "SEND_TEXT", text: "Hi {first_name}, " }]);
      setDirty(true);
    } catch (e: any) {
      setError(e?.message || "Couldn't create a workflow.");
    }
  }

  async function saveName() {
    if (!selected || name.trim() === selected.name) return;
    try {
      await updateWorkflow(selected.id, { name: name.trim() || "Untitled workflow" });
      patchItem(selected.id, { name: name.trim() || "Untitled workflow" });
    } catch (e: any) {
      setError(e?.message || "Couldn't rename.");
    }
  }

  async function toggleActive() {
    if (!selected) return;
    const next: Status = norm(selected.status) === "ACTIVE" ? "PAUSED" : "ACTIVE";
    if (next === "ACTIVE" && !steps.some((s) => s.type === "SEND_TEXT" && s.text.trim())) {
      setError("Add at least one text before turning this on.");
      return;
    }
    try {
      await updateWorkflow(selected.id, { status: next.toLowerCase() as any });
      patchItem(selected.id, { status: next });
    } catch (e: any) {
      setError(e?.message || "Couldn't change status.");
    }
  }

  async function saveSteps() {
    if (!selected) return;
    if (steps.some((s) => s.type === "SEND_TEXT" && !s.text.trim())) {
      setError("One of your texts is empty. Write something or remove it.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res: any = await replaceWorkflowSteps(selected.id, toServer(steps));
      patchItem(selected.id, { steps: res?.data?.steps ?? toServer(steps) });
      setDirty(false);
    } catch (e: any) {
      setError(e?.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    try {
      await deleteWorkflow(selected.id);
      const rest = items.filter((w) => w.id !== selected.id);
      setItems(rest);
      setSelectedId(rest[0]?.id || null);
    } catch (e: any) {
      setError(e?.message || "Couldn't delete.");
    }
  }

  const status = selected ? norm(selected.status) : "DRAFT";
  const textCount = useMemo(() => steps.filter((s) => s.type === "SEND_TEXT").length, [steps]);

  return (
    <div className="gs-page">
      <div className="gs-page-panel sp">
        <aside className="sp-list">
          <div className="sp-list-head">
            <h1>Workflows</h1>
            <button className="gs-btn gs-btn--primary" onClick={createNew}>New</button>
          </div>
          {loaded && !items.length && (
            <p className="sp-empty">Automate follow-ups: a series of texts spaced out over days.</p>
          )}
          <div className="sp-items">
            {items.map((w) => {
              const st = norm(w.status);
              const n = (w.steps || []).filter((s) => s.type === "SEND_TEXT").length;
              return (
                <button
                  key={w.id}
                  className={`sp-item ${w.id === selectedId ? "is-active" : ""}`}
                  onClick={() => {
                    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
                    setSelectedId(w.id);
                  }}
                >
                  <span className="sp-item-top">
                    <span className="sp-item-name">{w.id === selectedId ? name || "Untitled" : w.name}</span>
                    <span className={`gs-chip wf-status is-${st.toLowerCase()}`}>{STATUS_LABEL[st]}</span>
                  </span>
                  <span className="sp-item-sub">
                    {n} text{n === 1 ? "" : "s"}
                    {w.tags?.length ? ` · starts from ${w.tags.map((t) => t.name).join(", ")}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="sp-main">
          <div className="wf-notice">
            Workflows don't send texts yet. You can build and save them now. The sending engine (each step on schedule,
            stopping when a lead replies or texts STOP) comes next.
          </div>

          {!selected ? (
            <div className="sp-placeholder">
              {loaded && (
                <>
                  <p>Pick a workflow, or make a new one.</p>
                  <button className="gs-btn gs-btn--primary" onClick={createNew}>New workflow</button>
                </>
              )}
            </div>
          ) : (
            <div className="sp-editor">
              <div className="sp-title-row">
                <input
                  className="sp-title"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  aria-label="Workflow name"
                />
                <span className="sp-title-actions">
                  <button
                    className={`wf-toggle ${status === "ACTIVE" ? "is-on" : ""}`}
                    role="switch"
                    aria-checked={status === "ACTIVE"}
                    onClick={toggleActive}
                  >
                    <span className="wf-toggle-track"><span className="wf-toggle-knob" /></span>
                    {status === "ACTIVE" ? "Active" : status === "PAUSED" ? "Paused" : "Off"}
                  </button>
                  {confirmDelete ? (
                    <>
                      <button className="gs-btn sp-danger" onClick={remove}>Delete</button>
                      <button className="gs-btn gs-btn--ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                    </>
                  ) : (
                    <button className="gs-btn gs-btn--ghost sp-delete" onClick={() => setConfirmDelete(true)}>Delete</button>
                  )}
                </span>
              </div>

              {error && <div className="sp-error">{error}</div>}

              <div className="wf-when">
                <span className="sp-label">Starts when</span>
                <span className="wf-when-line">
                  {selected.tags?.length ? (
                    <>
                      A lead gets the tag
                      {selected.tags.map((t) => {
                        const c = tagChipColors(t.color);
                        return (
                          <span key={t.id} className="gs-chip" style={{ background: c.bg, color: c.fg }}>{t.name}</span>
                        );
                      })}
                      <span className="sp-muted">or you pick it during an upload or new text</span>
                    </>
                  ) : (
                    <>
                      You pick it during an upload or new text.{" "}
                      <span className="sp-muted">
                        To start it from a tag, link it on the <Link to="/tags">Tags page</Link>.
                      </span>
                    </>
                  )}
                </span>
              </div>

              <ol className="wf-steps">
                {steps.map((s) => (
                  <li key={s.key} className={`wf-step is-${s.type === "WAIT" ? "wait" : "text"}`}>
                    <span className="wf-rail">
                      <span className="wf-node"><Icon d={s.type === "WAIT" ? I.wait : I.text} /></span>
                      <span className="wf-line" />
                    </span>
                    {s.type === "SEND_TEXT" ? (
                      <div className="wf-card">
                        <div className="wf-card-head">
                          <span>Send text</span>
                          <button className="wf-remove" aria-label="Remove step" onClick={() => editSteps(steps.filter((x) => x.key !== s.key))}>
                            <Icon d={I.x} size={13} />
                          </button>
                        </div>
                        <textarea
                          className="wf-text"
                          rows={2}
                          value={s.text}
                          placeholder="Hi {first_name}, …"
                          onChange={(e) =>
                            editSteps(steps.map((x) => (x.key === s.key ? { ...s, text: e.target.value } : x)))
                          }
                        />
                        <div className="wf-card-foot">
                          <span className="sp-muted">Preview: {fillVariables(s.text) || "…"}</span>
                          <span className="gs-mono sp-count">{smsInfo(fillVariables(s.text)).segments} seg</span>
                        </div>
                      </div>
                    ) : (
                      <div className="wf-wait">
                        Wait
                        <input
                          type="number"
                          min={1}
                          className="wf-num"
                          value={s.amount}
                          aria-label="Wait amount"
                          onChange={(e) =>
                            editSteps(steps.map((x) => (x.key === s.key ? { ...s, amount: Math.max(1, Number(e.target.value) || 1) } : x)))
                          }
                        />
                        <select
                          className="wf-unit"
                          value={s.unit}
                          aria-label="Wait unit"
                          onChange={(e) =>
                            editSteps(steps.map((x) => (x.key === s.key ? { ...s, unit: e.target.value as "hours" | "days" } : x)))
                          }
                        >
                          <option value="hours">{s.amount === 1 ? "hour" : "hours"}</option>
                          <option value="days">{s.amount === 1 ? "day" : "days"}</option>
                        </select>
                        <button className="wf-remove" aria-label="Remove wait" onClick={() => editSteps(steps.filter((x) => x.key !== s.key))}>
                          <Icon d={I.x} size={13} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                <li className="wf-step wf-add">
                  <span className="wf-rail"><span className="wf-node is-add"><Icon d={I.plus} /></span></span>
                  <div className="wf-add-btns">
                    <button className="gs-btn" onClick={() => editSteps([...steps, { key: key(), type: "SEND_TEXT", text: "" }])}>
                      Send text
                    </button>
                    <button className="gs-btn" onClick={() => editSteps([...steps, { key: key(), type: "WAIT", amount: 1, unit: "days" }])}>
                      Wait
                    </button>
                  </div>
                </li>
              </ol>

              <div className="wf-savebar">
                <span className="sp-muted">
                  {textCount} text{textCount === 1 ? "" : "s"} · variables: {VARIABLES.map((v) => `{${v}}`).join(" ")}
                </span>
                <button className="gs-btn gs-btn--primary" onClick={saveSteps} disabled={!dirty || saving}>
                  {saving ? "Saving…" : dirty ? "Save steps" : "Saved"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// apps/web/src/pages/Contacts.tsx
// Every lead in one place: search, filter by stage or tag, bulk actions,
// and a shortcut into the conversation.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTags, type TagDTO } from "../lib/api";
import { bulkStage, bulkTag, createLead, listLeads, openLeadThread, type LeadRow } from "../lib/leadsApi";
import { tagChipColors } from "../lib/tagColors";
import { STAGES, stageMeta } from "../lib/stages";
import "./contacts.css";

const Icon = ({ d, size = 15, w = 1.8 }: { d: string; size?: number; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const I = {
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5",
  text: "M21 12a8 8 0 0 1-11.6 7.2L4 20l.9-4.6A8 8 0 1 1 21 12z",
  x: "M6 6l12 12M18 6L6 18",
};

function formatPhone(p?: string | null) {
  const d = (p || "").replace(/\D+/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : p || "";
}

function whenLabel(iso?: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ---------------- add one lead ---------------- */
function AddLead({ onAdded, onCancel }: { onAdded: (l: LeadRow) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onAdded(await createLead({ name: name.trim(), phone: phone.trim(), email: email.trim() }));
    } catch (e: any) {
      setError(e?.message || "Couldn't add that lead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ct-add">
      <input className="gs-input" placeholder="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <input className="gs-input" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      <input className="gs-input" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="ct-add-actions">
        <button className="gs-btn gs-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="gs-btn gs-btn--primary" onClick={save} disabled={busy || !name.trim()}>Add</button>
      </div>
      {error && <div className="ct-error ct-add-error">{error}</div>}
    </div>
  );
}

/* ====================================================================== */
export default function Contacts() {
  const nav = useNavigate();

  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [tagId, setTagId] = useState("");
  const [tags, setTags] = useState<TagDTO[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [busyBulk, setBusyBulk] = useState(false);

  const searchTimer = useRef<number | null>(null);

  const load = useCallback(
    async (opts: { q: string; stage: string; tagId: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await listLeads(opts);
        setRows(res.data);
        setTotal(res.total);
        setCursor(res.nextCursor);
        setSelected(new Set());
      } catch (e: any) {
        setError(e?.message || "Couldn't load your contacts.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    getTags().then(setTags).catch(() => {});
  }, []);

  // reload when filters change; wait 300ms after typing stops
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => load({ q, stage, tagId }), q ? 300 : 0);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [q, stage, tagId, load]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await listLeads({ q, stage, tagId, cursor });
      setRows((x) => [...x, ...res.data]);
      setCursor(res.nextCursor);
    } catch (e: any) {
      setError(e?.message || "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function openThread(lead: LeadRow) {
    try {
      const threadId = lead.threadId || (await openLeadThread(lead.id));
      nav(`/dashboard?thread=${threadId}`);
    } catch (e: any) {
      setError(e?.message || "Couldn't open that conversation.");
    }
  }

  async function applyStage(next: string) {
    if (!next) return;
    setBusyBulk(true);
    try {
      await bulkStage([...selected], next);
      setRows((x) => x.map((r) => (selected.has(r.id) ? { ...r, stage: next } : r)));
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message || "Couldn't change those stages.");
    } finally {
      setBusyBulk(false);
    }
  }

  async function applyTag(id: string) {
    if (!id) return;
    const tag = tags.find((t) => t.id === id);
    setBusyBulk(true);
    try {
      await bulkTag([...selected], id);
      setRows((x) =>
        x.map((r) =>
          selected.has(r.id) && tag && !r.tags.some((t) => t.id === id) ? { ...r, tags: [...r.tags, tag] } : r
        )
      );
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message || "Couldn't add that tag.");
    } finally {
      setBusyBulk(false);
    }
  }

  const filtered = !!(q || stage || tagId);

  return (
    <div className="gs-page">
      <div className="gs-page-panel">
        <div className="ct">
          <header className="ct-head">
            <div>
              <h1>Contacts</h1>
              <p>
                {loading ? "Loading…" : `${total.toLocaleString()} lead${total === 1 ? "" : "s"}`}
                {filtered && !loading ? " match your filters" : ""}
              </p>
            </div>
            <button className="gs-btn gs-btn--primary ct-new" onClick={() => setAdding((a) => !a)}>
              Add lead
            </button>
          </header>

          {error && <div className="ct-error">{error}</div>}
          {adding && (
            <AddLead
              onCancel={() => setAdding(false)}
              onAdded={(l) => {
                setRows((x) => [l, ...x]);
                setTotal((t) => t + 1);
                setAdding(false);
              }}
            />
          )}

          <div className="ct-toolbar">
            <label className="ct-search">
              <Icon d={I.search} size={14} w={2} />
              <input
                placeholder="Search name, phone, or email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search contacts"
              />
              {q && (
                <button className="ct-clear" onClick={() => setQ("")} aria-label="Clear search">
                  <Icon d={I.x} size={12} w={2.2} />
                </button>
              )}
            </label>
            <select className="ct-select" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage">
              <option value="">All stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>{stageMeta(s).label}</option>
              ))}
            </select>
            <select className="ct-select" value={tagId} onChange={(e) => setTagId(e.target.value)} aria-label="Filter by tag">
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {selected.size > 0 && (
            <div className="ct-bulk">
              <span>{selected.size} selected</span>
              <select className="ct-select" value="" disabled={busyBulk} onChange={(e) => applyStage(e.target.value)} aria-label="Set stage">
                <option value="">Set stage…</option>
                {STAGES.map((s) => (
                  <option key={s} value={s}>{stageMeta(s).label}</option>
                ))}
              </select>
              <select className="ct-select" value="" disabled={busyBulk || !tags.length} onChange={(e) => applyTag(e.target.value)} aria-label="Add tag">
                <option value="">Add tag…</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button className="gs-btn gs-btn--ghost" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          <div className="ct-table">
            <div className="ct-row ct-row--head">
              <span>
                <input
                  type="checkbox"
                  checked={allShownSelected}
                  onChange={() => setSelected(allShownSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  aria-label="Select all shown"
                />
              </span>
              <span>Name</span>
              <span>Stage</span>
              <span>Tags</span>
              <span>Last text</span>
              <span />
            </div>

            {!loading && !rows.length && (
              <p className="ct-empty">
                {filtered ? "No contacts match those filters." : "No contacts yet. Upload a CSV or add one by hand."}
              </p>
            )}

            {rows.map((l) => {
              const sm = stageMeta(l.stage);
              return (
                <div key={l.id} className={`ct-row ${selected.has(l.id) ? "is-selected" : ""}`}>
                  <span>
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={() => toggle(l.id)}
                      aria-label={`Select ${l.name}`}
                    />
                  </span>
                  <span className="ct-name">
                    <span className="ct-name-main">{l.name}</span>
                    <span className="ct-name-sub gs-mono">{formatPhone(l.phone) || l.email || "No contact info"}</span>
                  </span>
                  <span>
                    <span className="gs-chip ct-stage" style={{ background: sm.bg, color: sm.fg }}>{sm.label}</span>
                  </span>
                  <span className="ct-tags">
                    {l.tags.slice(0, 2).map((t) => {
                      const c = tagChipColors(t.color as any);
                      return (
                        <span key={t.id} className="gs-chip" style={{ background: c.bg, color: c.fg }}>{t.name}</span>
                      );
                    })}
                    {l.tags.length > 2 && <span className="ct-more">+{l.tags.length - 2}</span>}
                  </span>
                  <span className="ct-when">{whenLabel(l.lastMessageAt)}</span>
                  <span className="ct-actions">
                    <button className="gs-btn ct-text" onClick={() => openThread(l)} disabled={!l.phone} title={l.phone ? "Open conversation" : "No phone number"}>
                      <Icon d={I.text} size={13} />
                      Text
                    </button>
                  </span>
                </div>
              );
            })}

            {cursor && (
              <button className="gs-btn ct-more-btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Load more (${(total - rows.length).toLocaleString()} left)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// apps/webapp/src/pages/Templates.tsx
import { useEffect, useState } from "react";

type Template = { id: string; name: string; body: string };

export default function Templates() {
  const [items, setItems] = useState<Template[]>([]);
  const [draft, setDraft] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/templates", { credentials: "include" });
        if (res.ok) setItems(await res.json());
      } catch {
        setErr("Failed to load templates");
      }
    })();
  }, []);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setErr(null);
    try {
      const method = draft.id ? "PATCH" : "POST";
      const url = draft.id ? `/api/templates/${draft.id}` : "/api/templates";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, body: draft.body }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      setItems(s =>
        s.some(t => t.id === saved.id)
          ? s.map(t => (t.id === saved.id ? saved : t))
          : [saved, ...s]
      );
      setDraft(saved);
    } catch (e: any) {
      setErr(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this template?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setItems(s => s.filter(t => t.id !== id));
      setDraft(null);
    } catch (e: any) {
      setErr(e.message || "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page templates">
      <div className="header">
        <h1>Templates</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setDraft({ id: "", name: "New template", body: "" })}>
          + New template
        </button>
      </div>

      {err && <div className="err">{err}</div>}

      <div className="grid">
        <aside className="list">
          {items.map(t => (
            <button key={t.id} className={`row ${draft?.id === t.id ? "sel" : ""}`} onClick={() => setDraft(t)}>
              {t.name}
            </button>
          ))}
          {!items.length && <div className="empty">No templates yet</div>}
        </aside>

        <section className="editor">
          {!draft ? (
            <div className="hint">Select or create a template</div>
          ) : (
            <div className="editor-inner">
              <input
                className="input name"
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
              />
              <textarea
                className="input body"
                value={draft.body}
                onChange={e => setDraft({ ...draft, body: e.target.value })}
                placeholder="Hi {{first_name}}, …"
              />
              <div className="actions">
                {draft.id && (
                  <button className="btn danger" onClick={() => del(draft.id)} disabled={busy}>
                    Delete
                  </button>
                )}
                <div className="spacer" />
                <button className="btn" onClick={save} disabled={busy}>
                  Save
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <style>{`
        .page.templates { padding:16px }
        .header { display:flex; align-items:center; gap:12px }
        .spacer { flex:1 }
        .btn { background: var(--accent,#10b981); color:#fff; border:0; border-radius:10px; padding:8px 12px; cursor:pointer }
        .btn.danger { background:#ef4444 }
        .grid { display:grid; grid-template-columns: 300px 1fr; gap:16px; margin-top:12px }
        .list { border:1px solid #e5e7eb; border-radius:12px; background:#fff; padding:6px }
        .row { width:100%; text-align:left; border:0; background:#fff; padding:10px; border-radius:8px; cursor:pointer }
        .row.sel, .row:hover { background:#f9fafb }
        .editor { border:1px solid #e5e7eb; border-radius:12px; background:#fff; padding:12px }
        .editor-inner { display:grid; gap:10px }
        .input { width:100%; border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px }
        .name { height:36px }
        .body { min-height:260px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace }
        .actions { display:flex; align-items:center; gap:8px }
        .err { background:#fef2f2; border:1px solid #fee2e2; color:#991b1b; padding:8px 10px; border-radius:8px; margin-top:10px }
      `}</style>
    </div>
  );
}

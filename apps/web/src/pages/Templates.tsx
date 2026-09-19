// apps/web/src/pages/Templates.tsx
// Saved messages with {variables}, a live preview, and autosave.
import { useEffect, useRef, useState } from "react";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate, type TemplateDTO } from "../lib/api";
import { fillVariables, smsInfo, splitVariables, VARIABLES } from "../lib/sms";
import "./split.css";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Templates() {
  const [items, setItems] = useState<TemplateDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const timer = useRef<number | null>(null);
  const skipNextSave = useRef(true);

  const selected = items.find((t) => t.id === selectedId) || null;

  useEffect(() => {
    listTemplates()
      .then((rows) => {
        setItems(rows);
        if (rows[0]) setSelectedId(rows[0].id);
      })
      .catch((e) => setError(e?.message || "Couldn't load templates."))
      .finally(() => setLoaded(true));
  }, []);

  // load the selected template into the editor
  useEffect(() => {
    skipNextSave.current = true;
    setName(selected?.name || "");
    setBody(selected?.body || "");
    setSave("idle");
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // autosave 700ms after typing stops
  useEffect(() => {
    if (!selectedId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      if (!name.trim() || !body.trim()) {
        setSave("error");
        setError(!name.trim() ? "Give the template a name." : "The message can't be empty.");
        return;
      }
      setSave("saving");
      setError(null);
      try {
        const t = await updateTemplate(selectedId, { name: name.trim(), body });
        setItems((x) => x.map((y) => (y.id === t.id ? { ...y, ...t } : y)));
        setSave("saved");
      } catch (e: any) {
        setSave("error");
        setError(
          /unique/i.test(e?.message || "") ? "You already have a template with that name." : e?.message || "Couldn't save."
        );
      }
    }, 700);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [name, body, selectedId]);

  async function createNew() {
    setError(null);
    const used = new Set(items.map((t) => t.name));
    let n = 1;
    while (used.has(n === 1 ? "Untitled template" : `Untitled template ${n}`)) n++;
    try {
      const t = await createTemplate({
        name: n === 1 ? "Untitled template" : `Untitled template ${n}`,
        body: "Hi {first_name}, ",
      });
      setItems((x) => [t, ...x]);
      setSelectedId(t.id);
      requestAnimationFrame(() => bodyRef.current?.focus());
    } catch (e: any) {
      setError(e?.message || "Couldn't create a template.");
    }
  }

  async function remove() {
    if (!selectedId) return;
    try {
      await deleteTemplate(selectedId);
      const rest = items.filter((t) => t.id !== selectedId);
      setItems(rest);
      setSelectedId(rest[0]?.id || null);
    } catch (e: any) {
      setError(e?.message || "Couldn't delete.");
    }
  }

  function insertVariable(v: string) {
    const el = bodyRef.current;
    const token = `{${v}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const sms = smsInfo(fillVariables(body));

  return (
    <div className="gs-page">
      <div className="gs-page-panel sp">
        <aside className="sp-list">
          <div className="sp-list-head">
            <h1>Templates</h1>
            <button className="gs-btn gs-btn--primary" onClick={createNew}>New</button>
          </div>
          {loaded && !items.length && (
            <p className="sp-empty">Save messages you send often, like a first touch or a quote follow-up.</p>
          )}
          <div className="sp-items">
            {items.map((t) => (
              <button
                key={t.id}
                className={`sp-item ${t.id === selectedId ? "is-active" : ""}`}
                onClick={() => setSelectedId(t.id)}
              >
                <span className="sp-item-name">{t.id === selectedId ? name || "Untitled" : t.name}</span>
                <span className="sp-item-sub">{(t.id === selectedId ? body : t.body) || "Empty"}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="sp-main">
          {!selected ? (
            <div className="sp-placeholder">
              {loaded && (
                <>
                  <p>Pick a template, or make a new one.</p>
                  <button className="gs-btn gs-btn--primary" onClick={createNew}>New template</button>
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
                  aria-label="Template name"
                  placeholder="Template name"
                />
                <span className="sp-title-actions">
                  <span className={`sp-save ${save === "error" ? "is-error" : ""}`}>
                    {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Not saved" : ""}
                  </span>
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

              <div className="sp-body">
                <textarea
                  ref={bodyRef}
                  className="sp-textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  aria-label="Message"
                  placeholder="Hi {first_name}, …"
                />
                <div className="sp-body-bar">
                  <div className="sp-vars">
                    <span className="sp-label">Insert</span>
                    {VARIABLES.map((v) => (
                      <button key={v} className="sp-var" onClick={() => insertVariable(v)}>{`{${v}}`}</button>
                    ))}
                  </div>
                  <span className="gs-mono sp-count">
                    {sms.len} / {sms.limit} · {sms.segments} segment{sms.segments > 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <div className="sp-preview">
                <span className="sp-label">Preview with a sample lead</span>
                <div className="sp-bubble">
                  {body.trim() ? fillVariables(body) : "Your message will appear here."}
                </div>
                {splitVariables(body).some((p) => p.isVar && !VARIABLES.includes(p.text.slice(1, -1) as any)) && (
                  <span className="sp-warn">
                    One of your {"{variables}"} isn't recognized, so it will be sent exactly as typed.
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

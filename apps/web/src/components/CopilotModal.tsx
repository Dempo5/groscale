import { useEffect, useRef, useState } from "react";
import { copilotDraft } from "../lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CopilotModal({ open, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const dlgRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Track the latest request so older responses can't overwrite newer ones
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Focus textarea when modal opens; reset when it closes
  useEffect(() => {
    if (open) {
      setTimeout(() => taRef.current?.focus(), 0);
    } else {
      setError(null);
      setPrompt("");
      setAnswer("");
      setLoading(false);
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  // Basic focus trap (first/last focusable in the dialog)
  useEffect(() => {
    if (!open) return;

    const focusables = () => {
      if (!dlgRef.current) return [] as HTMLElement[];
      const sel = dlgRef.current.querySelectorAll<HTMLElement>(
        "button, [href], textarea, input, select, [tabindex]:not([tabindex='-1'])"
      );
      return Array.from(sel).filter(el => !el.hasAttribute("disabled"));
    };

    const onKey = (e: KeyboardEvent) => {
      if (loading) {
        // prevent closing while loading (ESC)
        if (e.key === "Escape") e.preventDefault();
      } else if (e.key === "Escape") {
        onClose();
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  // Clear previous answer when user edits the prompt (optional UX)
  useEffect(() => {
    setAnswer("");
    setError(null);
  }, [prompt]);

  // Backdrop click (disabled while loading)
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (loading) return;
    if (e.target === dlgRef.current) onClose();
  };

  // Cmd/Ctrl+Enter to submit
  const onKeyDownTA = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      ask();
    }
  };

  // Ask backend for a draft
  const ask = async () => {
    const q = prompt.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setAnswer("");

    // Cancel any previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const myReqId = ++reqIdRef.current;

    try {
      // Optionally pass { signal: controller.signal } through your api helper
      const data = await copilotDraft({ lastMessage: q, tone: "friendly" });

      // Ignore if an older request finishes after a newer one was started
      if (reqIdRef.current !== myReqId) return;

      if (!data?.ok) {
        throw new Error(data?.error || "Copilot failed");
      }
      setAnswer((data.draft || "").trim());
    } catch (err: any) {
      if (controller.signal.aborted) return; // closed or resubmitted
      setError(err?.message || "Request failed");
    } finally {
      if (reqIdRef.current === myReqId) setLoading(false);
    }
  };

  // Clipboard helper (defensive)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answer);
    } catch {
      // fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = answer;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={dlgRef}
      onMouseDown={onBackdropClick}
      className="gs-copilot-modal"
      aria-modal="true"
      role="dialog"
      aria-labelledby="gs-copilot-title"
    >
      <div className="gs-copilot-card">
        {/* Header */}
        <div className="gs-copilot-head">
          <div id="gs-copilot-title" className="gs-copilot-title">AI Copilot</div>
          <button
            ref={closeBtnRef}
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Prompt */}
        <label className="gs-label">Ask anything about your lead or message tone</label>
        <textarea
          ref={taRef}
          className="gs-textarea"
          rows={5}
          placeholder="e.g., Write a friendly follow-up SMS asking about their preferred call time."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDownTA}
          disabled={loading}
        />

        {/* Actions */}
        <div className="gs-actions">
          <button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn-primary" onClick={ask} disabled={loading || !prompt.trim()}>
            {loading ? "Thinking…" : "Ask Copilot"}
          </button>
        </div>

        {/* Error */}
        {error && <div className="gs-error">{error}</div>}

        {/* Answer */}
        {answer && (
          <div className="gs-answer">
            <div className="gs-answer-label">Suggestion</div>
            <pre className="gs-answer-pre">{answer}</pre>
            <div className="gs-answer-actions">
              <button className="btn-outline" onClick={copy}>Copy</button>
            </div>
          </div>
        )}
      </div>

      {/* Styles unchanged */}
      <style>{`
        .gs-copilot-modal{
          position: fixed; inset: 0; z-index: 60;
          background: rgba(0,0,0,.25);
          display: grid; place-items: center;
        }
        .gs-copilot-card{
          width: min(720px, 92vw);
          background: var(--surface-1);
          border: 1px solid var(--line);
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,.14);
          padding: 14px;
        }
        .gs-copilot-head{
          display:flex; align-items:center; justify-content:space-between;
          padding: 2px 0 8px; border-bottom: 1px solid var(--line);
          margin-bottom: 10px;
        }
        .gs-copilot-title{ font-weight:750; }
        .gs-label{ display:block; font-size:12px; color: var(--text-secondary); margin: 6px 0; }
        .gs-textarea{
          width:100%;
          border:1px solid var(--line);
          background: var(--surface-1);
          color: inherit;
          border-radius: 10px;
          padding: 10px 12px;
          outline: none;
          resize: vertical;
          min-height: 120px;
          transition: box-shadow .15s, border-color .15s;
        }
        .gs-textarea:focus{
          border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
        }
        .gs-actions{ display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
        .gs-error{
          margin-top:10px; color:#b91c1c;
          background: color-mix(in srgb, #ef4444 12%, var(--surface-1));
          border:1px solid color-mix(in srgb, #ef4444 40%, var(--line));
          padding:8px 10px; border-radius:10px;
        }
        .gs-answer{ margin-top:12px; border-top:1px solid var(--line); padding-top:10px; }
        .gs-answer-label{ font-weight:700; margin-bottom:6px; }
        .gs-answer-pre{
          margin:0; white-space:pre-wrap; line-height:1.45;
          border:1px solid var(--line); border-radius:10px; padding:10px 12px;
          background: color-mix(in srgb, var(--surface-1) 96%, var(--line));
        }
        .gs-answer-actions{ margin-top:8px; display:flex; justify-content:flex-end; }
      `}</style>
    </div>
  );
}

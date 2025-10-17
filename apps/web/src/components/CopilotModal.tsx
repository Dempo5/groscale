import { useEffect, useRef, useState } from "react";

/**
 * Props:
 *  - open: controls visibility
 *  - onClose: called when ESC, backdrop click, or Close button
 */
type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CopilotModal({ open, onClose }: Props) {
  const [prompt, setPrompt] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const dlgRef = useRef<HTMLDivElement | null>(null);

  // Focus textarea when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => taRef.current?.focus(), 0);
    } else {
      // reset transient error state when fully closed
      setError(null);
    }
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Backdrop click (ignore clicks inside card)
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === dlgRef.current) onClose();
  };

  const ask = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer("");

    try {
      // call your server route
      const res = await fetch("/api/copilot/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        credentials: "include",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as { ok: boolean; answer?: string; error?: string };
      if (!data.ok) throw new Error(data.error || "Copilot failed");
      setAnswer(data.answer || "");
    } catch (err: any) {
      setError(err?.message || "Request failed");
    } finally {
      setLoading(false);
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
    >
      <div className="gs-copilot-card">
        {/* Header */}
        <div className="gs-copilot-head">
          <div className="gs-copilot-title">AI Copilot</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            {/* X icon */}
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
        />

        {/* Actions */}
        <div className="gs-actions">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
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
              <button
                className="btn-outline"
                onClick={() => navigator.clipboard.writeText(answer).catch(() => {})}
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lightweight styles that match your existing theme tokens */}
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
        .gs-actions{
          display:flex; gap:8px; justify-content:flex-end; margin-top:10px;
        }
        .gs-error{
          margin-top:10px; color:#b91c1c;
          background: color-mix(in srgb, #ef4444 12%, var(--surface-1));
          border:1px solid color-mix(in srgb, #ef4444 40%, var(--line));
          padding:8px 10px; border-radius:10px;
        }
        .gs-answer{
          margin-top:12px; border-top:1px solid var(--line); padding-top:10px;
        }
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
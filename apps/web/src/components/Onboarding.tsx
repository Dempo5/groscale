// apps/web/src/components/Onboarding.tsx
// Setup guide shown in the Inbox until the account has its first conversation.
// Each step checks real data: numbers you own and leads you've uploaded.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLeads, listMyNumbers } from "../lib/api";
import "./onboarding.css";

type StepState = "done" | "current" | "waiting" | "todo" | "locked";

const Icon = ({ d, size = 12, width = 2.4 }: { d: string; size?: number; width?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

const CHECK = "M20 6L9 17l-5-5";
const LOCK = "M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3";

function formatPhone(p?: string | null) {
  const d = (p || "").replace(/\D+/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : p || "";
}

export default function Onboarding({ onNewText }: { onNewText: () => void }) {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [number, setNumber] = useState<string | null>(null);
  const [leadCount, setLeadCount] = useState(0);

  useEffect(() => {
    (async () => {
      const [nums, leads] = await Promise.allSettled([listMyNumbers(), getLeads()]);
      if (nums.status === "fulfilled") {
        const rows = nums.value?.data || [];
        const def = rows.find((r: any) => r.isDefault) || rows[0];
        setNumber(def?.number || null);
      }
      if (leads.status === "fulfilled") {
        setLeadCount(Array.isArray(leads.value) ? leads.value.length : 0);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  const hasNumber = !!number;
  const hasLeads = leadCount > 0;

  // Business verification (10DLC) isn't wired to Twilio yet, so it never
  // counts as done. It doesn't block texting until that backend exists.
  const verified = false;

  const states: Record<"verify" | "number" | "leads" | "text", StepState> = {
    verify: verified ? "done" : "todo",
    number: hasNumber ? "done" : "current",
    leads: hasLeads ? "done" : hasNumber ? "current" : "todo",
    text: hasNumber && hasLeads ? "current" : "locked",
  };

  const doneCount = [verified, hasNumber, hasLeads].filter(Boolean).length;
  const total = 4;

  return (
    <div className="gs-onb">
      <header className="gs-onb-head">
        <h1>You're a few steps away from texting your first lead</h1>
        <p>Complete these steps to start texting leads.</p>
        <div className="gs-onb-progress">
          <div className="gs-onb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}>
            <div style={{ width: `${(doneCount / total) * 100}%` }} />
          </div>
          <span>
            {doneCount} of {total} completed
          </span>
        </div>
      </header>

      <ol className="gs-onb-steps">
        {/* 1. Business verification (10DLC) */}
        <li className="gs-onb-row">
          <span className="gs-onb-dot is-todo">1</span>
          <div className="gs-onb-text">
            <span className="gs-onb-title">Verify your business for texting</span>
            <span className="gs-onb-sub">
              Carriers require every business to register before texting leads. Review usually takes a few days.
            </span>
          </div>
          <span className="gs-onb-badge">Coming soon</span>
        </li>

        {/* 2. Phone number */}
        {states.number === "done" ? (
          <li className="gs-onb-row">
            <span className="gs-onb-dot is-done">
              <Icon d={CHECK} />
            </span>
            <div className="gs-onb-text">
              <span className="gs-onb-title is-quiet">Phone number added</span>
              <span className="gs-onb-sub">
                Your number: <span className="gs-mono">{formatPhone(number)}</span>
              </span>
            </div>
          </li>
        ) : (
          <li className="gs-onb-current">
            <div className="gs-onb-current-top">
              <span className="gs-onb-dot is-current">2</span>
              <div className="gs-onb-text">
                <span className="gs-onb-title is-big">Get a phone number</span>
                <span className="gs-onb-sub is-strong">Pick a local number. It's what your leads see when you text them.</span>
              </div>
            </div>
            <div className="gs-onb-actions">
              <button className="gs-btn gs-btn--primary gs-onb-cta" onClick={() => nav("/phone-numbers")}>
                Get a number
              </button>
            </div>
          </li>
        )}

        {/* 3. Leads */}
        {states.leads === "done" ? (
          <li className="gs-onb-row">
            <span className="gs-onb-dot is-done">
              <Icon d={CHECK} />
            </span>
            <div className="gs-onb-text">
              <span className="gs-onb-title is-quiet">Leads uploaded</span>
              <span className="gs-onb-sub">
                {leadCount.toLocaleString()} lead{leadCount === 1 ? "" : "s"} ready to text
              </span>
            </div>
          </li>
        ) : states.leads === "current" ? (
          <li className="gs-onb-current">
            <div className="gs-onb-current-top">
              <span className="gs-onb-dot is-current">3</span>
              <div className="gs-onb-text">
                <span className="gs-onb-title is-big">Upload your leads</span>
                <span className="gs-onb-sub is-strong">
                  Import a CSV from your lead vendor. Duplicates and bad numbers are skipped automatically.
                </span>
              </div>
            </div>
            <div className="gs-onb-actions">
              <button className="gs-btn gs-btn--primary gs-onb-cta" onClick={() => nav("/uploads")}>
                Upload CSV
              </button>
              <button className="gs-btn gs-btn--ghost gs-onb-cta" onClick={onNewText}>
                Add one lead manually
              </button>
            </div>
          </li>
        ) : (
          <li className="gs-onb-row is-muted">
            <span className="gs-onb-dot is-todo">3</span>
            <div className="gs-onb-text">
              <span className="gs-onb-title">Upload your leads</span>
              <span className="gs-onb-sub">Import a CSV from your lead vendor.</span>
            </div>
          </li>
        )}

        {/* 4. First text */}
        {states.text === "current" ? (
          <li className="gs-onb-current">
            <div className="gs-onb-current-top">
              <span className="gs-onb-dot is-current">4</span>
              <div className="gs-onb-text">
                <span className="gs-onb-title is-big">Send your first text</span>
                <span className="gs-onb-sub is-strong">Start a conversation with a lead, or text yourself to try it out.</span>
              </div>
            </div>
            <div className="gs-onb-actions">
              <button className="gs-btn gs-btn--primary gs-onb-cta" onClick={onNewText}>
                New text
              </button>
            </div>
          </li>
        ) : (
          <li className="gs-onb-row is-muted">
            <span className="gs-onb-dot is-locked">
              <Icon d={LOCK} size={13} width={2} />
            </span>
            <div className="gs-onb-text">
              <span className="gs-onb-title">Send your first text</span>
              <span className="gs-onb-sub">Unlocks after you have a number and leads</span>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}

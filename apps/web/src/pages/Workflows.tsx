// apps/web/src/pages/Workflows.tsx
import { NavLink } from "react-router-dom";

const OutlineIcon = ({
  d,
  size = 24,
  stroke = "currentColor",
}: {
  d: string;
  size?: number;
  stroke?: string;
}) => (
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
  // Keep the same page shell layout used across uploads/phone numbers
  return (
    <div className="p-uploads" style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* Breadcrumbs (same visual language, no color changes) */}
      <div className="crumbs" style={{ marginTop: 6, marginBottom: 8 }}>
        <NavLink to="/dashboard" className="crumb-back">← Dashboard</NavLink>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Workflows</span>
      </div>

      {/* Title row – keep position, slightly bolder via existing weight */}
      <div className="uploads-head">
        <div className="title" style={{ fontWeight: 700 }}>Your workflows</div>
        <div className="list-head-actions">
          <button className="btn-outline sm wf-new-btn">+ New workflow</button>
        </div>
      </div>

      {/* Card container – reuse your card look */}
      <div className="card">
        <div className="card-head">Workflows</div>

        {/* Empty state: icon + message. No new colors; uses var(--muted)/var(--ink). */}
        <div className="wf-empty" role="status" aria-live="polite">
          {/* Minimal “automation/flow” icon */}
          <OutlineIcon
            d="M4 6h6v4H4V6zm10 8h6v4h-6v-4zM10 8h4m-2 0v8"
            size={40}
          />
          <div className="wf-empty-title">No workflows yet</div>
          <div className="wf-empty-sub">
            No workflows yet — click <b>New Workflow</b> to build your first automation.
          </div>
        </div>
      </div>
    </div>
  );
}

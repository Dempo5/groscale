import { useState } from "react";
import { NavLink } from "react-router-dom";

export default function Workflows() {
  // keep super simple for now – wire up later
  const [items] = useState<any[]>([]);

  return (
    <div className="p-uploads" style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* breadcrumbs */}
      <div className="crumbs" style={{ marginTop: 6, marginBottom: 8 }}>
        <NavLink className="crumb-back" to="/dashboard">← Dashboard</NavLink>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Workflows</span>
      </div>

      {/* header */}
      <div className="uploads-head">
        <div className="title wf-title">Your workflows</div>
        <div>
          {/* keep position — just adds a subtle hover via .wf-new */}
          <button className="btn-outline sm wf-new">+ New workflow</button>
        </div>
      </div>

      {/* card */}
      <div className="card">
        <div className="card-head">Workflows</div>

        {items.length === 0 ? (
          <div className="wf-empty">
            {/* neutral minimal icon */}
            <svg
              className="wf-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="3" width="7" height="7" rx="2"></rect>
              <rect x="14" y="3" width="7" height="7" rx="2"></rect>
              <rect x="3" y="14" width="7" height="7" rx="2"></rect>
              <path d="M10 7h4M7 10v4M17.5 10.5l-4.5 4.5M17 14v4"></path>
            </svg>

            <div className="wf-line1">No workflows yet</div>
            <div className="wf-line2">
              Click <b>New workflow</b> to build your first automation.
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            {/* Your list will go here later; keeping structure consistent */}
            <table className="u-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trigger</th>
                  <th>Steps</th>
                  <th className="right">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* placeholder until you wire data */}
                <tr>
                  <td className="empty" colSpan={4}>Loading…</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
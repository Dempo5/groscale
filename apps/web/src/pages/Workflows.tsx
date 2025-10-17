// apps/web/src/pages/Workflows.tsx
import { NavLink } from "react-router-dom";
import "./dashboard-ios.css";

export default function Workflows() {
  return (
    <div className="p-uploads" style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* breadcrumbs */}
      <div className="crumbs" style={{ marginTop: 6, marginBottom: 8 }}>
        <NavLink className="crumb-back" to="/dashboard">← Dashboard</NavLink>
        <span className="crumb-sep">›</span>
        <span className="crumb-here">Workflows</span>
      </div>

      {/* title */}
      <div className="uploads-head">
        <div className="title">Workflows</div>
      </div>

      {/* card: empty state */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="card-head" style={{ borderBottom: "none", padding: 0 }}>Your workflows</div>
          <button className="btn">+ New workflow</button>
        </div>

        <div className="table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Steps</th>
                <th>Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="empty" colSpan={4}>
                  <span className="empty-icon" aria-hidden>🗂️</span>
                  No workflows yet. Click “New workflow” to create one.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// apps/web/src/pages/AppShell.tsx
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import Dashboard from "./Dashboard";
import Uploads from "./Uploads";

const nav = [
  { to: "/dashboard", label: "Contacts", icon: "person" },
  { to: "/workflows", label: "Workflows", icon: "list" }, // (placeholder route)
  { to: "/numbers", label: "Phone numbers", icon: "dial" }, // (placeholder)
  { to: "/tags", label: "Tags", icon: "tag" }, // (placeholder)
  { to: "/templates", label: "Templates", icon: "doc" }, // (placeholder)
  { to: "/uploads", label: "Uploads", icon: "upload" },
];

export default function AppShell() {
  return (
    <BrowserRouter>
      <div className="p-shell">
        <main className="p-work">
          {/* Left sidebar */}
          <nav className="leftnav">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <span className="ico" aria-hidden>•</span>
                <span className="txt">{n.label}</span>
              </NavLink>
            ))}
            <div className="nav-spacer" />
            <div className="nav-item" title="Settings">⚙️</div>
          </nav>

          {/* Routed content */}
          <div className="content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/uploads" element={<Uploads />} />
              {/* stub routes so sidebar links don’t 404 while you build them */}
              <Route path="/workflows" element={<div className="p-6 text-sm">Workflows (coming soon)</div>} />
              <Route path="/numbers"   element={<div className="p-6 text-sm">Phone numbers (coming soon)</div>} />
              <Route path="/tags"      element={<div className="p-6 text-sm">Tags (coming soon)</div>} />
              <Route path="/templates" element={<div className="p-6 text-sm">Templates (coming soon)</div>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

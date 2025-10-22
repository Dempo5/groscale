// apps/web/src/pages/AppShell.tsx
import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";
import "../pages/dashboard-ios.css";

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="p-shell">
      {/* Top bar */}
      <header className="p-topbar_matte">
        <div className="brand-center">GroScales</div>
      </header>

      <div className="p-body">
        {/* Sidebar */}
        <aside className="p-side">
          <nav className="p-nav">
            <Section title=" " />
            <Item to="/dashboard" icon="💬" label="Conversations" />
            <Item to="/workflows" icon="⚙️" label="Workflows" />
            <Item to="/phone-numbers" icon="📱" label="Phone numbers" />
            <Item to="/tags" icon="🏷️" label="Tags" />
            <Item to="/templates" icon="🧩" label="Templates" />
            <Item to="/uploads" icon="⤴️" label="Uploads" />
          </nav>
          <div className="p-sideFooter">
            <span className="muted">Settings</span>
          </div>
        </aside>

        {/* Main content */}
        <main className="p-main">{children}</main>
      </div>

      <style>{`
        .p-shell{display:grid;grid-template-rows:56px 1fr;height:100vh;background:#f6f7fb}
        .p-topbar_matte{display:grid;align-items:center;border-bottom:1px solid #e5e7eb;background:#fff}
        .brand-center{justify-self:center;font-weight:700}
        .p-body{display:grid;grid-template-columns:260px 1fr;min-height:0}
        .p-side{border-right:1px solid #e5e7eb;background:#fff;display:flex;flex-direction:column}
        .p-nav{padding:8px}
        .sec{margin:10px 8px 6px;font-size:12px;color:#6b7280}
        .item{display:flex;gap:10px;align-items:center;padding:10px;border-radius:8px;color:#111827;text-decoration:none}
        .item:hover{background:#f3f4f6}
        .item.active{background:#ecfeff;border:1px solid #bae6fd}
        .p-sideFooter{margin-top:auto;padding:10px 12px;border-top:1px solid #e5e7eb}
        .muted{color:#6b7280;font-size:12px}
        .p-main{padding:12px;overflow:auto}
      `}</style>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return <div className="sec">{title}</div>;
}
function Item({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `item ${isActive ? "active" : ""}`}
      end={to === "/dashboard"}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

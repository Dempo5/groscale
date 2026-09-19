// apps/web/src/components/Sidebar.tsx
// One sidebar shared by every logged-in page. Collapses to an icon rail.
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { logout } from "../lib/api";
import "./sidebar.css";

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  workflows: "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9v3a3 3 0 0 0 3 3h6",
  tags: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  templates: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h8M8 12h8M8 16h5",
  phone: "M8.5 2h7A2.5 2.5 0 0 1 18 4.5v15a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 19.5v-15A2.5 2.5 0 0 1 8.5 2zM11 18h2",
  uploads: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  collapse: "M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM9 4v16",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

const SECONDARY = [
  { to: "/workflows", label: "Workflows", icon: ICONS.workflows },
  { to: "/tags", label: "Tags", icon: ICONS.tags },
  { to: "/templates", label: "Templates", icon: ICONS.templates },
  { to: "/phone-numbers", label: "Phone numbers", icon: ICONS.phone },
  { to: "/uploads", label: "Uploads", icon: ICONS.uploads },
];

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <rect x="1" y="11" width="4" height="8" rx="1.5" fill="var(--gs-ink)" />
      <rect x="8" y="6" width="4" height="13" rx="1.5" fill="var(--gs-ink)" />
      <rect x="15" y="1" width="4" height="18" rx="1.5" fill="var(--gs-accent)" />
    </svg>
  );
}

export default function Sidebar() {
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gs_sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("gs_sidebar", collapsed ? "collapsed" : "open");
    } catch {}
  }, [collapsed]);

  // close the account menu when clicking anywhere else
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `gs-nav-item ${isActive ? "is-active" : ""}`;

  return (
    <nav className={`gs-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Main">
      <div className="gs-sidebar-top">
        {!collapsed && (
          <div className="gs-brand">
            <Logo />
            <span>groscales</span>
          </div>
        )}
        <button
          className="gs-btn gs-btn--ghost gs-icon-btn"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <Logo /> : <Icon d={ICONS.collapse} />}
        </button>
      </div>

      <button
        className="gs-btn gs-btn--dark gs-new-text"
        onClick={() => nav("/dashboard", { state: { newText: Date.now() } })}
        title="New text"
      >
        <Icon d={ICONS.pen} size={15} />
        {!collapsed && "New text"}
      </button>

      <div className="gs-nav-group">
        <NavLink to="/dashboard" className={itemClass} title="Inbox">
          <Icon d={ICONS.inbox} />
          {!collapsed && <span>Inbox</span>}
        </NavLink>
      </div>

      <div className="gs-nav-group gs-nav-bottom">
        {SECONDARY.map((it) => (
          <NavLink key={it.to} to={it.to} className={itemClass} title={it.label}>
            <Icon d={it.icon} size={15} />
            {!collapsed && <span>{it.label}</span>}
          </NavLink>
        ))}

        <div className="gs-account" ref={menuRef}>
          <button
            className="gs-account-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Account"
          >
            <span className="gs-avatar"><Icon d={ICONS.user} size={14} /></span>
            {!collapsed && <span className="gs-account-name">Account</span>}
          </button>
          {menuOpen && (
            <div className="gs-menu" role="menu">
              <button
                className="gs-menu-item"
                role="menuitem"
                onClick={async () => {
                  await logout();
                  window.location.href = "/login";
                }}
              >
                <Icon d={ICONS.logout} size={15} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

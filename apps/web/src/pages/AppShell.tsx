// apps/web/src/pages/AppShell.tsx
import { Link, Outlet, useNavigate } from "react-router-dom";
import { isAuthed, logout } from "../lib/api";

export default function AppShell() {
  const nav = useNavigate();
  const authed = isAuthed();

  function doLogout() {
    logout();
    nav("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/dashboard" className="brand">GroScales</Link>
        <nav className="topnav">
          {authed ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <button onClick={doLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

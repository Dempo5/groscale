import { Outlet, useNavigate } from "react-router-dom";
import { logout } from "../lib/api";
import "./ui.css";

export default function AppShell() {
  const nav = useNavigate();

  function onLogout() {
    logout();
    nav("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">GroScales</div>
        <div className="spacer" />
        <button onClick={() => nav("/app")} className="tab active">Leads</button>
        {/* Future: <button onClick={() => nav("/app/messages")} className="tab">Messaging</button> */}
        <div className="spacer" />
        <button onClick={onLogout} className="ghost">Logout</button>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}

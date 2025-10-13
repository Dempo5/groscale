import { Link, Outlet, useLocation } from "react-router-dom";

export default function AppShell() {
  const { pathname } = useLocation();
  const onAuth = pathname.startsWith("/login") || pathname.startsWith("/register");

  return (
    <>
      <header className="app-header">
        <div className="brand">GroScales</div>

        {!onAuth && (
          <nav className="top-links">
            {/* whatever real links you want when logged in */}
            <Link to="/app">App</Link>
          </nav>
        )}
      </header>

      <Outlet />
    </>
  );
}

// apps/web/src/pages/AppShell.tsx
// Wraps every logged-in page in the same layout: sidebar on the left,
// the page on the right. Login/Register render on their own.
import type { PropsWithChildren } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import "../styles/theme.css";

const PUBLIC_PATHS = ["/login", "/register", "/"];

export default function AppShell({ children }: PropsWithChildren) {
  const { pathname } = useLocation();

  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;

  return (
    <div className="gs-app">
      <Sidebar />
      <main className="gs-main">{children}</main>
    </div>
  );
}

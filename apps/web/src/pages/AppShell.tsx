import { PropsWithChildren } from "react";
import "../pages/dashboard-ios.css";

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="p-shell matte">
      <header className="p-topbar matte">
        <div className="brand-center">GroScales</div>
      </header>

      {/* Page contents (Login/Register/Dashboard) render here */}
      {children}
    </div>
  );
}

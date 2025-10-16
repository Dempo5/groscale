import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { isAuthed } from "../../lib/api";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  // redirect unauthenticated users to login
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

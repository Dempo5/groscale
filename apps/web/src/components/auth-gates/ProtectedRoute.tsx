// apps/web/src/components/auth-gates/ProtectedRoute.tsx
import { Navigate } from "react-router-dom";
import { isAuthed } from "../../lib/api";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

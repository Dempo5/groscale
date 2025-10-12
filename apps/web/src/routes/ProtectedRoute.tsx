// apps/web/src/routes/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isAuthed } from "../lib/api";

export default function ProtectedRoute() {
  const authed = isAuthed();
  const loc = useLocation();
  return authed ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc }} />;
}

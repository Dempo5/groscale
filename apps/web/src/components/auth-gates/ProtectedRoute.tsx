import { Navigate, useLocation } from "react-router-dom";
import { isAuthed } from "../../lib/api";

type Props = { children: JSX.Element };

export default function ProtectedRoute({ children }: Props) {
  const authed = isAuthed();
  const loc = useLocation();
  return authed ? children : <Navigate to="/login" state={{ from: loc }} replace />;
}

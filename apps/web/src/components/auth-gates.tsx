import { useEffect } from "react";
import { isAuthed } from "../lib/api";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isAuthed()) window.location.replace("/login");
  }, []);
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (isAuthed()) window.location.replace("/dashboard");
  }, []);
  return <>{children}</>;
}

import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import "./index.css";
import { getToken } from "./lib/api";
import Login from "./pages/Login";
import AppShell from "./pages/AppShell";
import Leads from "./pages/Leads";

function Protected({ children }: { children: React.ReactNode }) {
  const authed = Boolean(getToken());
  return authed ? <>{children}</> : <Navigate to="/login" replace />;
}

const router = createBrowserRouter([
  { path: "/", element: <Navigate to={getToken() ? "/app" : "/login"} replace /> },
  { path: "/login", element: <Login /> },
  {
    path: "/app",
    element: (
      <Protected>
        <AppShell />
      </Protected>
    ),
    children: [
      { index: true, element: <Leads /> }, // /app shows Leads for now
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

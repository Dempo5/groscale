// apps/web/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./pages/dashboard-ios.css";

import AppShell from "./pages/AppShell";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Uploads from "./pages/Uploads";
import ProtectedRoute from "./components/auth-gates/ProtectedRoute";
import { isAuthed } from "./lib/api";

function RootRedirect() {
  // If logged in → dashboard, else → login
  return <Navigate to={isAuthed() ? "/dashboard" : "/login"} replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/uploads"
            element={
              <ProtectedRoute>
                <Uploads />
              </ProtectedRoute>
            }
          />

          {/* Unknown → root */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  </React.StrictMode>
);

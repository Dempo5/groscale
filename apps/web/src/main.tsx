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
import PhoneNumbers from "./pages/PhoneNumbers";
import Workflows from "./pages/Workflows"; // ✅ add this page
import ProtectedRoute from "./components/auth-gates/ProtectedRoute";
import { isAuthed } from "./lib/api";

// Initial redirect based on auth
function RootRedirect() {
  return <Navigate to={isAuthed() ? "/dashboard" : "/login"} replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppShell>
        <Routes>
          {/* Default redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected */}
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

          <Route
            path="/phone-numbers"
            element={
              <ProtectedRoute>
                <PhoneNumbers />
              </ProtectedRoute>
            }
          />

          <Route
            path="/workflows"
            element={
              <ProtectedRoute>
                <Workflows />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  </React.StrictMode>
);

// apps/web/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./pages/dashboard-ios.css";
import "./lib/fetchBase";

import AppShell from "./pages/AppShell";
import Login from "./pages/Login";
import Register from "./pages/Register";

// 🔽 NEW
import Conversations from "./pages/Conversations";

import Uploads from "./pages/Uploads";
import PhoneNumbers from "./pages/PhoneNumbers";
import Workflows from "./pages/Workflows";
import Tags from "./pages/Tags";
import Templates from "./pages/Templates";

import ProtectedRoute from "./components/auth-gates/ProtectedRoute";
import { isAuthed } from "./lib/api";

function RootRedirect() {
  return <Navigate to={isAuthed() ? "/dashboard" : "/login"} replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                {/* 🔽 swap Dashboard → Conversations (keeps left nav the same) */}
                <Conversations />
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
          <Route
            path="/tags"
            element={
              <ProtectedRoute>
                <Tags />
              </ProtectedRoute>
            }
          />
          <Route
            path="/templates"
            element={
              <ProtectedRoute>
                <Templates />
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

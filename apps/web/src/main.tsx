// apps/web/src/main.tsx
import "./styles.css";
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AppShell from "./pages/AppShell";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import { RequireAuth, RedirectIfAuthed } from "./components/auth-gates";
import { getToken } from "./lib/api"; // <-- use the real token source

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          {/* Default route: send authed users to dashboard */}
          <Route
            index
            element={<Navigate to={getToken() ? "/dashboard" : "/login"} replace />}
          />

          {/* Public routes (but redirect if already authed) */}
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <Login />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfAuthed>
                <Register />
              </RedirectIfAuthed>
            }
          />

          {/* Protected route */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
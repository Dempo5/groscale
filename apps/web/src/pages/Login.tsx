import { FormEvent, useState } from "react";
import { login } from "../lib/api";
import "./auth.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
  e.preventDefault();
  setErr(null); setBusy(true);
  try {
    await login(email.trim(), password);
    // ✅ force hard navigation so the app loads /dashboard fresh
    window.location.href = "/dashboard";
  } catch (e: any) {
    setErr(e?.message || "Could not sign you in");
  } finally {
    setBusy(false);
  }
}

  return (
    <div className="auth-page minimal">
      <header className="auth-topbar">
        <div className="brand">
          <span className="logo-dot" />
          <span>GroScales</span>
          <span className="pill">Beta</span>
        </div>
      </header>

      <main className="auth-center">
        <div className="auth-card">
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Sign in to continue.</p>

          {err && <p className="auth-error">{err}</p>}

          <form onSubmit={onSubmit} className="auth-form">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <div className="actions">
              <button type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <a className="ghost" href="/register">Create account</a>
            </div>

            <a className="back" href="/">Back to home</a>
          </form>
        </div>
      </main>
    </div>
  );
}

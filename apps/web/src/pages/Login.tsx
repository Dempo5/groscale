// === apps/web/src/pages/Login.tsx ===
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../lib/api";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="brandbar">
        <div className="brand">
          <img
            src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/react.svg"
            alt="" width={20} height={20}
            style={{ filter: "hue-rotate(170deg) saturate(1.6)" }}
          />
          GroScales
          <span className="badge">Beta</span>
        </div>
      </div>

      <div className="auth-split">
        <div className="art-pane" />

        <div className="auth-pane">
          <form className="card" onSubmit={onSubmit}>
            <h1>Welcome back</h1>
            <p className="muted">Sign in to continue.</p>

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email" type="email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required
              />
            </div>

            {err && <p className="muted" style={{ color: "#ff9a9a" }}>{err}</p>}

            <div className="actions">
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <Link className="btn secondary" to="/register">Create account</Link>
            </div>

            <p className="muted" style={{ marginTop: 14 }}>
              <Link to="/" className="link">Back to home</Link>
            </p>
          </form>
        </div>
      </div>
    </>
  );
}

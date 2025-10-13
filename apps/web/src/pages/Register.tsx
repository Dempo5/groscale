import { FormEvent, useState } from "react";
import { register as apiRegister, login } from "../lib/api";
import "./auth.css";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    setBusy(true);
    try {
      // ensure we pass a pure string, never undefined
      await apiRegister(email.trim(), password, (name ?? "").trim());
      // auto sign-in after successful registration
      await login(email.trim(), password);
      setOk(true);
      window.location.href = "/dashboard";
    } catch (e: any) {
      setErr(e?.message || "Could not create your account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <main className="auth-wrapper">
        <div className="auth-card">
          <h1>Create your account</h1>
          <p className="sub">Sign up to start using GroScales.</p>

          <form onSubmit={onSubmit} className="auth-form">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                autoComplete="name"
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            {err && <div className="error">{err}</div>}
            {ok && <div className="ok">Account created! Redirecting…</div>}

            <div className="actions">
              <button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </button>
              <a className="ghost" href="/login">Back to sign in</a>
            </div>

            <a className="back" href="/">Back to home</a>
          </form>
        </div>
      </main>
    </div>
  );
}

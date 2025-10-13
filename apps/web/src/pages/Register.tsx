import { FormEvent, useState } from "react";
import { register, login } from "../lib/api";
import "./auth.css";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await register(nimport { FormEvent, useState } from "react";
import { register, login } from "../lib/api";
import "./auth.css";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await register(name.trim() || "User", email.trim(), password);
      await login(email.trim(), password);
      window.location.href = "/app";
    } catch (e: any) {
      setErr(e?.message || "Create account failed");
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
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">Start scaling conversations.</p>

          {err && <p className="auth-error">{err}</p>}

          <form onSubmit={onSubmit} className="auth-form">
            <label className="field">
              <span>Name</span>
              <input
                placeholder="Ava Daniels"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
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
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <div className="actions">
              <button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </button>
              <a className="ghost" href="/login">Back to sign in</a>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
me.trim() || "User", email.trim(), password);
      await login(email.trim(), password);
      window.location.href = "/app";
    } catch (e: any) {
      setErr(e?.message || "Create account failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <div className="brand">
          <span className="logo-dot" />
          <span>GroScales</span>
          <span className="pill">Beta</span>
        </div>
      </header>

      <div className="auth-wrap">
        <div className="auth-card">
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">Start scaling conversations.</p>

          {err && <p className="auth-error">{err}</p>}

          <form onSubmit={onSubmit} className="auth-form">
            <label className="field">
              <span>Name</span>
              <input
                placeholder="Ava Daniels"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
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
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <div className="actions">
              <button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </button>
              <a className="ghost" href="/login">Back to sign in</a>
            </div>
          </form>
        </div>

        <div className="auth-art" aria-hidden="true">
          <div className="blob a" />
          <div className="blob b" />
          <div className="grid" />
        </div>
      </div>
    </div>
  );
}

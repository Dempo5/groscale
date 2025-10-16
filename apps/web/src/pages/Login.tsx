import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, setToken } from "../lib/api";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return setErr("Enter email & password");
    setErr(null);
    setLoading(true);
    try {
      const res = await login({ email, password });
      // res may contain { token } | { jwt } | { accessToken } — api.ts normalizes this
      const token =
        (res as any).token || (res as any).jwt || (res as any).accessToken;

      if (!token) throw new Error("No token returned from server");

      // ✅ only one argument
      setToken(token);
      nav("/dashboard", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="auth-title">Sign in</h1>

        {err && <div className="auth-error">{err}</div>}

        <label className="auth-label">Email</label>
        <input
          className="auth-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          placeholder="you@example.com"
        />

        <label className="auth-label">Password</label>
        <input
          className="auth-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
        />

        <button className="btn-primary" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="auth-foot">
          No account? <Link to="/register">Create one</Link>
        </div>
      </form>
    </div>
  );
}

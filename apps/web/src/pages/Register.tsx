import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register, setToken } from "../lib/api";

export default function Register() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) return setErr("Fill all fields");
    setErr(null);
    setLoading(true);
    try {
      const res = await register({ name, email, password });

      const token =
        (res as any).token || (res as any).jwt || (res as any).accessToken;

      if (!token) throw new Error("No token returned from server");

      // ✅ only one argument
      setToken(token);
      nav("/dashboard", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="auth-title">Create account</h1>

        {err && <div className="auth-error">{err}</div>}

        <label className="auth-label">Name</label>
        <input
          className="auth-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
        />

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
          autoComplete="new-password"
          placeholder="Create a password"
        />

        <button className="btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </button>

        <div className="auth-foot">
          Have an account? <Link to="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../lib/api";
import "./ui.css";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(name.trim() || "User", email.trim(), password);
      }
      await login(email.trim(), password);
      nav("/app", { replace: true });
    } catch (e: any) {
      setErr(e?.message || (mode === "login" ? "Login failed" : "Register failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="brand">GroScales</div>
        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>

        <form onSubmit={onSubmit} className="auth-form">
          {mode === "register" && (
            <input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {err && <div className="error">{err}</div>}

          <button type="submit" disabled={busy}>
            {busy ? "..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="muted">
          {mode === "login" ? (
            <>
              New to GroScales?{" "}
              <button className="link" onClick={() => setMode("register")}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button className="link" onClick={() => setMode("login")}>
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
      <div className="auth-art" aria-hidden />
    </div>
  );
}

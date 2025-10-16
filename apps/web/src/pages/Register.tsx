// apps/web/src/pages/Register.tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../lib/api";
import "./dashboard-ios.css";

export default function RegisterPage() {
  const nav = useNavigate();
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
      await register({ name, email, password });
      nav("/dashboard", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Register failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-shell" style={{ minHeight: "100vh" }}>
      <header className="p-topbar matte" style={{ justifyContent: "center" }}>
        <div className="brand-center">GroScales</div>
      </header>

      <main style={{ display:"grid", placeItems:"center", padding:"48px 16px" }}>
        <form
          onSubmit={onSubmit}
          style={{
            width: "100%",
            maxWidth: 480,
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: "12px",
            padding: 20,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Create account</h1>

          {err && (
            <div style={{ marginTop: 10, color: "#c24d4d", fontSize: 13 }}>
              {err}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary, var(--muted))" }}>
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                width: "100%", height: 36, marginTop: 6,
                border: "1px solid var(--line)", borderRadius: 8,
                background: "var(--panel)", color: "var(--ink)",
                padding: "0 10px", outline: "none",
              }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary, var(--muted))" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%", height: 36, marginTop: 6,
                border: "1px solid var(--line)", borderRadius: 8,
                background: "var(--panel)", color: "var(--ink)",
                padding: "0 10px", outline: "none",
              }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary, var(--muted))" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%", height: 36, marginTop: 6,
                border: "1px solid var(--line)", borderRadius: 8,
                background: "var(--panel)", color: "var(--ink)",
                padding: "0 10px", outline: "none",
              }}
            />
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:16 }}>
            <button
              type="submit"
              disabled={busy}
              className="btn-primary"
              style={{ height: 36, padding: "0 14px" }}
            >
              {busy ? "Creating…" : "Create account"}
            </button>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Have an account? <Link to="/login">Sign in</Link>
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}

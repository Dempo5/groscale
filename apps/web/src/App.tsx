import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { getLeads, login, logout, register, getToken, type Lead } from "./lib/api";

type Status = "idle" | "loading" | "error" | "ready";

export default function App() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string | null>(null);

  // auth form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const authed = useMemo(() => Boolean(getToken()), []);

  async function loadLeads() {
    setStatus("loading");
    setErr(null);
    try {
      const data = await getLeads();
      setLeads(data);
      setStatus("ready");
    } catch (e: any) {
      setErr(e?.message || "Load failed");
      setStatus("error");
    }
  }

  useEffect(() => {
    loadLeads();
  }, [authed]); // reload when token appears/disappears

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await login(email.trim(), password);
      await loadLeads();
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    }
  }

  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await register(name.trim() || "User", email.trim(), password);
      await login(email.trim(), password);
      await loadLeads();
    } catch (e: any) {
      setErr(e?.message || "Register failed");
    }
  }

  function onLogout() {
    logout();
    setLeads([]);
    setErr(null);
    setStatus("idle");
    // reload demo (unauthenticated) leads
    loadLeads();
  }

  return (
    <div className="container">
      <header className="header">
        <h1>GroScales</h1>
        <div className="auth">
          {getToken() ? (
            <div className="row">
              <span className="badge">Logged in</span>
              <button onClick={onLogout}>Logout</button>
            </div>
          ) : (
            <form className="row" onSubmit={onLogin}>
              <input
                placeholder="Name (for register)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: 160 }}
              />
              <input
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: 180 }}
                required
              />
              <input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: 140 }}
                required
              />
              <button type="submit">Login</button>
              <button type="button" onClick={onRegister}>Register</button>
            </form>
          )}
        </div>
      </header>

      <nav className="tabs">
        <button className="active">Leads</button>
        {/* Messaging tab comes later */}
      </nav>

      <main>
        {status === "loading" && <p>Loading leads...</p>}
        {status === "error" && <p className="error">Error: {err}</p>}
        {status !== "loading" && leads.length > 0 && (
          <ul>
            {leads.map((l) => (
              <li key={l.id}>
                <strong>{l.name}</strong> — {l.email}
              </li>
            ))}
          </ul>
        )}
        {status === "ready" && leads.length === 0 && <p>No leads yet.</p>}
      </main>
    </div>
  );
}

import { useEffect, useState, FormEvent } from "react";
import { getLeads, createLead, getMe, type Lead } from "../lib/api";

export default function Dashboard() {
  const [user, setUser] = useState<{ email: string; name?: string | null } | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        setUser(me.user);
        const data = await getLeads();
        setLeads(data);
      } catch (e: any) {
        setErr(e?.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onAddLead(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const lead = await createLead({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined });
      setLeads((ls) => [lead as any, ...ls]);
      setName(""); setEmail(""); setPhone("");
    } catch (e: any) {
      setErr(e?.message || "Failed to create lead");
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm opacity-75">
          Signed in as {user?.name ? `${user.name} · ` : ""}{user?.email}
        </p>
      </header>

      <section className="mb-6">
        <form onSubmit={onAddLead} className="grid gap-2 sm:grid-cols-4">
          <input
            className="rounded-md p-2 bg-neutral-900 border border-neutral-800 sm:col-span-1"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="rounded-md p-2 bg-neutral-900 border border-neutral-800 sm:col-span-2"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="rounded-md p-2 bg-neutral-900 border border-neutral-800 sm:col-span-1"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button className="sm:col-span-4 rounded-md p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50" type="submit">
            Add Lead
          </button>
        </form>
        {err && <p className="text-red-400 mt-2">{err}</p>}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Leads</h2>
        {leads.length === 0 ? (
          <p className="opacity-75">No leads yet.</p>
        ) : (
          <ul className="space-y-2">
            {leads.map((l) => (
              <li key={l.id} className="rounded-md p-3 bg-neutral-900 border border-neutral-800">
                <div className="font-medium">{l.name}</div>
                <div className="text-sm opacity-75">{l.email}{l?.phone ? ` · ${l.phone}` : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

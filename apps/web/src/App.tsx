import { useEffect, useMemo, useState } from "react";
import {
  getLeads,
  updateLead,
  getThread,
  sendMessage,
  type Lead,
  type Message,
} from "./lib/api";

type Tab = "leads" | "messaging";

// tiny id helper (avoids crypto.randomUUID for older environments)
function uid() {
  return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("leads");
  return (
    <div style={styles.app}>
      <Header tab={tab} onTabChange={setTab} />
      <div style={styles.body}>{tab === "leads" ? <LeadsPanel /> : <MessagingPanel />}</div>
    </div>
  );
}

function Header({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
  return (
    <div style={styles.header}>
      <div style={styles.logo}>GroScales</div>
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tabBtn, ...(tab === "leads" ? styles.tabBtnActive : {}) }}
          onClick={() => onTabChange("leads")}
        >
          Leads
        </button>
        <button
          style={{ ...styles.tabBtn, ...(tab === "messaging" ? styles.tabBtnActive : {}) }}
          onClick={() => onTabChange("messaging")}
        >
          Messaging
        </button>
      </div>
    </div>
  );
}

/* ---------------------- LEADS PANEL ---------------------- */
function LeadsPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLeads(await getLeads());
      } catch (e: any) {
        setErr(e.message ?? "Failed to load leads");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={styles.muted}>Loading leads…</div>;
  if (err) return <div style={styles.error}>Error: {err}</div>;
  if (!leads.length) return <div style={styles.muted}>No leads yet.</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {leads.map((l) => (
        <div key={l.id} style={styles.leadRow}>
          <div style={{ width: 220, fontWeight: 600 }}>
            {l.firstName} {l.lastName}
          </div>
          <div style={{ width: 160 }}>{l.phone}</div>

          <select
            value={l.status}
            onChange={async (e) => {
              const status = e.target.value as Lead["status"];
              const before = leads;
              setLeads((prev) => prev.map((x) => (x.id === l.id ? { ...x, status } : x)));
              try {
                const updated = await updateLead(l.id, { status });
                setLeads((prev) => prev.map((x) => (x.id === l.id ? updated : x)));
              } catch {
                alert("Failed to update status");
                setLeads(before);
              }
            }}
            style={styles.select}
          >
            <option value="NEW">NEW</option>
            <option value="CONTACTED">CONTACTED</option>
            <option value="BOOKED">BOOKED</option>
          </select>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {l.tags.map((t) => (
              <span key={t} style={styles.tag}>
                {t}
              </span>
            ))}
            {!l.tags.length && <span style={styles.muted}>No tags</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------- MESSAGING PANEL -------------------- */
function MessagingPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await getLeads();
        setLeads(list);
        setActiveLeadId((prev) => prev ?? list[0]?.id ?? null);
      } catch (e: any) {
        setErr(e.message ?? "Failed to load leads");
      } finally {
        setLoadingLeads(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeLeadId) return;
    (async () => {
      try {
        setLoadingMsg(true);
        setMessages(await getThread(activeLeadId));
      } catch (e: any) {
        setErr(e.message ?? "Failed to load messages");
      } finally {
        setLoadingMsg(false);
      }
    })();
  }, [activeLeadId]);

  const activeLead = useMemo(
    () => leads.find((l) => l.id === activeLeadId) || null,
    [leads, activeLeadId]
  );

  async function onSend() {
    const text = input.trim();
    if (!text || !activeLead) return;
    setInput("");

    // optimistic add
    const temp: Message = {
      id: uid(),
      leadId: activeLead.id,
      from: "me",
      text,
      at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, temp]);

    try {
      const saved = await sendMessage(activeLead.id, text);
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? saved : m)));
    } catch {
      alert("Failed to send");
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
    }
  }

  return (
    <div style={styles.messagingWrap}>
      {/* LEFT: list of leads */}
      <div style={styles.leftCol}>
        <div style={styles.leftTitle}>Leads</div>
        {loadingLeads ? (
          <div style={styles.muted}>Loading…</div>
        ) : err ? (
          <div style={styles.error}>Error: {err}</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {leads.map((l) => (
              <button
                key={l.id}
                onClick={() => setActiveLeadId(l.id)}
                style={{
                  ...styles.leadItem,
                  ...(activeLeadId === l.id ? styles.leadItemActive : {}),
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {l.firstName} {l.lastName}
                </div>
                <div style={styles.leadSub}>{l.phone}</div>
              </button>
            ))}
            {!leads.length && <div style={styles.muted}>No leads</div>}
          </div>
        )}
      </div>

      {/* RIGHT: messages */}
      <div style={styles.rightCol}>
        <div style={styles.threadHeader}>
          {activeLead ? (
            <>
              <div style={{ fontWeight: 700 }}>
                {activeLead.firstName} {activeLead.lastName}
              </div>
              <div style={styles.leadSub}>{activeLead.phone}</div>
            </>
          ) : (
            <div style={styles.muted}>Pick a lead</div>
          )}
        </div>

        <div style={styles.threadBody}>
          {loadingMsg ? (
            <div style={styles.muted}>Loading messages…</div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                style={{
                  ...styles.bubble,
                  ...(m.from === "me" ? styles.bubbleMe : styles.bubbleThem),
                }}
              >
                <div style={styles.bubbleText}>{m.text}</div>
                <div style={styles.bubbleTime}>
                  {new Date(m.at).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
          {!loadingMsg && !messages.length && activeLead && (
            <div style={styles.muted}>No messages yet.</div>
          )}
        </div>

        <div style={styles.threadInputRow}>
          <input
            style={styles.input}
            placeholder="Type a message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? onSend() : null)}
          />
          <button style={styles.sendBtn} onClick={onSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- STYLES -------------------------- */
const styles: Record<string, React.CSSProperties> = {
  app: { minHeight: "100vh", background: "#f7f7fb", color: "#111", fontFamily: "system-ui, Arial" },
  header: {
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    borderBottom: "1px solid #e8e8ee",
    background: "#fff",
  },
  logo: { fontWeight: 800 },
  tabs: { display: "flex", gap: 8 },
  tabBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
  },
  tabBtnActive: { background: "#111827", color: "#fff", borderColor: "#111827" },
  body: { padding: 16, maxWidth: 1100, margin: "0 auto" },

  /* Leads */
  leadRow: {
    display: "grid",
    gridTemplateColumns: "220px 160px 160px 1fr",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #e8e8ee",
    background: "#fff",
  },
  select: { padding: 6, borderRadius: 8, border: "1px solid #ddd" },
  tag: {
    padding: "3px 8px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#3730a3",
    fontSize: 12,
    border: "1px solid #e0e7ff",
  },
  muted: { color: "#6b7280" },
  error: { color: "#b91c1c", fontWeight: 600 },

  /* Messaging */
  messagingWrap: {
    display: "grid",
    gridTemplateColumns: "280px 1fr",
    gap: 16,
    minHeight: "calc(100vh - 56px - 32px)",
  },
  leftCol: { background: "#fff", border: "1px solid #e8e8ee", borderRadius: 12, padding: 12 },
  leftTitle: { fontWeight: 700, marginBottom: 10 },
  leadItem: {
    textAlign: "left",
    padding: 10,
    background: "#fafafa",
    border: "1px solid #eee",
    borderRadius: 10,
    cursor: "pointer",
  },
  leadItemActive: { background: "#eef2ff", borderColor: "#c7d2fe" },
  leadSub: { fontSize: 12, color: "#6b7280" },

  rightCol: {
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    background: "#fff",
    border: "1px solid #e8e8ee",
    borderRadius: 12,
  },
  threadHeader: { padding: 12, borderBottom: "1px solid #e8e8ee" },
  threadBody: { padding: 12, overflowY: "auto", display: "grid", gap: 8 },
  bubble: {
    maxWidth: 520,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
  },
  bubbleMe: { marginLeft: "auto", background: "#3b82f6", color: "#fff", borderColor: "#3b82f6" },
  bubbleThem: { background: "#f9fafb" },
  bubbleText: { whiteSpace: "pre-wrap" },
  bubbleTime: { marginTop: 4, opacity: 0.7, fontSize: 12, textAlign: "right" },
  threadInputRow: { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: 12, borderTop: "1px solid #e8e8ee" },
  input: { padding: 10, borderRadius: 10, border: "1px solid #ddd" },
  sendBtn: { padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff", border: "1px solid #111827", cursor: "pointer" },
};

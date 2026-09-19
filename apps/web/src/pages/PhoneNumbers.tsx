// apps/web/src/pages/PhoneNumbers.tsx
// Your numbers (with default + actions) and search to get a new one.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { listMyNumbers, purchaseNumber, searchNumbers, setDefaultNumber } from "../lib/api";
import "./phone-numbers.css";

type Available = {
  friendlyName?: string | null;
  phoneNumber: string;
  locality?: string | null;
  region?: string | null;
  capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean };
};

type Owned = {
  id: string;
  sid: string;
  number: string;
  friendlyName?: string | null;
  isDefault: boolean;
};

function formatPhone(p?: string | null) {
  const d = (p || "").replace(/\D+/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : p || "";
}

// Twilio's default friendlyName is just the formatted number, so only show
// it when someone actually named the number.
function customName(n: Owned) {
  const name = (n.friendlyName || "").trim();
  if (!name) return null;
  return name.replace(/\D/g, "").endsWith(n.number.replace(/\D/g, "").slice(-10)) ? null : name;
}

const Dots = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
  </svg>
);

/* ---------------- row actions menu ---------------- */
function RowMenu({ n, onMakeDefault }: { n: Owned; onMakeDefault: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="pn-menu-anchor" ref={ref}>
      <button
        className={`gs-btn gs-btn--ghost gs-icon-btn ${open ? "is-open" : ""}`}
        aria-label={`More actions for ${formatPhone(n.number)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Dots />
      </button>
      {open && (
        <div className="pn-menu" role="menu">
          <button
            role="menuitem"
            disabled={n.isDefault}
            onClick={() => {
              setOpen(false);
              onMakeDefault();
            }}
          >
            {n.isDefault ? "Already default" : "Make default"}
          </button>
          <button role="menuitem" disabled title="Coming soon">
            Rename
          </button>
          <button role="menuitem" disabled title="Coming soon">
            View registration
          </button>
          <div className="pn-menu-sep" />
          <button role="menuitem" className="is-danger" disabled title="Coming soon">
            Release number
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- confirm dialog ---------------- */
function ConfirmBuy({
  row,
  firstNumber,
  busy,
  onCancel,
  onConfirm,
}: {
  row: Available;
  firstNumber: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const place = [row.locality, row.region].filter(Boolean).join(", ");
  return (
    <div className="pn-overlay" onMouseDown={() => !busy && onCancel()}>
      <div
        className="pn-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pn-dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="pn-dialog-title">Get {formatPhone(row.phoneNumber)}?</h2>
        <p>
          {place ? `${place}. ` : ""}
          This number will be added to your account and billed monthly.
          {firstNumber ? " It'll be your default, so new texts go out from it." : ""}
        </p>
        <div className="pn-dialog-actions">
          <button className="gs-btn gs-btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="gs-btn gs-btn--primary" onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "Getting number…" : "Get this number"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ====================================================================== */
export default function PhoneNumbers() {
  const [owned, setOwned] = useState<Owned[]>([]);
  const [ownedLoaded, setOwnedLoaded] = useState(false);

  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [results, setResults] = useState<Available[]>([]);
  const [searching, setSearching] = useState(false);

  const [confirming, setConfirming] = useState<Available | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadOwned() {
    try {
      const res = await listMyNumbers();
      const rows: Owned[] = res?.data || [];
      rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
      setOwned(rows);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your numbers.");
    } finally {
      setOwnedLoaded(true);
    }
  }

  useEffect(() => {
    loadOwned();
  }, []);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    const ac = areaCode.replace(/\D/g, "");
    if (ac && ac.length !== 3) {
      setError("Area codes are 3 digits, like 407.");
      return;
    }
    setSearching(true);
    try {
      const res = await searchNumbers({
        country: "US",
        areaCode: ac || undefined,
        contains: contains.replace(/\D/g, "") || undefined,
        sms: true,
        limit: 20,
      });
      if (!res.ok) throw new Error(res.error || "Search failed");
      setResults(res.data || []);
      setSearchedFor(ac || "the US");
    } catch (e: any) {
      setError(e?.message || "Search failed. Try again.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function buy(row: Available) {
    setBuying(true);
    setError(null);
    try {
      const res = await purchaseNumber({
        country: "US",
        phoneNumber: row.phoneNumber,
        // only the first number becomes default automatically
        makeDefault: owned.length === 0,
      });
      if (!res.ok) throw new Error(res.error || "Couldn't get that number.");
      setNotice(`${formatPhone(row.phoneNumber)} is now on your account.`);
      setResults((r) => r.filter((x) => x.phoneNumber !== row.phoneNumber));
      await loadOwned();
    } catch (e: any) {
      setError(e?.message || "Couldn't get that number. Try another one.");
    } finally {
      setBuying(false);
      setConfirming(null);
    }
  }

  async function makeDefault(n: Owned) {
    setError(null);
    try {
      await setDefaultNumber(n.sid);
      await loadOwned();
    } catch (e: any) {
      setError(e?.message || "Couldn't change your default number.");
    }
  }

  return (
    <div className="gs-page">
      <div className="gs-page-panel">
        <div className="pn">
          <header className="pn-head">
            <h1>Phone numbers</h1>
            <p>The numbers your leads see when you text them. New texts go out from your default number.</p>
          </header>

          {error && <div className="pn-banner is-error">{error}</div>}
          {notice && <div className="pn-banner is-ok">{notice}</div>}

          <section className="pn-section">
            <h2>Your numbers</h2>
            {ownedLoaded && !owned.length && (
              <p className="pn-empty">You don't have a number yet. Search below to get your first one.</p>
            )}
            {owned.map((n) => {
              const name = customName(n);
              return (
                <div key={n.id} className="pn-row">
                  <div className="pn-num">
                    <span className="gs-mono pn-mono">{formatPhone(n.number)}</span>
                    {name && <span className="pn-sub">{name}</span>}
                  </div>
                  <div className="pn-badges">
                    {n.isDefault && <span className="gs-chip pn-default">Default</span>}
                  </div>
                  <RowMenu n={n} onMakeDefault={() => makeDefault(n)} />
                </div>
              );
            })}
          </section>

          <section className="pn-section">
            <h2>Get a new number</h2>
            <p className="pn-hint">Choose a local area code familiar to your leads.</p>

            <form className="pn-search" onSubmit={runSearch}>
              <label className="pn-field pn-field--area">
                <SearchIcon />
                <input
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="Area code, e.g. 407"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                  aria-label="Area code"
                />
              </label>
              <label className="pn-field">
                <input
                  inputMode="numeric"
                  placeholder="Contains digits (optional)"
                  value={contains}
                  onChange={(e) => setContains(e.target.value)}
                  aria-label="Contains digits"
                />
              </label>
              <button className="gs-btn gs-btn--primary pn-search-btn" type="submit" disabled={searching}>
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            {searchedFor && (
              <div className="pn-results">
                <span className="pn-count">
                  {results.length
                    ? `${results.length} number${results.length === 1 ? "" : "s"} available in ${searchedFor}`
                    : `No numbers found in ${searchedFor}. Try a nearby area code.`}
                </span>
                {results.map((r) => (
                  <div key={r.phoneNumber} className="pn-row pn-row--result">
                    <span className="gs-mono pn-mono pn-num">{formatPhone(r.phoneNumber)}</span>
                    <span className="pn-place">{[r.locality, r.region].filter(Boolean).join(", ")}</span>
                    <span className="pn-caps">{r.capabilities?.voice ? "Texts & calls" : "Texts"}</span>
                    <button className="gs-btn" onClick={() => setConfirming(r)} disabled={buying}>
                      Get this number
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {confirming && (
        <ConfirmBuy
          row={confirming}
          firstNumber={owned.length === 0}
          busy={buying}
          onCancel={() => setConfirming(null)}
          onConfirm={() => buy(confirming)}
        />
      )}
    </div>
  );
}

import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { uploadLeadsMapped } from "../lib/api";

/**
 * Drop-in 3-step CSV upload wizard.
 * - Step 1: choose file + preview sample rows
 * - Step 2: map headers -> internal fields
 * - Step 3: options + submit (tags, ignore dupes)
 *
 * Props:
 * - onDone?: (summary) => void  // called with server response
 */
type Props = { onDone?: (summary: any) => void };

type MappingField =
  | "name"
  | "first"
  | "last"
  | "email"
  | "phone"
  | "tags"
  | "note";

const FIELD_LABEL: Record<MappingField, string> = {
  name: "Full name",
  first: "First name",
  last: "Last name",
  email: "Email",
  phone: "Phone",
  tags: "Tags (comma-separated)",
  note: "Note",
};

const CANONICAL_FIELDS: MappingField[] = [
  "name",
  "first",
  "last",
  "email",
  "phone",
  "tags",
  "note",
];

// header synonym helper (same spirit as backend HMAP)
function normalizeHeader(h: string) {
  const k = (h || "").replace(/\uFEFF/g, "").trim().toLowerCase();
  const map: Record<string, MappingField | string> = {
    firstname: "first",
    "first name": "first",
    first: "first",
    lastname: "last",
    "last name": "last",
    last: "last",
    name: "name",
    "full name": "name",
    fullname: "name",
    "contact name": "name",
    email: "email",
    "e-mail": "email",
    "email address": "email",
    phone: "phone",
    "phone number": "phone",
    mobile: "phone",
    cell: "phone",
    "cell phone": "phone",
    telephone: "phone",
    primaryphc: "phone",
    phone2: "phone",
    "primary phone": "phone",
    tags: "tags",
    label: "tags",
    labels: "tags",
    segments: "tags",
    note: "note",
    notes: "note",
  };
  return (map[k] as MappingField) || k;
}

export default function UploadWizard({ onDone }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // field mapping: canonical field -> original header
  const [mapping, setMapping] = useState<Record<MappingField, string | "">>({
    name: "",
    first: "",
    last: "",
    email: "",
    phone: "",
    tags: "",
    note: "",
  });

  // options/tags
  const [ignoreDupes, setIgnoreDupes] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const sample = useMemo(() => rows.slice(0, 12), [rows]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    parseCsv(f);
  }

  function parseCsv(f: File) {
    setError(null);
    setParsing(true);
    setFile(f);
    setRows([]);
    setRawHeaders([]);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      preview: 500, // load enough to show good preview + estimate
      transformHeader: (h) => String(h || "").replace(/\uFEFF/g, "").trim(),
      complete: (res) => {
        setParsing(false);

        if (res.errors?.length) {
          setError(res.errors[0].message || "Failed to parse CSV");
        }

        const hdrs = (res.meta?.fields || []).map((h) =>
          String(h || "").trim()
        );
        setRawHeaders(hdrs);

        const guessed = autoGuessMapping(hdrs);
        setMapping((m) => ({ ...m, ...guessed }));

        setRows(Array.isArray(res.data) ? res.data : []);
        setStep(2);
      },
      error: (err) => {
        setParsing(false);
        setError(err?.message || "Failed to parse CSV");
      },
    });
  }

  function autoGuessMapping(headers: string[]) {
    const lower = headers.map((h) => normalizeHeader(h));
    const out: Partial<Record<MappingField, string>> = {};

    CANONICAL_FIELDS.forEach((field) => {
      const idx = lower.indexOf(field);
      if (idx >= 0) out[field] = headers[idx];
    });

    // Common fallback: name from first+last
    if (!out.name && out.first && out.last) {
      // remain unmapped; server will combine; but keep as is
    }

    return out;
  }

  function setMap(field: MappingField, header: string) {
    setMapping((m) => ({ ...m, [field]: header || "" }));
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  async function submit() {
    if (!file) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await uploadLeadsMapped(file, mapping, {
        ignoreDuplicates: ignoreDupes,
        tags,
      });

      setSubmitting(false);
      if (!res?.ok) {
        setError(res?.error || "Import failed");
        return;
      }
      onDone?.(res);
      // reset for another import
      setStep(1);
      setFile(null);
      setRows([]);
      setRawHeaders([]);
      setTags([]);
      setMapping({
        name: "",
        first: "",
        last: "",
        email: "",
        phone: "",
        tags: "",
        note: "",
      });
    } catch (e: any) {
      setSubmitting(false);
      setError(e?.message || "Request failed");
    }
  }

  return (
    <div className="gs-upload-wizard">
      <div className="gs-card">
        <div className="gs-head">
          <div className="gs-title">Upload CSV</div>
          <div className="gs-steps">
            <StepBubble active={step === 1} done={step > 1}>
              1
            </StepBubble>
            <span className="gs-step-sp">›</span>
            <StepBubble active={step === 2} done={step > 2}>
              2
            </StepBubble>
            <span className="gs-step-sp">›</span>
            <StepBubble active={step === 3} done={false}>
              3
            </StepBubble>
          </div>
        </div>

        {step === 1 && (
          <div className="gs-body">
            <div className="gs-drop">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onPickFile}
                style={{ display: "none" }}
              />
              <div className="gs-drop-inner">
                <div className="gs-drop-icon">⬆️</div>
                <div className="gs-drop-title">Drop CSV</div>
                <div className="gs-drop-sub">or click to browse</div>
                <button
                  className="btn-primary"
                  onClick={() => inputRef.current?.click()}
                  disabled={parsing}
                >
                  {parsing ? "Parsing…" : "Choose file"}
                </button>
              </div>
            </div>
            {error && <div className="gs-error">{error}</div>}
          </div>
        )}

        {step === 2 && (
          <div className="gs-body">
            <div className="gs-section-title">
              Preview ({rows.length} rows parsed)
            </div>
            <div className="gs-table-wrap">
              <table className="gs-table">
                <thead>
                  <tr>
                    {rawHeaders.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.map((r, i) => (
                    <tr key={i}>
                      {rawHeaders.map((h) => (
                        <td key={h}>{String(r[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="gs-section-title">Map columns</div>
            <div className="gs-map-grid">
              {CANONICAL_FIELDS.map((f) => (
                <div className="gs-map-row" key={f}>
                  <label className="gs-label">{FIELD_LABEL[f]}</label>
                  <select
                    className="gs-select"
                    value={mapping[f]}
                    onChange={(e) => setMap(f, e.target.value)}
                  >
                    <option value="">— Not mapped —</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="gs-actions">
              <button className="btn-outline" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={() => setStep(3)}
                disabled={!file}
              >
                Continue
              </button>
            </div>
            {error && <div className="gs-error">{error}</div>}
          </div>
        )}

        {step === 3 && (
          <div className="gs-body">
            <div className="gs-section-title">Options</div>
            <div className="gs-opt-row">
              <label className="gs-check">
                <input
                  type="checkbox"
                  checked={ignoreDupes}
                  onChange={(e) => setIgnoreDupes(e.target.checked)}
                />
                <span>Ignore duplicates (same email or phone within file)</span>
              </label>
            </div>

            <div className="gs-section-title">Tags</div>
            <div className="gs-tag-row">
              <input
                className="gs-input"
                placeholder="Add a tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <button className="btn-outline" onClick={addTag}>
                Add tag
              </button>
            </div>
            {tags.length > 0 && (
              <div className="gs-tags">
                {tags.map((t) => (
                  <span key={t} className="gs-tag">
                    {t}
                    <button className="gs-tag-x" onClick={() => removeTag(t)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="gs-actions">
              <button className="btn-outline" onClick={() => setStep(2)}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={submit}
                disabled={!file || submitting}
              >
                {submitting ? "Importing…" : "Import"}
              </button>
            </div>
            {error && <div className="gs-error">{error}</div>}
          </div>
        )}
      </div>

      {/* lightweight styles */}
      <style>{`
        .gs-upload-wizard { width: 100%; display: grid; place-items: start; }
        .gs-card{
          width: min(1100px, 95vw);
          background: var(--surface-1);
          border: 1px solid var(--line);
          border-radius: 14px;
          box-shadow: 0 10px 36px rgba(0,0,0,.10);
          padding: 14px;
        }
        .gs-head{ display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); padding-bottom:10px; margin-bottom:10px; }
        .gs-title{ font-weight:750; }
        .gs-steps{ display:flex; align-items:center; gap:8px; }
        .gs-step-sp{ color: var(--text-secondary); }
        .gs-bubble{ width:24px; height:24px; border-radius:999px; display:grid; place-items:center; font-size:12px; border:1px solid var(--line); }
        .gs-bubble.active{ background: color-mix(in srgb, var(--accent) 18%, transparent); border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
        .gs-bubble.done{ background: color-mix(in srgb, var(--accent) 40%, transparent); color:#0b0b0b; }
        .gs-body{ padding: 6px 2px; }
        .gs-drop{ border:2px dashed var(--line); border-radius:12px; padding:28px; display:grid; place-items:center; }
        .gs-drop-inner{ text-align:center; display:grid; gap:8px; }
        .gs-drop-icon{ font-size:28px; }
        .gs-drop-title{ font-weight:700; }
        .gs-drop-sub{ color: var(--text-secondary); margin-bottom:6px; }

        .gs-table-wrap{ border:1px solid var(--line); border-radius:10px; overflow:auto; }
        .gs-table{ border-collapse:collapse; width:100%; min-width:720px; }
        .gs-table th, .gs-table td{ padding:8px 10px; border-bottom:1px solid var(--line); text-align:left; }
        .gs-section-title{ font-weight:700; margin:12px 0 8px; }
        .gs-map-grid{ display:grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap:10px 18px; }
        .gs-map-row{ display:flex; flex-direction:column; gap:6px; }
        .gs-label{ font-size:12px; color: var(--text-secondary); }
        .gs-select, .gs-input{
          border:1px solid var(--line); background:var(--surface-1); color:inherit; border-radius:8px; padding:8px 10px; outline:none;
        }
        .gs-select:focus, .gs-input:focus{
          border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
        }
        .gs-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
        .btn-primary{
          background: var(--accent); color: #0b0b0b; border-radius:10px; padding:8px 12px; border:1px solid color-mix(in srgb, var(--accent) 60%, var(--line));
        }
        .btn-outline{
          background: transparent; color: inherit; border-radius:10px; padding:8px 12px; border:1px solid var(--line);
        }
        .gs-error{
          margin-top:10px; color:#b91c1c;
          background: color-mix(in srgb, #ef4444 12%, var(--surface-1));
          border:1px solid color-mix(in srgb, #ef4444 40%, var(--line));
          padding:8px 10px; border-radius:10px;
        }
        .gs-opt-row{ margin:8px 0; }
        .gs-check{ display:flex; align-items:center; gap:8px; cursor:pointer; }
        .gs-tag-row{ display:flex; gap:8px; }
        .gs-tags{ display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
        .gs-tag{ font-size:12px; border:1px solid var(--line); background: color-mix(in srgb, var(--surface-1) 92%, var(--line)); border-radius:999px; padding:4px 8px; display:inline-flex; align-items:center; gap:6px; }
        .gs-tag-x{ border:none; background:transparent; cursor:pointer; }
      `}</style>
    </div>
  );
}

function StepBubble({ children, active, done }: { children: React.ReactNode; active?: boolean; done?: boolean }) {
  const cls = ["gs-bubble", active ? "active" : "", done ? "done" : ""]
    .filter(Boolean)
    .join(" ");
  return <div className={cls}>{children}</div>;
}

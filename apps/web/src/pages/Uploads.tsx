import { useRef, useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

/** —— Canonical + synonyms —— */
const H: Record<string,string> = {
  firstname:"first","first name":"first",first:"first",
  lastname:"last","last name":"last",last:"last",
  name:"name","full name":"name",fullname:"name","contact name":"name",
  email:"email","e-mail":"email","email address":"email",mail:"email",
  phone:"phone","phone number":"phone",mobile:"phone",cell:"phone",telephone:"phone",tel:"phone",
  "primary ph":"phone","primary phone":"phone",ph:"phone",phone2:"phone",
  tags:"tags",label:"tags",labels:"tags",segments:"tags",groups:"tags",lists:"tags",
  note:"note",notes:"note",comment:"note",comments:"note",memo:"note",
  dob:"dob","date of birth":"dob",
  city:"city",town:"city",
  state:"state",province:"state",region:"state",
  zip:"zip",zipcode:"zip","postal code":"zip","post code":"zip",
  address:"address",addr:"address","street address":"address",street:"address",line1:"address",
};
const SYN: Record<string,string[]> = {
  name:["name","full name","contact name"],
  first:["first","first name","firstname","given","fname"],
  last:["last","last name","lastname","surname","lname","family"],
  email:["email","e-mail","email address","mail"],
  phone:["phone","phone number","mobile","cell","tel","telephone","primary ph","primary phone","ph","phone2"],
  tags:["tags","label","labels","segments","groups","lists"],
  note:["note","notes","comment","comments","memo"],
  city:["city","town"],
  state:["state","province","region"],
  zip:["zip","zipcode","postal","postal code","post code"],
  address:["address","street","street address","addr","line1"],
  dob:["dob","date of birth","birthdate","birthday"],
};

const norm = (s:string)=> s.replace(/\uFEFF/g,"").trim().toLowerCase().replace(/\s+/g," ");
const nHeader = (s:string)=> H[norm(s)] || s.trim();
const normKey = (s:string)=> s.toLowerCase().replace(/[^a-z0-9]/g,"");

const guessDelim = (text:string)=>([",",";","\t","|"] as const).reduce((best,c)=>{
  const rows = text.split(/\r?\n/).slice(0,6);
  const cnts = rows.map(r => (r.match(new RegExp(`\\${c}`,"g"))||[]).length);
  const avg = cnts.reduce((a,b)=>a+b,0)/(cnts.length||1);
  const varc= cnts.reduce((a,b)=>a+(b-avg)**2,0)/(cnts.length||1);
  const score = avg - Math.sqrt(varc);
  return score > best.score ? {ch:c, score} : best;
},{ch:",",score:-1 as number}).ch;

type Mapping = Partial<Record<
  "name"|"first"|"last"|"email"|"phone"|"tags"|"note"|"city"|"state"|"zip"|"address"|"dob", string
>>;
type Row = { id:string; name:string; size:number; at:string; leads:number; duplicates:number; invalids:number; status:"success"|"partial"|"failed"; };

export default function Uploads(){
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement|null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File|null>(null);

  // preview state
  const [headers, setHeaders] = useState<string[]>([]);
  const [samples, setSamples] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [presentCanon, setPresentCanon] = useState<Set<string>>(new Set());

  // options
  const [opts, setOpts] = useState<{ignoreDuplicates:boolean; tags:string[]; workflowId?:string}>({ ignoreDuplicates:false, tags:[] });
  const [workflows, setWorkflows] = useState<{id:string; name:string}[]>([]);
  const [err, setErr] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(()=>{ (async()=>{
    try{
      const res = await fetch("/api/workflows", { credentials:"include" });
      if(res.ok){ const data = await res.json(); setWorkflows((data||[]).map((w:any)=>({id:w.id,name:w.name}))); }
    }catch{/* silent */}
  })(); },[]);

  const readText = (f:File)=>new Promise<string>((res,rej)=>{ const fr=new FileReader(); fr.onerror=()=>rej(fr.error); fr.onload=()=>res(String(fr.result||"")); fr.readAsText(f); });

  // fuzzy header scoring
  function scoreHeader(h:string, canon:string): number {
    const hk = normKey(h), ck = normKey(canon);
    if (!hk || !ck) return 0;
    if (hk === ck) return 100;
    if (hk.includes(ck)) return 80 - Math.abs(hk.length-ck.length);
    return 0;
  }
  function guessFor(canon: keyof typeof SYN, raw: string[]): string {
    const candidates = [canon, ...(SYN[canon]||[])];
    let best = {h:"", s:0};
    for (const h of raw) for (const c of candidates) {
      const s = scoreHeader(h, c); if (s > best.s) best = {h, s};
    }
    return best.s >= 50 ? best.h : "";
  }

  async function begin(f:File){
    setErr(null); setFile(f); setOpen(true);
    const text = await readText(f);
    const looksJson = f.type.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[");

    if (looksJson) {
      try{
        const data = JSON.parse(text);
        const arr: any[] = Array.isArray(data) ? data : [data];
        if (!arr.length || typeof arr[0] !== "object") throw new Error();

        const raw = Object.keys(arr[0]);
        const canon = raw.map(nHeader);
        setHeaders(raw);
        setSamples(arr.slice(0,8).map(obj => raw.map(k => String(obj[k] ?? ""))));
        setPresentCanon(new Set(canon));

        const picked: Mapping = {
          name:guessFor("name", raw), first:guessFor("first", raw), last:guessFor("last", raw),
          email:guessFor("email", raw), phone:guessFor("phone", raw),
          tags:guessFor("tags", raw), note:guessFor("note", raw),
          city:guessFor("city", raw), state:guessFor("state", raw), zip:guessFor("zip", raw),
          address:guessFor("address", raw), dob:guessFor("dob", raw),
        };
        setMapping(m => ({ ...picked, ...m }));
        return;
      }catch{/* fall through to CSV */}
    }

    // CSV path
    const d = guessDelim(text);
    const lines = text.split(/\r?\n/).filter(l=>l.length);
    if(!lines.length) { setErr("Empty file"); return; }
    const raw = lines[0].split(d).map(h=>String(h).replace(/\uFEFF/g,"").trim());
    const canon = raw.map(nHeader);
    setHeaders(raw);
    setSamples(lines.slice(1,9).map(l=>l.split(d)));
    setPresentCanon(new Set(canon));

    const picked: Mapping = {
      name:guessFor("name", raw), first:guessFor("first", raw), last:guessFor("last", raw),
      email:guessFor("email", raw), phone:guessFor("phone", raw),
      tags:guessFor("tags", raw), note:guessFor("note", raw),
      city:guessFor("city", raw), state:guessFor("state", raw), zip:guessFor("zip", raw),
      address:guessFor("address", raw), dob:guessFor("dob", raw),
    };
    setMapping(m => ({ ...picked, ...m }));
  }

  const validMap = useMemo(()=> {
    const hasName = !!(mapping.name || (mapping.first && mapping.last));
    const hasKey  = !!(mapping.email || mapping.phone);
    return hasName && hasKey;
  }, [mapping]);

  const mappedCount = useMemo(()=>(Object.values(mapping).filter(Boolean).length), [mapping]);

  // Optional fields shown only if present in file
  const optionalFields: Array<{key: keyof Mapping, label: string}> = useMemo(()=>{
    const arr: Array<{key: keyof Mapping, label: string}> = [];
    const add = (canon: string, key: keyof Mapping, label: string) => {
      if (presentCanon.has(canon)) arr.push({ key, label });
    };
    add("city","city","City");
    add("state","state","State");
    add("zip","zip","ZIP");
    add("address","address","Address");
    add("dob","dob","DOB");
    return arr;
  }, [presentCanon]);

  /** —— Import action (ensures TS can see it) —— */
  const importNow = async () => {
    if(!file) return;
    setBusy(true); setErr(null);
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    form.append("options", JSON.stringify(opts));
    try{
      const res = await fetch("/api/uploads/import",{ method:"POST", body:form, credentials:"include" });
      if(!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const inserted = Number(data?.inserted||0), dups = Number(data?.duplicates||0), invalids = Number(data?.invalids||0);
      setRows(r=>[{
        id:crypto.randomUUID(), name:file.name, size:file.size, at:new Date().toISOString(),
        leads:inserted, duplicates:dups, invalids,
        status: inserted>0 && (dups>0 || invalids>0) ? "partial" : inserted>0 ? "success" : "failed"
      },...r]);
      setOpen(false);
    }catch(e:any){ setErr(String(e?.message||"Import failed")); }
    finally{ setBusy(false); }
  };

  return (
    <div className="p-uploads">
      <div className="crumbs"><button className="link" onClick={()=>nav("/dashboard")}>← Dashboard</button><span>› Uploads</span></div>

      <label className="drop" onKeyDown={e=>{ if(e.key==="Enter"||e.key===" ") inputRef.current?.click(); }} tabIndex={0}>
        <input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" style={{display:"none"}}
               onChange={e=> e.target.files && begin(e.target.files[0])}/>
        <div className="drop-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v14"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/></svg>
          <div className="h1">Drop CSV or JSON</div>
          <div className="sub">Click to browse • Max 50MB • UTF-8 • Headers required</div>
        </div>
      </label>

      <div className="card">
        <div className="card-h">Recent uploads</div>
        <div className="table">
          <table><thead><tr><th>File</th><th>Date</th><th className="num">Leads</th><th className="num">Duplicates</th><th className="num">Invalids</th><th>Status</th></tr></thead>
            <tbody>
              {!rows.length && <tr><td colSpan={6} className="empty">No uploads yet.</td></tr>}
              {rows.map(r=>(
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{new Date(r.at).toLocaleString()}</td>
                  <td className="num">{r.leads}</td>
                  <td className="num">{r.duplicates}</td>
                  <td className="num">{r.invalids}</td>
                  <td><span className={`pill ${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-h">
              <div className="w-title">Import Leads</div>
              <button className="icon" onClick={()=>!busy && setOpen(false)}>✕</button>
            </div>

            <div className="grid">
              {/* Preview: ONE scroll area (x & y), sticky header ONLY */}
              <div className="col">
                <div className="label">
                  Preview <span className="muted">({Math.min(samples.length, 8)} rows shown)</span>
                </div>

                <div className="previewWrap">
                  <div className="previewScroll">
                    <table className="previewTable">
                      <colgroup>
                        {headers.map((_, i) => (
                          <col key={i} style={{ width: i === 0 ? "220px" : "180px" }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          {headers.map((h,i)=>(<th key={i} title={h}>{h}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {samples.map((r,i)=>(
                          <tr key={i} className={i%2?"odd":""}>
                            {r.map((c,j)=>(<td key={j} title={c}>{c}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Mapping + Options */}
              <div className="col">
                <div className="label">Map Columns <span className="chip">{mappedCount} mapped</span></div>

                <Picker label="Name (optional if First+Last)" value={mapping.name||""} onChange={v=>setMapping(m=>({...m,name:v}))} options={headers}/>
                <div className="two">
                  <Picker label="First name" value={mapping.first||""} onChange={v=>setMapping(m=>({...m,first:v}))} options={headers}/>
                  <Picker label="Last name"  value={mapping.last||""}  onChange={v=>setMapping(m=>({...m,last:v}))}  options={headers}/>
                </div>
                <div className="two">
                  <Picker label="Email" value={mapping.email||""} onChange={v=>setMapping(m=>({...m,email:v}))} options={headers}/>
                  <Picker label="Phone" value={mapping.phone||""} onChange={v=>setMapping(m=>({...m,phone:v}))} options={headers}/>
                </div>

                {optionalFields.length > 0 && (
                  <>
                    <div className="label sm">Additional fields</div>
                    {optionalFields.map(f => (
                      <Picker key={f.key} label={f.label} value={(mapping[f.key] as string)||""}
                              onChange={v=>setMapping(m=>({...m, [f.key]: v}))} options={headers}/>
                    ))}
                  </>
                )}

                <div className="two">
                  <Picker label="Tags (per row)" value={mapping.tags||""} onChange={v=>setMapping(m=>({...m,tags:v}))} options={headers} placeholder="(none)"/>
                  <Picker label="Note" value={mapping.note||""} onChange={v=>setMapping(m=>({...m, note:v}))} options={headers} placeholder="(none)"/>
                </div>

                <div className="label mt">Configure</div>
                <label className="chk tip">
                  <input type="checkbox" checked={opts.ignoreDuplicates}
                         onChange={e=>setOpts(o=>({...o,ignoreDuplicates:e.target.checked}))}/>
                  Ignore duplicates within file
                  <span className="q" aria-label="File vs DB duplicates"
                        title="Ignores repeated rows in this file only. Existing contacts in your database are still detected and skipped.">?</span>
                </label>
                <div className="two">
                  <div className="stack">
                    <div className="sublabel">Apply tags to all leads</div>
                    <input className="text" placeholder="comma,separated,tags" value={(opts.tags||[]).join(",")}
                      onChange={e=> setOpts(o=>({...o, tags: e.target.value.split(",").map(t=>t.trim()).filter(Boolean)}))}/>
                  </div>
                  <div className="stack">
                    <div className="sublabel">Workflow</div>
                    <select className="select" value={opts.workflowId||""} onChange={e=>setOpts(o=>({...o,workflowId:e.target.value||undefined}))}>
                      <option value="">(none)</option>
                      {workflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </div>

                {!validMap && <div className="warn">Map either <b>Name</b> or <b>First+Last</b>, and at least one of <b>Email</b> or <b>Phone</b>.</div>}
                {err && <div className="err">{err}</div>}

                <div className="actions">
                  <span className="hint">Invalid emails/phones will be skipped automatically.</span>
                  <div className="spacer" />
                  <button className="btn ghost" onClick={()=>setOpen(false)} disabled={busy}>Cancel</button>
                  <button className="btn" onClick={() => void importNow()} disabled={!validMap || busy}>
                    {busy ? "Importing…" : "Import"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* styles */}
      <style>{`
        .p-uploads{padding:14px}
        .link{background:none;border:0;color:var(--accent,#10b981);cursor:pointer}
        .drop{display:grid;place-items:center;border:1px dashed var(--line,#e5e7eb);border-radius:12px;padding:28px;margin:8px 0;background:rgba(16,185,129,.03)}
        .drop-center{display:grid;place-items:center;text-align:center;gap:6px}
        .h1{font-weight:700}
        .sub{color:#6b7280;font-size:12px}
        .card{border:1px solid var(--line,#e5e7eb);border-radius:12px;overflow:hidden}
        .card-h{padding:10px;border-bottom:1px solid var(--line,#e5e7eb);font-weight:700}
        .table{overflow:auto}
        table{width:100%;border-collapse:collapse}
        th,td{padding:10px;border-top:1px solid #e5e7eb}
        .num{text-align:right}
        .empty{color:#6b7280;text-align:center}
        .pill{padding:3px 8px;border-radius:999px;font-size:12px;text-transform:capitalize}
        .pill.success{background:#d1fae5;color:#065f46}.pill.partial{background:#fef3c7;color:#92400e}.pill.failed{background:#fee2e2;color:#991b1b}

        .modal{position:fixed;inset:0;background:rgba(0,0,0,.35);display:grid;place-items:center;z-index:50}
        .sheet{width:min(1100px,95vw);background:#fff;border-radius:14px;border:1px solid #e5e7eb;box-shadow:0 20px 60px rgba(0,0,0,.2)}
        .sheet-h{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e5e7eb}
        .w-title{font-weight:800}
        .icon{background:none;border:0;font-size:18px;cursor:pointer;opacity:.75}

        /* Layout: wider preview, compact mapping column */
        .grid{display:grid;grid-template-columns: 1.55fr .65fr;gap:16px;padding:18px 22px 20px}
        .col{display:grid;gap:10px}
        .label{font-weight:700}
        .label.sm{font-weight:600;font-size:12px;color:#6b7280}
        .chip{margin-left:8px;font-size:12px;background:#ecfdf5;color:#065f46;padding:2px 8px;border-radius:999px}
        .muted{font-size:12px;color:#6b7280;margin-left:8px}

        /* —— PREVIEW: single scroller, sticky header only —— */
        .previewWrap{border:1px solid #e5e7eb;border-radius:10px;background:#fff;overflow:hidden}
        .previewScroll{max-height:280px;overflow:auto}
        .previewScroll::-webkit-scrollbar{height:10px}
        .previewScroll::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:8px}
        .previewScroll:hover::-webkit-scrollbar-thumb{background:#d1d5db}

        .previewTable{border-collapse:separate;border-spacing:0;table-layout:fixed;width:max(100%, calc(var(--colW,180px) * var(--cols,5)))}
        .previewTable thead th{
          position:sticky; top:0; z-index:3;
          background:#f4f6fb; color:#111827;
          font-weight:700; border-bottom:1px solid #e3e5ea;
        }
        .previewTable th, .previewTable td{
          min-width:140px; max-width:320px;
          padding:12px 14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
          border-right:1px solid #f4f4f5; border-bottom:1px solid #f4f4f5; background:#fff;
        }
        .previewTable th:first-child, .previewTable td:first-child{ min-width:220px; }
        .previewTable th:last-child, .previewTable td:last-child{ border-right:none; }
        .previewTable tbody tr.odd td{ background:#fbfbfd; }
        .previewTable tbody tr:hover td{ background:#f8fafc; }

        /* form polish */
        .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .stack{display:grid;gap:6px}
        .sublabel{font-size:12px;color:#6b7280}
        .select,.text{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:0 10px;background:#fff;height:36px;line-height:36px}
        .select.mapped,.text.mapped{background:#f0fdf4;border-color:#bbf7d0}
        .select:focus{outline:0;box-shadow:0 0 0 3px rgba(16,185,129,.25);border-color:#10b981}
        .warn{background:#fffbeb;border:1px solid #fef3c7;color:#92400e;padding:8px 10px;border-radius:8px}
        .err{background:#fef2f2;border:1px solid #fee2e2;color:#991b1b;padding:8px 10px;border-radius:8px}
        .actions{display:flex;align-items:center;gap:12px;margin-top:8px}
        .hint{font-size:12px;color:#6b7280}
        .spacer{flex:1}
        .btn{background:var(--accent,#10b981);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
        .btn.ghost{background:#fff;color:#374151;border:1px solid #e5e7eb}
        .mt{margin-top:8px}

        .chk.tip{ display:flex; align-items:center; gap:6px; }
        .q{ display:inline-grid; place-items:center; width:18px; height:18px; border-radius:50%; font-size:12px; line-height:1; color:#334155; background:#e5e7eb; cursor:help; }
      `}</style>

      {/* Tell the preview table how many columns it has for width calc */}
      <style>{`.previewTable{--cols:${Math.max(headers.length,1)}}`}</style>
    </div>
  );
}

function Picker({ label, value, onChange, options, placeholder }:{
  label:string; value:string; onChange:(v:string)=>void; options:string[]; placeholder?:string;
}){
  return (
    <div className="stack" aria-label={label}>
      <div className="sublabel">{label}</div>
      <select className={`select ${value ? "mapped" : ""}`} value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">{placeholder || "(none)"}</option>
        {options.map(h=><option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}

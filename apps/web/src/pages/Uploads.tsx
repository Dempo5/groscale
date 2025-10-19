import { useRef, useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

// quick header map (client side, same as server)
const H: Record<string,string> = {
  firstname:"first","first name":"first",first:"first",
  lastname:"last","last name":"last",last:"last",
  name:"name","full name":"name",fullname:"name","contact name":"name",
  email:"email","e-mail":"email","email address":"email",
  phone:"phone","phone number":"phone",mobile:"phone",cell:"phone",telephone:"phone",
  primaryphc:"phone",phone2:"phone","primary phone":"phone",
  tags:"tags",label:"tags",labels:"tags",segments:"tags",
  note:"note",notes:"note",dob:"dob","date of birth":"dob",
  city:"city",state:"state",zip:"zip",zipcode:"zip","postal code":"zip",address:"address",
};
const norm = (s:string)=> s.replace(/\uFEFF/g,"").trim().toLowerCase().replace(/\s+/g," ");
const nHeader = (s:string)=> H[norm(s)] || s.trim();
const guessDelim = (text:string)=>([",",";","\t","|"] as const).reduce((best,c)=>{
  const rows = text.split(/\r?\n/).slice(0,6);
  const cnts = rows.map(r => (r.match(new RegExp(c,"g"))||[]).length);
  const avg = cnts.reduce((a,b)=>a+b,0)/(cnts.length||1);
  const varc= cnts.reduce((a,b)=>a+(b-avg)**2,0)/(cnts.length||1);
  return avg - Math.sqrt(varc) > best.score ? {ch:c, score: avg-Math.sqrt(varc)} : best;
},{ch:",",score:-1 as number}).ch;

type Mapping = Partial<Record<"name"|"first"|"last"|"email"|"phone"|"tags"|"note",string>>;
type Row = { id:string; name:string; size:number; at:string; leads:number; duplicates:number; invalids:number; status:"success"|"partial"|"failed"; };

export default function Uploads(){
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement|null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File|null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [samples, setSamples] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [opts, setOpts] = useState<{ignoreDuplicates:boolean; tags:string[]; workflowId?:string}>({ ignoreDuplicates:false, tags:[] });
  const [workflows, setWorkflows] = useState<{id:string; name:string}[]>([]);
  const [err, setErr] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);

  // Load workflows if server supports it; fallback to empty silently.
  useEffect(()=>{ (async()=>{
    try{
      const res = await fetch("/api/workflows", { credentials:"include" });
      if(res.ok){ const data = await res.json(); setWorkflows((data||[]).map((w:any)=>({id:w.id,name:w.name}))); }
    }catch{}
  })(); },[]);

  // parse preview
  const readText = (f:File)=>new Promise<string>((res,rej)=>{ const fr=new FileReader(); fr.onerror=()=>rej(fr.error); fr.onload=()=>res(String(fr.result||"")); fr.readAsText(f); });
  async function begin(f:File){
    setErr(null); setFile(f); setOpen(true);
    const text = await readText(f);
    const d = guessDelim(text);
    const lines = text.split(/\r?\n/).filter(l=>l.length);
    if(!lines.length) { setErr("Empty file"); return; }
    const raw = lines[0].split(d).map(h=>String(h).replace(/\uFEFF/g,"").trim());
    const normed = raw.map(nHeader);
    setHeaders(raw);
    setSamples(lines.slice(1,7).map(l=>l.split(d)));
    // auto guess
    const find = (canon:string)=> { const i = normed.findIndex(h=>norm(h)===canon); return i>=0? raw[i] : ""; };
    setMapping(m => ({ name: find("name"), first:find("first"), last:find("last"), email:find("email"), phone:find("phone"), tags:find("tags"), note:find("note"), ...m }));
  }

  const validMap = useMemo(()=> {
    const hasName = !!(mapping.name || (mapping.first && mapping.last));
    const hasKey = !!(mapping.email || mapping.phone);
    return hasName && hasKey;
  }, [mapping]);

  async function importNow(){
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
  }

  return (
    <div className="p-uploads">
      <div className="crumbs"><button className="link" onClick={()=>nav("/dashboard")}>← Dashboard</button><span>› Uploads</span></div>
      <label className="drop" onKeyDown={e=>{ if(e.key==="Enter"||e.key===" ") inputRef.current?.click(); }} tabIndex={0}>
        <input ref={inputRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=> e.target.files && begin(e.target.files[0])}/>
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

      {/* Modal */}
      {open && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-h">
              <div className="w-title">Import Leads</div>
              <button className="icon" onClick={()=>!busy && setOpen(false)}>✕</button>
            </div>

            {/* Compact, 1-screen wizard */}
            <div className="grid">
              {/* Preview */}
              <div className="col">
                <div className="label">Preview</div>
                <div className="preview">
                  <div className="row head">{headers.map((h,i)=><div key={i}>{h}</div>)}</div>
                  {samples.map((r,i)=><div className="row" key={i}>{r.map((c,j)=><div key={j} title={c}>{c}</div>)}</div>)}
                </div>
              </div>

              {/* Mapping + Options */}
              <div className="col">
                <div className="label">Map Columns</div>
                <Picker label="Name (optional if First+Last)" value={mapping.name||""} onChange={v=>setMapping(m=>({...m,name:v}))} options={headers}/>
                <div className="two">
                  <Picker label="First name" value={mapping.first||""} onChange={v=>setMapping(m=>({...m,first:v}))} options={headers}/>
                  <Picker label="Last name"  value={mapping.last||""}  onChange={v=>setMapping(m=>({...m,last:v}))}  options={headers}/>
                </div>
                <div className="two">
                  <Picker label="Email" value={mapping.email||""} onChange={v=>setMapping(m=>({...m,email:v}))} options={headers}/>
                  <Picker label="Phone" value={mapping.phone||""} onChange={v=>setMapping(m=>({...m,phone:v}))} options={headers}/>
                </div>
                <div className="two">
                  <Picker label="Tags (per row)" value={mapping.tags||""} onChange={v=>setMapping(m=>({...m,tags:v}))} options={headers} placeholder="(none)"/>
                  <Picker label="Note" value={mapping.note||""} onChange={v=>setMapping(m=>({...m,note:v}))} options={headers} placeholder="(none)"/>
                </div>

                <div className="label mt">Configure</div>
                <label className="chk">
                  <input type="checkbox" checked={opts.ignoreDuplicates} onChange={e=>setOpts(o=>({...o,ignoreDuplicates:e.target.checked}))}/> Ignore duplicates within file
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
                  <button className="btn ghost" onClick={()=>setOpen(false)} disabled={busy}>Cancel</button>
                  <button className="btn" onClick={importNow} disabled={!validMap || busy}>{busy?"Importing…":"Import"}</button>
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
        th,td{padding:10px;border-top:1px solid var(--line,#e5e7eb)}
        .num{text-align:right}
        .empty{color:#6b7280;text-align:center}
        .pill{padding:3px 8px;border-radius:999px;font-size:12px;text-transform:capitalize}
        .pill.success{background:#d1fae5;color:#065f46}.pill.partial{background:#fef3c7;color:#92400e}.pill.failed{background:#fee2e2;color:#991b1b}
        .modal{position:fixed;inset:0;background:rgba(0,0,0,.35);display:grid;place-items:center;z-index:50}
        .sheet{width:min(1100px,95vw);background:#fff;border-radius:14px;border:1px solid #e5e7eb;box-shadow:0 20px 60px rgba(0,0,0,.2)}
        .sheet-h{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #e5e7eb}
        .w-title{font-weight:800}
        .icon{background:none;border:0;font-size:18px;cursor:pointer;opacity:.75}
        .grid{display:grid;grid-template-columns: 1.2fr .8fr;gap:16px;padding:14px}
        .col{display:grid;gap:10px}
        .label{font-weight:700}
        .preview{border:1px solid #e5e7eb;border-radius:8px;max-height:260px;overflow:auto}
        .row{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));border-top:1px solid #f3f4f6}
        .row.head{position:sticky;top:0;background:#f9fafb;font-weight:700}
        .row>div{padding:8px 10px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .stack{display:grid;gap:6px}
        .sublabel{font-size:12px;color:#6b7280}
        .select,.text{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;background:#fff}
        .warn{background:#fffbeb;border:1px solid #fef3c7;color:#92400e;padding:8px 10px;border-radius:8px}
        .err{background:#fef2f2;border:1px solid #fee2e2;color:#991b1b;padding:8px 10px;border-radius:8px}
        .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
        .btn{background:var(--accent,#10b981);color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
        .btn.ghost{background:#fff;color:#374151;border:1px solid #e5e7eb}
        .mt{margin-top:8px}
      `}</style>
    </div>
  );
}

function Picker({ label, value, onChange, options, placeholder }:{
  label:string; value:string; onChange:(v:string)=>void; options:string[]; placeholder?:string;
}){
  return (
    <div className="stack">
      <div className="sublabel">{label}</div>
      <select className="select" value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">{placeholder || "(none)"}</option>
        {options.map(h=><option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}
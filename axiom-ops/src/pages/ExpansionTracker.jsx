import { useState } from 'react';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
const DEFAULT_EXPANSION = {
  GA: { state:'Georgia',       abbr:'GA', status:'In Progress', credentialing:60, staffHired:2, staffNeeded:4, firstPatientDate:'2026-05-01', weeklyVisitTarget:80,  currentVisits:0, notes:'', color:'#059669' },
  TX: { state:'Texas',         abbr:'TX', status:'Planning',    credentialing:20, staffHired:0, staffNeeded:6, firstPatientDate:'2026-07-01', weeklyVisitTarget:120, currentVisits:0, notes:'', color:'#1565C0' },
  NC: { state:'North Carolina',abbr:'NC', status:'Planning',    credentialing:10, staffHired:0, staffNeeded:3, firstPatientDate:'2026-08-01', weeklyVisitTarget:60,  currentVisits:0, notes:'', color:'#7C3AED' },
};
 
const STATUS_META = {
  'Live':        { color:B.green,  bg:'#F0FDF4', border:'#BBF7D0', icon:'🟢' },
  'In Progress': { color:B.orange, bg:'#FFF7ED', border:'#FED7AA', icon:'🟡' },
  'Planning':    { color:B.blue,   bg:'#EFF6FF', border:'#BFDBFE', icon:'🔵' },
  'On Hold':     { color:B.gray,   bg:'#F9FAFB', border:'#E5E7EB', icon:'⚪' },
};
 
export default function ExpansionTracker() {
  const [data, setData] = useState(() => {
    try { const s=localStorage.getItem('axiom_expansion'); return s?JSON.parse(s):DEFAULT_EXPANSION; } catch{ return DEFAULT_EXPANSION; }
  });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft]     = useState(null);
 
  const save = () => {
    const updated = { ...data, [editing]: draft };
    setData(updated);
    localStorage.setItem('axiom_expansion', JSON.stringify(updated));
    setEditing(null); setDraft(null);
  };
 
  const startEdit = (key) => { setEditing(key); setDraft({ ...data[key] }); };
  const setF = (k,v) => setDraft(p=>({...p,[k]:v}));
  const fmtDate = d => { try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch{return d;} };
  const daysTo = d => { try { return Math.ceil((new Date(d+'T12:00:00')-new Date())/86400000); } catch{return null;} };
 
  const states = Object.entries(data);
  const totalTargetVisits = states.reduce((s,[,v])=>s+v.weeklyVisitTarget,0);
  const totalCurrentVisits = states.reduce((s,[,v])=>s+(v.currentVisits||0),0);
  const totalStaffNeeded = states.reduce((s,[,v])=>s+v.staffNeeded,0);
  const totalStaffHired  = states.reduce((s,[,v])=>s+(v.staffHired||0),0);
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>🌎 Expansion Tracker</div>
        <div style={{ fontSize:13, color:B.gray }}>State expansion progress for FL → GA, TX, NC/SC</div>
      </div>
 
      {/* Summary KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Expansion States', value:states.length, color:B.red, icon:'🌎' },
          { label:'Staff Hired',      value:`${totalStaffHired}/${totalStaffNeeded}`, color:totalStaffHired>=totalStaffNeeded?B.green:B.yellow, icon:'👤' },
          { label:'Visit Target',     value:`${totalCurrentVisits}/${totalTargetVisits}`, color:B.blue, icon:'📅', sub:'visits/wk when live' },
          { label:'Live States',      value:states.filter(([,v])=>v.status==='Live').length, color:B.green, icon:'🟢' },
        ].map(k=>(
          <div key={k.label} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:18, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:B.gray, marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
 
      {/* State cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:16 }}>
        {states.map(([key, state]) => {
          const meta = STATUS_META[state.status] || STATUS_META['Planning'];
          const days = daysTo(state.firstPatientDate);
          const credColor = state.credentialing>=80?B.green:state.credentialing>=50?B.yellow:B.danger;
          const staffPct  = state.staffNeeded>0?Math.round((state.staffHired||0)/state.staffNeeded*100):0;
          const isEditing = editing===key;
 
          return (
            <div key={key} style={{ background:B.card, border:`1.5px solid ${meta.color}`, borderRadius:16, overflow:'hidden', boxShadow:`0 2px 12px ${meta.color}15` }}>
              {/* Header */}
              <div style={{ background:`linear-gradient(135deg,${state.color}15,${state.color}05)`, padding:'16px 18px', borderBottom:`1px solid ${B.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:state.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff' }}>{state.abbr}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:B.black }}>{state.state}</div>
                    <span style={{ fontSize:10, fontWeight:700, color:meta.color, background:meta.bg, border:`1px solid ${meta.border}`, borderRadius:10, padding:'2px 8px' }}>
                      {meta.icon} {state.status}
                    </span>
                  </div>
                </div>
                <button onClick={()=>isEditing?setEditing(null):startEdit(key)}
                  style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                  {isEditing?'Cancel':'✏️ Edit'}
                </button>
              </div>
 
              {/* Content */}
              {!isEditing ? (
                <div style={{ padding:'16px 18px' }}>
                  {/* Credentialing */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:B.gray }}>Credentialing Progress</span>
                      <span style={{ fontSize:12, fontWeight:700, color:credColor }}>{state.credentialing}%</span>
                    </div>
                    <div style={{ height:7, background:'rgba(0,0,0,0.07)', borderRadius:4 }}>
                      <div style={{ height:'100%', width:`${state.credentialing}%`, background:credColor, borderRadius:4 }} />
                    </div>
                  </div>
 
                  {/* Staff */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:B.gray }}>Staff Hired</span>
                      <span style={{ fontSize:12, fontWeight:700, color:staffPct>=100?B.green:B.orange }}>{state.staffHired||0}/{state.staffNeeded}</span>
                    </div>
                    <div style={{ height:7, background:'rgba(0,0,0,0.07)', borderRadius:4 }}>
                      <div style={{ height:'100%', width:`${staffPct}%`, background:staffPct>=100?B.green:B.orange, borderRadius:4 }} />
                    </div>
                  </div>
 
                  {/* Stats grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                    <div style={{ background:B.bg, borderRadius:8, padding:'10px 12px' }}>
                      <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', marginBottom:2 }}>First Patient</div>
                      <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{fmtDate(state.firstPatientDate)}</div>
                      {days !== null && <div style={{ fontSize:10, color:days<=0?B.green:days<=30?B.orange:B.lightGray }}>{days<=0?'Past due':`${days} days away`}</div>}
                    </div>
                    <div style={{ background:B.bg, borderRadius:8, padding:'10px 12px' }}>
                      <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', marginBottom:2 }}>Visit Target</div>
                      <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{state.weeklyVisitTarget}/wk</div>
                      <div style={{ fontSize:10, color:B.lightGray }}>{state.currentVisits||0} current</div>
                    </div>
                  </div>
 
                  {state.notes && (
                    <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:8, padding:'9px 12px', fontSize:12, color:B.blue }}>
                      {state.notes}
                    </div>
                  )}
                </div>
              ) : (
                /* Edit form */
                <div style={{ padding:'16px 18px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                    {[
                      {label:'Status',key:'status',type:'select',opts:Object.keys(STATUS_META)},
                      {label:'Credentialing %',key:'credentialing',type:'number'},
                      {label:'Staff Hired',key:'staffHired',type:'number'},
                      {label:'Staff Needed',key:'staffNeeded',type:'number'},
                      {label:'First Patient Date',key:'firstPatientDate',type:'date'},
                      {label:'Weekly Visit Target',key:'weeklyVisitTarget',type:'number'},
                      {label:'Current Weekly Visits',key:'currentVisits',type:'number'},
                    ].map(f=>(
                      <div key={f.key}>
                        <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:3 }}>{f.label}</label>
                        {f.type==='select' ? (
                          <select value={draft[f.key]||''} onChange={e=>setF(f.key,e.target.value)}
                            style={{ width:'100%', padding:'7px 9px', border:`1px solid ${B.border}`, borderRadius:7, fontSize:12, fontFamily:'inherit', outline:'none', background:'#fff', boxSizing:'border-box' }}>
                            {f.opts.map(o=><option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input type={f.type} value={draft[f.key]??''} onChange={e=>setF(f.key,f.type==='number'?parseInt(e.target.value)||0:e.target.value)}
                            style={{ width:'100%', padding:'7px 9px', border:`1px solid ${B.border}`, borderRadius:7, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:B.black }} />
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ gridColumn:'1/-1', marginBottom:10 }}>
                    <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:3 }}>Notes</label>
                    <textarea value={draft.notes||''} onChange={e=>setF('notes',e.target.value)} rows={2}
                      style={{ width:'100%', padding:'7px 9px', border:`1px solid ${B.border}`, borderRadius:7, fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical', boxSizing:'border-box', color:B.black }} />
                  </div>
                  <button onClick={save}
                    style={{ width:'100%', background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:9, color:'#fff', padding:'10px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
 

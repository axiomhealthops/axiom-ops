import { useState } from 'react';
import { useOpsData } from '../hooks/useOpsData';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#FBF7F6', card:'#fff',
  green:'#2E7D32', yellow:'#D97706', danger:'#DC2626', blue:'#1565C0',
};
 
const STATUS_META = {
  active:              { label:'Active',             color:B.green,  bg:'#F0FDF4', border:'#BBF7D0', icon:'✅', desc:'In treatment' },
  active_auth_pending: { label:'Active–Auth Pending', color:B.orange, bg:'#FFF7ED', border:'#FED7AA', icon:'⏳', desc:'Treating, auth at risk' },
  auth_pending:        { label:'Auth Pending',        color:B.yellow, bg:'#FFFBEB', border:'#FDE68A', icon:'🔒', desc:'Blocked — no auth' },
  soc_pending:         { label:'SOC Pending',         color:B.blue,   bg:'#EFF6FF', border:'#BFDBFE', icon:'📅', desc:'Start of care pending' },
  eval_pending:        { label:'Eval Pending',        color:'#1565C0',bg:'#EFF6FF', border:'#BFDBFE', icon:'🩺', desc:'Pipeline' },
  waitlist:            { label:'Waitlist',            color:'#7C3AED',bg:'#F5F3FF', border:'#DDD6FE', icon:'📋', desc:'Needs scheduling' },
  on_hold:             { label:'On Hold',             color:'#6B7280',bg:'#F9FAFB', border:'#E5E7EB', icon:'⏸️', desc:'Revenue paused' },
  on_hold_facility:    { label:'On Hold–Facility',    color:'#9CA3AF',bg:'#F9FAFB', border:'#E5E7EB', icon:'🏥', desc:'Facility hold' },
  on_hold_pt:          { label:'On Hold–Pt Req',      color:'#9CA3AF',bg:'#F9FAFB', border:'#E5E7EB', icon:'🙋', desc:'Patient requested' },
  on_hold_md:          { label:'On Hold–MD Req',      color:'#9CA3AF',bg:'#F9FAFB', border:'#E5E7EB', icon:'👨‍⚕️', desc:'MD ordered hold' },
  hospitalized:        { label:'Hospitalized',        color:B.danger, bg:'#FEF2F2', border:'#FECACA', icon:'🚨', desc:'In hospital' },
  discharge:           { label:'Discharge',           color:'#BBA8A4',bg:'#FAFAFA', border:'#E5E7EB', icon:'📤', desc:'Discharged' },
};
 
const CFG = { authRiskVisitsPerWeek: 3, avgReimbursement: 90 };
 
export default function PatientCensus() {
  const { censusData, hasCensus, loading } = useOpsData();
 
  // Merge daysInStatus from localStorage census (has 'changed' date)
  // Supabase patient_census doesn't store 'changed', so we enrich from localStorage
  const localCensus = (() => {
    try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch { return null; }
  })();
  const localPatientMap = {};
  if (localCensus?.patients) {
    localCensus.patients.forEach(p => { localPatientMap[p.name] = p; });
  }
 
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('summary');
 
  const effectiveCensus = localCensus || censusData;
  const effectiveHasCensus = !!(localCensus || hasCensus);
 
  if (loading && !localCensus) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans', sans-serif" }}>
      Loading census data...
    </div>
  );
 
  const regionKeys = effectiveHasCensus ? Object.keys(effectiveCensus?.byRegion||{}).sort() : [];
  const displayCounts = effectiveHasCensus && selectedRegion !== 'all' && effectiveCensus?.byRegion?.[selectedRegion]
    ? effectiveCensus?.byRegion?.[selectedRegion]
    : (effectiveHasCensus ? effectiveCensus?.counts : null);
  const displayTotal = effectiveHasCensus && selectedRegion !== 'all' && effectiveCensus?.byRegion?.[selectedRegion]
    ? effectiveCensus?.byRegion?.[selectedRegion]?.total
    : (effectiveCensus?.total || 0);
  const displayActive = effectiveHasCensus && selectedRegion !== 'all' && effectiveCensus?.byRegion?.[selectedRegion]
    ? effectiveCensus?.byRegion?.[selectedRegion]?.activeCensus
    : (effectiveCensus?.activeCensus || 0);
 
  // Use localStorage census directly if available (has daysInStatus + full patient data)
  // Fall back to Supabase censusData if not
  const sourceData = localCensus || censusData;
  const sourceHasCensus = !!(localCensus || hasCensus);
  const allPatients = sourceHasCensus ? (sourceData?.patients || []) : [];
  const filteredPatients = allPatients
    .filter(p => selectedRegion === 'all' || p.region === selectedRegion)
    .filter(p => selectedStatus === 'all' || p.status === selectedStatus)
    .filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));
 
  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>👥 Patient Census</h1>
          {effectiveHasCensus && (
            <p style={{ fontSize:13, color:B.gray, margin:0 }}>
              {effectiveCensus?.total} total patients · <span style={{ color:B.green, fontWeight:700 }}>{effectiveCensus?.activeCensus} active census</span> · Updated {effectiveCensus?.lastUpdated}
            </p>
          )}
          {effectiveHasCensus && (
            <p style={{ fontSize:11, color:B.lightGray, margin:'4px 0 0' }}>
              Live data — updates automatically when director uploads a new census
            </p>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {['summary','patients'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding:'7px 14px', borderRadius:8, border:`1px solid ${view===v ? B.red : B.border}`,
              background: view===v ? '#FFF5F2' : 'transparent',
              color: view===v ? B.red : B.gray,
              fontSize:12, fontWeight: view===v ? 700 : 400, cursor:'pointer', fontFamily:'inherit',
            }}>{v === 'summary' ? '📊 Summary' : '📋 Patient List'}</button>
          ))}
        </div>
      </div>
 
      {!effectiveHasCensus ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>👥</div>
          <div style={{ fontSize:16, fontWeight:700, color:B.black, marginBottom:8 }}>No census data loaded</div>
          <div style={{ fontSize:13, color:B.gray }}>Your director will upload the Pariox Patient Census — it will appear here automatically</div>
        </div>
      ) : (
        <>
          {/* Region filters */}
          <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:11, color:B.lightGray, marginRight:2 }}>Region:</span>
            {['all', ...regionKeys].map(r => (
              <button key={r} onClick={() => setSelectedRegion(r)} style={{
                padding:'5px 10px', borderRadius:6, border:`1px solid ${selectedRegion===r ? B.red : B.border}`,
                background: selectedRegion===r ? '#FFF5F2' : 'transparent',
                color: selectedRegion===r ? B.red : B.gray,
                fontSize:11, fontWeight: selectedRegion===r ? 700 : 400, cursor:'pointer', fontFamily:'inherit',
              }}>{r === 'all' ? 'All' : r}</button>
            ))}
          </div>
 
          {/* Hero stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:20 }}>
            {[
              { label:'Active Census', value:displayActive, sub:'Active + Active-Auth Pending', color:B.green, bg:'#F0FDF4', border:'#BBF7D0' },
              { label:'Total in System', value:displayTotal, sub:`${selectedRegion==='all'?'All regions':'Region '+selectedRegion}`, color:B.red, bg:'#FFF5F2', border:'#FDDDD5' },
              { label:'On Hold', value:(displayCounts?.on_hold||0)+(displayCounts?.on_hold_facility||0)+(displayCounts?.on_hold_pt||0)+(displayCounts?.on_hold_md||0), sub:'Revenue paused', color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB' },
            ].map(m => (
              <div key={m.label} style={{ background:m.bg, border:`1px solid ${m.border}`, borderRadius:14, padding:'20px 24px' }}>
                <div style={{ fontSize:11, color:m.color, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{m.label}</div>
                <div style={{ fontSize:38, fontWeight:800, color:m.color, fontFamily:"'DM Mono', monospace", lineHeight:1 }}>{m.value ?? '—'}</div>
                <div style={{ fontSize:11, color:m.color, opacity:0.7, marginTop:6 }}>{m.sub}</div>
              </div>
            ))}
          </div>
 
          {view === 'summary' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
                {Object.entries(STATUS_META).map(([key, meta]) => {
                  const count = (displayCounts?.[key]) || 0;
                  const pct = displayTotal > 0 ? Math.round(count/displayTotal*100) : 0;
                  return (
                    <div key={key} onClick={() => { setSelectedStatus(selectedStatus===key?'all':key); setView('patients'); }}
                      style={{ background:meta.bg, border:`1px solid ${selectedStatus===key ? meta.color : meta.border}`,
                        borderRadius:12, padding:'12px 14px', cursor:'pointer', position:'relative', overflow:'hidden',
                        transition:'all 0.15s', boxShadow: selectedStatus===key ? `0 0 0 2px ${meta.color}40` : 'none' }}>
                      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:meta.color }} />
                      <div style={{ fontSize:10, color:meta.color, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{meta.icon} {meta.label}</div>
                      <div style={{ fontSize:26, fontWeight:800, color:meta.color, fontFamily:"'DM Mono', monospace", lineHeight:1 }}>{count}</div>
                      <div style={{ fontSize:10, color:meta.color, opacity:0.7, marginTop:3 }}>{pct}% · {meta.desc}</div>
                      <div style={{ marginTop:6, height:3, background:'rgba(0,0,0,0.08)', borderRadius:2 }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:meta.color, borderRadius:2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
 
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                {[
                  { label:'🔒 Auth Revenue Risk', count:(displayCounts?.auth_pending||0)+(displayCounts?.active_auth_pending||0), color:B.yellow, bg:'#FFFBEB', border:'#FDE68A', desc:'patients blocked' },
                  { label:'⏸️ On Hold Paused Revenue', count:(displayCounts?.on_hold||0)+(displayCounts?.on_hold_facility||0)+(displayCounts?.on_hold_pt||0)+(displayCounts?.on_hold_md||0), color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB', desc:'patients paused' },
                  { label:'📅 SOC Ready to Start', count:displayCounts?.soc_pending||0, color:B.blue, bg:'#EFF6FF', border:'#BFDBFE', desc:'awaiting scheduling' },
                ].map(r => {
                  const weeklyRev = r.count * CFG.authRiskVisitsPerWeek * CFG.avgReimbursement;
                  return (
                    <div key={r.label} style={{ background:r.bg, border:`1px solid ${r.border}`, borderRadius:12, padding:'16px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:r.color, marginBottom:4 }}>{r.label}</div>
                        <div style={{ fontSize:11, color:r.color, opacity:0.8 }}>{r.count} {r.desc}</div>
                        <div style={{ fontSize:11, color:r.color, fontWeight:700, marginTop:4 }}>~${(weeklyRev/1000).toFixed(1)}K/wk</div>
                      </div>
                      <div style={{ fontSize:32, fontWeight:800, color:r.color, fontFamily:"'DM Mono', monospace" }}>{r.count}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
 
          {view === 'patients' && (
            <>
              <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient name..."
                  style={{ padding:'8px 14px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13,
                    fontFamily:'inherit', outline:'none', color:B.black, width:240 }} />
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                  style={{ padding:'8px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13,
                    fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
                  <option value="all">All Statuses</option>
                  {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
                <span style={{ fontSize:12, color:B.lightGray, marginLeft:'auto' }}>{filteredPatients.length} patients</span>
              </div>
 
              <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'220px 70px 150px 100px 1fr', padding:'9px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                  {['Patient','Region','Status','Payer','Days in Status'].map(h => (
                    <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
                  ))}
                </div>
                {filteredPatients.slice(0,100).map((p, i) => {
                  const meta = STATUS_META[p.status] || STATUS_META.active;
                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'220px 70px 150px 100px 1fr', padding:'9px 18px', borderBottom:`1px solid #FAF4F2`, alignItems:'center' }}>
                      <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{p.name}</div>
                      <div style={{ fontSize:12, color:B.gray }}>{p.region}</div>
                      <div>
                        <span style={{ background:meta.bg, color:meta.color, border:`1px solid ${meta.border}`, borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:700 }}>
                          {meta.icon} {meta.label}
                        </span>
                      </div>
                      <div style={{ fontSize:11, color:B.gray }}>{p.payer}</div>
                      <div style={{ fontSize:11, color: (p.daysInStatus||0) > 30 ? B.danger : (p.daysInStatus||0) > 14 ? B.yellow : B.lightGray }}>
                        {p.daysInStatus != null ? `${p.daysInStatus}d` : '—'}
                      </div>
                    </div>
                  );
                })}
                {filteredPatients.length > 100 && (
                  <div style={{ padding:'12px 18px', fontSize:12, color:B.lightGray, textAlign:'center', borderTop:`1px solid ${B.border}` }}>
                    Showing 100 of {filteredPatients.length} — use filters to narrow results
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

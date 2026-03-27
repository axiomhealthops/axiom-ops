import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626',
  blue:'#1D4ED8', purple:'#7C3AED',
};
 
// Region → coordinator mapping
const REGION_ASSIGNMENTS = {
  'A': 'Gypsy Renos',
  'B': 'Mary Imperio', 'C': 'Mary Imperio', 'G': 'Mary Imperio',
  'H': 'Audrey Sarmiento', 'J': 'Audrey Sarmiento', 'M': 'Audrey Sarmiento', 'N': 'Audrey Sarmiento',
  'T': 'April Manalo', 'V': 'April Manalo',
};
 
const COORD_REGIONS = {
  'Gypsy Renos':     ['A'],
  'Mary Imperio':    ['B','C','G'],
  'Audrey Sarmiento':['H','J','M','N'],
  'April Manalo':    ['T','V'],
};
 
const STATUS_META = {
  active:              { label:'Active',            color:B.green,   bg:'#F0FDF4', border:'#BBF7D0', icon:'✅', priority:7 },
  active_auth_pending: { label:'Active–Auth Pend',  color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', icon:'⏳', priority:2 },
  auth_pending:        { label:'Auth Pending',       color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'🔒', priority:2 },
  soc_pending:         { label:'SOC Pending',        color:'#0284C7', bg:'#F0F9FF', border:'#BAE6FD', icon:'📅', priority:1 },
  eval_pending:        { label:'Eval Pending',       color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE', icon:'🩺', priority:1 },
  waitlist:            { label:'Waitlist',           color:B.purple,  bg:'#F5F3FF', border:'#DDD6FE', icon:'📋', priority:3 },
  on_hold:             { label:'On Hold',            color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB', icon:'⏸️', priority:4 },
  on_hold_facility:    { label:'On Hold–Facility',   color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'🏥', priority:4 },
  on_hold_pt:          { label:'On Hold–Pt Req',     color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'🙋', priority:5 },
  on_hold_md:          { label:'On Hold–MD Req',     color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'👨‍⚕️', priority:5 },
  hospitalized:        { label:'Hospitalized',       color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨', priority:3 },
  discharge:           { label:'Discharged',         color:'#BBA8A4', bg:'#FAFAFA', border:'#E5E7EB', icon:'📤', priority:8 },
};
 
const URGENCY_FLAGS = {
  soc_pending:         { label:'SOC Overdue',    threshold:2,  color:B.danger  },
  eval_pending:        { label:'Eval Overdue',   threshold:3,  color:B.danger  },
  on_hold:             { label:'Hold 30d+',      threshold:30, color:B.orange  },
  on_hold_facility:    { label:'Hold 14d+',      threshold:14, color:B.orange  },
  active_auth_pending: { label:'Auth at Risk',   threshold:0,  color:B.orange  },
  waitlist:            { label:'Waitlist 5d+',   threshold:5,  color:B.yellow  },
};
 
function daysSince(d) {
  if (!d) return null;
  const parsed = new Date(d);
  if (isNaN(parsed)) return null;
  return Math.floor((new Date() - parsed) / 86400000);
}
 
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}); } catch { return d; }
}
 
function AgeBadge({ days, threshold }) {
  if (days === null) return <span style={{ color:B.lightGray }}>—</span>;
  const urgent = threshold !== undefined && days >= threshold;
  const color  = urgent ? B.danger : days > 7 ? B.orange : days > 3 ? B.yellow : B.green;
  return (
    <span style={{ fontSize:11, fontWeight:700, color, fontFamily:'monospace' }}>
      {urgent && '⚠️ '}{days}d
    </span>
  );
}
 
// ── Patient Notes Modal ───────────────────────────────────────
function PatientNotesModal({ patient, currentUser, onClose }) {
  const [notes, setNotes]       = useState('');
  const [history, setHistory]   = useState([]);
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
 
  useEffect(() => {
    supabase.from('care_coord_notes')
      .select('*')
      .eq('patient_name', patient.name)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setHistory(data||[]); setLoading(false); });
  }, [patient.name]);
 
  const save = async () => {
    if (!notes.trim()) return;
    setSaving(true);
    await supabase.from('care_coord_notes').insert({
      patient_name:    patient.name,
      patient_region:  patient.region,
      patient_status:  patient.status,
      coordinator:     currentUser,
      note:            notes.trim(),
      created_at:      new Date().toISOString(),
    });
    setNotes('');
    setSaving(false);
    const { data } = await supabase.from('care_coord_notes')
      .select('*').eq('patient_name', patient.name).order('created_at', { ascending: false });
    setHistory(data||[]);
  };
 
  const sm = STATUS_META[patient.status] || STATUS_META.active;
 
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:B.card, borderRadius:20, padding:28, width:'100%', maxWidth:520, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:B.black }}>{patient.name}</div>
            <div style={{ display:'flex', gap:8, marginTop:4, flexWrap:'wrap' }}>
              <span style={{ fontSize:10, fontWeight:700, color:sm.color, background:sm.bg, border:`1px solid ${sm.border}`, borderRadius:10, padding:'2px 8px' }}>{sm.icon} {sm.label}</span>
              <span style={{ fontSize:10, color:B.lightGray }}>Region {patient.region}</span>
              {patient.daysInStatus !== null && <span style={{ fontSize:10, color:B.gray }}>{patient.daysInStatus}d in status</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
        </div>
 
        {/* Patient details */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
          {[
            { label:'Insurance', value:patient.ins||'—' },
            { label:'SOC Date',  value:patient.soc?fmtDate(patient.soc):'—' },
            { label:'Discipline',value:patient.disc||'—' },
            { label:'Referral',  value:patient.ref||'—' },
          ].map(f=>(
            <div key={f.label} style={{ background:B.bg, borderRadius:8, padding:'8px 12px' }}>
              <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', marginBottom:2 }}>{f.label}</div>
              <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{f.value}</div>
            </div>
          ))}
        </div>
 
        {/* Add note */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Add Contact Note</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
            placeholder="Who you spoke with, outcome, next steps, reschedule date..."
            style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
          <button onClick={save} disabled={!notes.trim()||saving}
            style={{ marginTop:8, background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 20px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!notes.trim()||saving?0.5:1 }}>
            {saving?'Saving...':'Log Note'}
          </button>
        </div>
 
        {/* Note history */}
        {loading ? (
          <div style={{ fontSize:12, color:B.lightGray, textAlign:'center', padding:16 }}>Loading history...</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize:12, color:B.lightGray, textAlign:'center', padding:16 }}>No notes yet for this patient</div>
        ) : (
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', marginBottom:8 }}>Contact History</div>
            {history.map(h=>(
              <div key={h.id} style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:8, padding:'10px 12px', marginBottom:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:B.red }}>{h.coordinator?.split(' ')[0]}</span>
                  <span style={{ fontSize:10, color:B.lightGray }}>{new Date(h.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
                </div>
                <div style={{ fontSize:12, color:B.black, lineHeight:1.5 }}>{h.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
 
// ── Main CareCoordApp ─────────────────────────────────────────
export default function CareCoordApp() {
  const { profile } = useAuth();
  const coordinatorName = profile?.full_name || profile?.name || '';
  const assignedRegions = COORD_REGIONS[coordinatorName] || [];
  const allRegions = Object.keys(REGION_ASSIGNMENTS);
  const isPreview = assignedRegions.length === 0;
  const myRegions = isPreview ? allRegions : assignedRegions;
  const firstName = isPreview ? 'Director' : coordinatorName.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
 
  const [activeTab, setActiveTab]       = useState('queue');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showDischarged, setShowDischarged] = useState(false);
 
  // Load census from localStorage (uploaded by director)
  const censusData = useMemo(() => {
    try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch { return null; }
  }, []);
 
  // Load Pariox visit data
  const csvData = useMemo(() => {
    try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch { return null; }
  }, []);
 
  // My patients — scoped to my regions
  const myPatients = useMemo(() => {
    if (!censusData?.patients) return [];
    return censusData.patients
      .filter(p => myRegions.includes(p.region))
      .map(p => ({
        ...p,
        daysInStatus: daysSince(p.changed),
        urgencyFlag: (() => {
          const f = URGENCY_FLAGS[p.status];
          if (!f) return null;
          const days = daysSince(p.changed);
          if (f.threshold === 0) return f; // always flag
          if (days !== null && days >= f.threshold) return f;
          return null;
        })(),
        priority: STATUS_META[p.status]?.priority ?? 9,
      }))
      .sort((a,b) => {
        // Urgent first, then by days in status desc
        if (a.urgencyFlag && !b.urgencyFlag) return -1;
        if (!a.urgencyFlag && b.urgencyFlag) return 1;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (b.daysInStatus||0) - (a.daysInStatus||0);
      });
  }, [censusData, myRegions]);
 
  // My missed/incomplete visits from Pariox — scoped to my regions
  const missedVisits = useMemo(() => {
    if (!csvData?.staffStats) return [];
    // Get from regionData
    const result = [];
    myRegions.forEach(region => {
      const rd = csvData.regionData?.[region];
      if (!rd?.clinicianList) return;
      rd.clinicianList.forEach(c => {
        const missed = c.scheduled - c.completed;
        if (missed > 0) {
          result.push({ clinician: c.name, region, scheduled: c.scheduled, completed: c.completed, missed, patients: c.patients });
        }
      });
    });
    return result.sort((a,b) => b.missed - a.missed);
  }, [csvData, myRegions]);
 
  // KPIs
  const active     = myPatients.filter(p => ['active','active_auth_pending'].includes(p.status));
  const socPending = myPatients.filter(p => p.status === 'soc_pending');
  const evalPending= myPatients.filter(p => p.status === 'eval_pending');
  const onHold     = myPatients.filter(p => p.status.startsWith('on_hold'));
  const urgent     = myPatients.filter(p => p.urgencyFlag);
  const newRefs    = myPatients.filter(p => ['soc_pending','eval_pending','waitlist'].includes(p.status));
  const totalMissed= missedVisits.reduce((s,v)=>s+v.missed,0);
 
  // Filtered visible patients
  const visiblePatients = useMemo(() => {
    let list = myPatients;
    if (!showDischarged) list = list.filter(p => p.status !== 'discharge');
    if (filterStatus !== 'all') list = list.filter(p => p.status === filterStatus);
    if (search) list = list.filter(p => (p.name||'').toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [myPatients, showDischarged, filterStatus, search]);
 
  const noData = !censusData;
  const noRegions = false; // super admin sees all regions when unassigned
 
  if (noRegions) return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", padding:'48px', textAlign:'center' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
      <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>No regions assigned</div>
      <div style={{ fontSize:13, color:B.gray }}>Your account ({coordinatorName}) doesn't have regions assigned yet. Contact your director.</div>
    </div>
  );
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
 
      {/* Personal header */}
      <div style={{ background:`linear-gradient(135deg,${B.darkRed},${B.red},${B.orange})`, borderRadius:16, padding:'20px 24px', marginBottom:20, position:'relative', overflow:'hidden', boxShadow:'0 4px 16px rgba(139,26,16,0.2)' }}>
        <div style={{ position:'absolute', inset:0, opacity:0.05, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
        <div style={{ position:'relative', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>Care Coordination</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:2 }}>{greeting}, {firstName} 👋</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)' }}>
              {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · {isPreview ? 'All Regions (Preview)' : `Regions: ${myRegions.join(', ')}`}
            </div>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            {[
              { label:'My Patients', value:myPatients.filter(p=>p.status!=='discharge').length, color:'#fff' },
              { label:'Urgent',      value:urgent.length, color:urgent.length>0?'#FDE68A':'#BBF7D0' },
              { label:'Missed Visits',value:totalMissed, color:totalMissed>0?'#FCA5A5':'#BBF7D0' },
            ].map((s,i)=>(
              <div key={s.label} style={{ textAlign:'center', paddingLeft:i>0?20:0, borderLeft:i>0?'1px solid rgba(255,255,255,0.2)':'none' }}>
                <div style={{ fontSize:28, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
 
      {/* Urgent alert banner */}
      {urgent.length > 0 && (
        <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, padding:'12px 18px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:B.danger }}>🚨 {urgent.length} patient{urgent.length!==1?'s':''} need immediate attention</div>
            <div style={{ fontSize:12, color:B.danger, opacity:0.8, marginTop:2 }}>
              {urgent.slice(0,3).map(p=>`${p.name} (${p.urgencyFlag?.label})`).join(' · ')}{urgent.length>3?` +${urgent.length-3} more`:''}
            </div>
          </div>
          <button onClick={()=>{ setFilterStatus('all'); setActiveTab('queue'); }}
            style={{ background:B.danger, border:'none', borderRadius:8, color:'#fff', padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
            View All
          </button>
        </div>
      )}
 
      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Active Census',  value:active.length,      color:B.green,  icon:'✅', tab:'queue', status:'active' },
          { label:'SOC Pending',    value:socPending.length,  color:'#0284C7',icon:'📅', tab:'queue', status:'soc_pending' },
          { label:'Eval Pending',   value:evalPending.length, color:B.blue,   icon:'🩺', tab:'queue', status:'eval_pending' },
          { label:'On Hold',        value:onHold.length,      color:B.gray,   icon:'⏸️', tab:'queue', status:'on_hold' },
          { label:'Missed Visits',  value:totalMissed,        color:totalMissed>0?B.danger:B.green, icon:'❌', tab:'missed' },
        ].map(k=>(
          <div key={k.label} onClick={()=>{ setActiveTab(k.tab); if(k.status) setFilterStatus(k.status==='active'?'all':k.status); }}
            style={{ background:B.card, border:`1.5px solid ${k.value>0&&k.label!=='Active Census'?`${k.color}50`:B.border}`, borderRadius:12, padding:'14px', textAlign:'center', cursor:'pointer', transition:'all 0.15s', boxShadow:k.value>0&&k.label!=='Active Census'?`0 2px 8px ${k.color}20`:'none' }}>
            <div style={{ fontSize:18, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:24, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:10, color:B.gray, marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
 
      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${B.border}`, marginBottom:16 }}>
        {[
          { key:'queue',   label:'📋 Patient Queue' },
          { key:'missed',  label:`❌ Missed Visits${totalMissed>0?` (${totalMissed})`:''}` },
          { key:'onhold',  label:`⏸️ On Hold (${onHold.length})` },
          { key:'referrals',label:`🆕 New Referrals (${newRefs.length})` },
        ].map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            style={{ background:'none', border:'none', borderBottom:`2px solid ${activeTab===t.key?B.red:'transparent'}`, color:activeTab===t.key?B.red:B.gray, padding:'10px 18px', fontSize:13, fontWeight:activeTab===t.key?700:400, cursor:'pointer', fontFamily:'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>
 
      {noData && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'40px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>📂</div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No census data loaded</div>
          <div style={{ fontSize:13, color:B.gray }}>Ask your director to upload the latest Pariox patient census.</div>
        </div>
      )}
 
      {/* Patient Queue tab */}
      {!noData && activeTab === 'queue' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient..."
              style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:180 }} />
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_META).filter(([k])=>k!=='discharge').map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:B.gray, cursor:'pointer' }}>
              <input type="checkbox" checked={showDischarged} onChange={e=>setShowDischarged(e.target.checked)} /> Show Discharged
            </label>
            <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visiblePatients.length} patients</span>
          </div>
 
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 130px 70px 80px 90px 80px', padding:'8px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {['Patient','Rgn','Status','Days','Insurance','SOC Date',''].map(h=>(
                <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
              ))}
            </div>
            {visiblePatients.length === 0 ? (
              <div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No patients match these filters</div>
            ) : visiblePatients.map(p => {
              const sm = STATUS_META[p.status] || STATUS_META.active;
              const hasFlag = !!p.urgencyFlag;
              return (
                <div key={p.name} style={{ display:'grid', gridTemplateColumns:'1fr 60px 130px 70px 80px 90px 80px', padding:'9px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:hasFlag?'#FFF8F8':'transparent' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:8 }}>
                    {hasFlag && <span style={{ color:B.danger, marginRight:4 }}>⚠️</span>}
                    {p.name}
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:B.gray }}>{p.region}</div>
                  <div>
                    <span style={{ fontSize:9, fontWeight:700, color:sm.color, background:sm.bg, border:`1px solid ${sm.border}`, borderRadius:10, padding:'2px 6px', whiteSpace:'nowrap' }}>
                      {sm.icon} {sm.label}
                    </span>
                  </div>
                  <div><AgeBadge days={p.daysInStatus} threshold={URGENCY_FLAGS[p.status]?.threshold} /></div>
                  <div style={{ fontSize:11, color:B.gray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.ins||'—'}</div>
                  <div style={{ fontSize:11, color:B.gray }}>{p.soc?fmtDate(p.soc):'—'}</div>
                  <div>
                    <button onClick={()=>setSelectedPatient(p)}
                      style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                      Notes
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
 
      {/* Missed Visits tab */}
      {!noData && activeTab === 'missed' && (
        <>
          <div style={{ fontSize:13, color:B.gray, marginBottom:14 }}>
            Clinicians in your regions with incomplete visits this week. Follow up to reschedule.
          </div>
          {missedVisits.length === 0 ? (
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:14, padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:24, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:14, fontWeight:700, color:B.green }}>No missed visits in your regions this week!</div>
            </div>
          ) : (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 80px 80px 80px 80px', padding:'8px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Clinician','Region','Scheduled','Completed','Missed','Patients'].map(h=>(
                  <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                ))}
              </div>
              {missedVisits.map((v,i)=>(
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 60px 80px 80px 80px 80px', padding:'10px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{v.clinician}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:B.gray }}>{v.region}</div>
                  <div style={{ fontSize:13, color:B.black, fontFamily:'monospace' }}>{v.scheduled}</div>
                  <div style={{ fontSize:13, color:B.green, fontWeight:700, fontFamily:'monospace' }}>{v.completed}</div>
                  <div style={{ fontSize:13, fontWeight:800, color:B.danger, fontFamily:'monospace' }}>{v.missed}</div>
                  <div style={{ fontSize:12, color:B.gray, fontFamily:'monospace' }}>{v.patients}</div>
                </div>
              ))}
              <div style={{ padding:'10px 16px', background:'#FBF7F6', borderTop:`1px solid ${B.border}`, display:'grid', gridTemplateColumns:'1fr 60px 80px 80px 80px 80px', alignItems:'center' }}>
                <div style={{ fontSize:11, fontWeight:700, color:B.gray }}>TOTAL</div>
                <div />
                <div style={{ fontSize:13, fontWeight:700, fontFamily:'monospace' }}>{missedVisits.reduce((s,v)=>s+v.scheduled,0)}</div>
                <div style={{ fontSize:13, fontWeight:700, color:B.green, fontFamily:'monospace' }}>{missedVisits.reduce((s,v)=>s+v.completed,0)}</div>
                <div style={{ fontSize:13, fontWeight:800, color:B.danger, fontFamily:'monospace' }}>{totalMissed}</div>
                <div />
              </div>
            </div>
          )}
        </>
      )}
 
      {/* On Hold tab */}
      {!noData && activeTab === 'onhold' && (
        <>
          <div style={{ fontSize:13, color:B.gray, marginBottom:14 }}>
            On-hold patients in your regions. Follow up to get them back to active care.
          </div>
          {onHold.length === 0 ? (
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:14, padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:14, fontWeight:700, color:B.green }}>No on-hold patients in your regions.</div>
            </div>
          ) : (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 140px 70px 80px 80px', padding:'8px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Patient','Rgn','Hold Type','Days on Hold','Insurance',''].map(h=>(
                  <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                ))}
              </div>
              {onHold.sort((a,b)=>(b.daysInStatus||0)-(a.daysInStatus||0)).map(p=>{
                const sm = STATUS_META[p.status] || STATUS_META.on_hold;
                const urgent = (p.daysInStatus||0) >= 14;
                return (
                  <div key={p.name} style={{ display:'grid', gridTemplateColumns:'1fr 60px 140px 70px 80px 80px', padding:'9px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:urgent?'#FFF8F8':'transparent' }}>
                    <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{urgent&&'⚠️ '}{p.name}</div>
                    <div style={{ fontSize:11, color:B.gray }}>{p.region}</div>
                    <div><span style={{ fontSize:9, fontWeight:700, color:sm.color, background:sm.bg, border:`1px solid ${sm.border}`, borderRadius:10, padding:'2px 6px' }}>{sm.icon} {sm.label}</span></div>
                    <div><AgeBadge days={p.daysInStatus} threshold={14} /></div>
                    <div style={{ fontSize:11, color:B.gray }}>{p.ins||'—'}</div>
                    <div>
                      <button onClick={()=>setSelectedPatient(p)}
                        style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                        Notes
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
 
      {/* New Referrals tab */}
      {!noData && activeTab === 'referrals' && (
        <>
          <div style={{ fontSize:13, color:B.gray, marginBottom:14 }}>
            New and pending patients in your regions requiring scheduling or follow-up.
          </div>
          {newRefs.length === 0 ? (
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:14, padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:14, fontWeight:700, color:B.green }}>No pending referrals in your regions.</div>
            </div>
          ) : (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 130px 70px 80px 90px 80px', padding:'8px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Patient','Rgn','Status','Days Waiting','Insurance','SOC Date',''].map(h=>(
                  <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                ))}
              </div>
              {newRefs.sort((a,b)=>(b.daysInStatus||0)-(a.daysInStatus||0)).map(p=>{
                const sm = STATUS_META[p.status] || STATUS_META.soc_pending;
                return (
                  <div key={p.name} style={{ display:'grid', gridTemplateColumns:'1fr 60px 130px 70px 80px 90px 80px', padding:'9px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center' }}>
                    <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{p.name}</div>
                    <div style={{ fontSize:11, color:B.gray }}>{p.region}</div>
                    <div><span style={{ fontSize:9, fontWeight:700, color:sm.color, background:sm.bg, border:`1px solid ${sm.border}`, borderRadius:10, padding:'2px 6px', whiteSpace:'nowrap' }}>{sm.icon} {sm.label}</span></div>
                    <div><AgeBadge days={p.daysInStatus} threshold={URGENCY_FLAGS[p.status]?.threshold} /></div>
                    <div style={{ fontSize:11, color:B.gray }}>{p.ins||'—'}</div>
                    <div style={{ fontSize:11, color:B.gray }}>{p.soc?fmtDate(p.soc):'—'}</div>
                    <div>
                      <button onClick={()=>setSelectedPatient(p)}
                        style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                        Notes
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
 
      {/* Patient Notes Modal */}
      {selectedPatient && (
        <PatientNotesModal
          patient={selectedPatient}
          currentUser={coordinatorName}
          onClose={()=>setSelectedPatient(null)}
        />
      )}
    </div>
  );
}
 

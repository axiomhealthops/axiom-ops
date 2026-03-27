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
 
const COORD_REGIONS = {
  'Gypsy Renos':      ['A'],
  'Mary Imperio':     ['B','C','G'],
  'Audrey Sarmiento': ['H','J','M','N'],
  'April Manalo':     ['T','V'],
};
const ALL_REGIONS = ['A','B','C','G','H','J','M','N','T','V'];
 
const STATUS_META = {
  active:              { label:'Active',           color:B.green,   bg:'#F0FDF4', border:'#BBF7D0', icon:'✅', priority:7 },
  active_auth_pending: { label:'Active–Auth Pend', color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', icon:'⏳', priority:2 },
  auth_pending:        { label:'Auth Pending',      color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'🔒', priority:2 },
  soc_pending:         { label:'SOC Pending',       color:'#0284C7', bg:'#F0F9FF', border:'#BAE6FD', icon:'📅', priority:1 },
  eval_pending:        { label:'Eval Pending',      color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE', icon:'🩺', priority:1 },
  waitlist:            { label:'Waitlist',          color:B.purple,  bg:'#F5F3FF', border:'#DDD6FE', icon:'📋', priority:3 },
  on_hold:             { label:'On Hold',           color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB', icon:'⏸️', priority:4 },
  on_hold_facility:    { label:'On Hold–Facility',  color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'🏥', priority:4 },
  on_hold_pt:          { label:'On Hold–Pt Req',    color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'🙋', priority:5 },
  on_hold_md:          { label:'On Hold–MD Req',    color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'👨‍⚕️', priority:5 },
  hospitalized:        { label:'Hospitalized',      color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨', priority:3 },
  discharge:           { label:'Discharged',        color:'#BBA8A4', bg:'#FAFAFA', border:'#E5E7EB', icon:'📤', priority:8 },
};
 
const URGENCY = {
  soc_pending:         { threshold:2,  label:'SOC Overdue'   },
  eval_pending:        { threshold:3,  label:'Eval Overdue'  },
  on_hold:             { threshold:30, label:'Hold 30d+'     },
  on_hold_facility:    { threshold:14, label:'Hold 14d+'     },
  active_auth_pending: { threshold:0,  label:'Auth at Risk'  },
  waitlist:            { threshold:5,  label:'Waitlist 5d+'  },
};
 
function daysSince(d) {
  if (!d) return null;
  const p = new Date(d); if (isNaN(p)) return null;
  return Math.floor((new Date() - p) / 86400000);
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}); } catch { return d; }
}
 
// ── Patient Detail Panel ──────────────────────────────────────
function PatientPanel({ patient, coordinatorName, onClose, onDischarge }) {
  const [notes, setNotes]     = useState('');
  const [history, setHistory] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState('notes');
 
  useEffect(() => {
    supabase.from('care_coord_notes').select('*')
      .eq('patient_name', patient.name)
      .order('created_at', { ascending:false })
      .then(({ data }) => setHistory(data||[]));
  }, [patient.name]);
 
  const save = async () => {
    if (!notes.trim()) return;
    setSaving(true);
    await supabase.from('care_coord_notes').insert({
      patient_name: patient.name, patient_region: patient.region,
      patient_status: patient.status, coordinator: coordinatorName,
      note: notes.trim(), created_at: new Date().toISOString(),
    });
    setNotes('');
    setSaving(false);
    const { data } = await supabase.from('care_coord_notes').select('*')
      .eq('patient_name', patient.name).order('created_at', { ascending:false });
    setHistory(data||[]);
  };
 
  const sm = STATUS_META[patient.status] || STATUS_META.active;
 
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:B.card, borderRadius:20, padding:28, width:'100%', maxWidth:540, maxHeight:'88vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:B.black }}>{patient.name}</div>
            <div style={{ display:'flex', gap:6, marginTop:5, flexWrap:'wrap' }}>
              <span style={{ fontSize:10, fontWeight:700, color:sm.color, background:sm.bg, border:`1px solid ${sm.border}`, borderRadius:10, padding:'2px 8px' }}>{sm.icon} {sm.label}</span>
              <span style={{ fontSize:10, color:B.lightGray, background:B.bg, borderRadius:10, padding:'2px 8px' }}>Region {patient.region}</span>
              {patient.daysInStatus !== null && <span style={{ fontSize:10, color:B.gray, background:B.bg, borderRadius:10, padding:'2px 8px' }}>{patient.daysInStatus}d in status</span>}
              {patient.urgencyFlag && <span style={{ fontSize:10, fontWeight:700, color:B.danger, background:'#FEF2F2', borderRadius:10, padding:'2px 8px' }}>⚠️ {patient.urgencyFlag}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
        </div>
 
        {/* Patient info grid */}
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
 
        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:`1px solid ${B.border}`, marginBottom:14 }}>
          {[{key:'notes',label:'Contact Notes'},{key:'discharge',label:'Discharge'}].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{ background:'none', border:'none', borderBottom:`2px solid ${tab===t.key?B.red:'transparent'}`, color:tab===t.key?B.red:B.gray, padding:'8px 16px', fontSize:13, fontWeight:tab===t.key?700:400, cursor:'pointer', fontFamily:'inherit' }}>
              {t.label}
            </button>
          ))}
        </div>
 
        {/* Notes tab */}
        {tab === 'notes' && (
          <>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
              placeholder="Log contact note — who you spoke with, outcome, next steps, reschedule date..."
              style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${B.border}`, borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box', marginBottom:8 }} />
            <button onClick={save} disabled={!notes.trim()||saving}
              style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!notes.trim()||saving?0.5:1, marginBottom:16 }}>
              {saving?'Saving...':'Log Note'}
            </button>
            {history.length > 0 && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', marginBottom:8 }}>History</div>
                {history.map(h=>(
                  <div key={h.id} style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:8, padding:'10px 12px', marginBottom:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:B.red }}>{h.coordinator?.split(' ')[0]}</span>
                      <span style={{ fontSize:10, color:B.lightGray }}>{new Date(h.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
                    </div>
                    <div style={{ fontSize:12, color:B.black, lineHeight:1.5 }}>{h.note}</div>
                  </div>
                ))}
              </div>
            )}
            {history.length === 0 && <div style={{ fontSize:12, color:B.lightGray, textAlign:'center', padding:'16px 0' }}>No notes yet</div>}
          </>
        )}
 
        {/* Discharge tab */}
        {tab === 'discharge' && (
          <DischargeForm patient={patient} coordinatorName={coordinatorName} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
 
// ── Discharge Form ────────────────────────────────────────────
function DischargeForm({ patient, coordinatorName, onClose }) {
  const [form, setForm] = useState({
    reason: '', date: new Date().toISOString().split('T')[0],
    lastVisitDate: '', clinician: '', notes: '',
    docComplete: false, physicianSigned: false, patientNotified: false,
  });
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));
 
  const REASONS = ['Goals Met','Patient Request','Physician Order','Moved Out of Area','Hospitalized','Deceased','Non-Compliant','Insurance Terminated','Other'];
 
  const save = async () => {
    if (!form.reason) return;
    setSaving(true);
    await supabase.from('care_coord_discharges').insert({
      patient_name:       patient.name,
      patient_region:     patient.region,
      patient_insurance:  patient.ins || null,
      discharge_reason:   form.reason,
      discharge_date:     form.date,
      last_visit_date:    form.lastVisitDate || null,
      clinician:          form.clinician || null,
      notes:              form.notes || null,
      doc_complete:       form.docComplete,
      physician_signed:   form.physicianSigned,
      patient_notified:   form.patientNotified,
      coordinator:        coordinatorName,
      created_at:         new Date().toISOString(),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 1500);
  };
 
  if (saved) return (
    <div style={{ textAlign:'center', padding:'32px 0' }}>
      <div style={{ fontSize:32, marginBottom:10 }}>✅</div>
      <div style={{ fontSize:15, fontWeight:700, color:B.green }}>Discharge logged successfully</div>
    </div>
  );
 
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div>
        <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:4 }}>Discharge Reason *</label>
        <select value={form.reason} onChange={e=>setF('reason',e.target.value)}
          style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${form.reason?B.red:B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>
          <option value="">Select reason...</option>
          {REASONS.map(r=><option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {[
          {label:'Discharge Date', key:'date', type:'date'},
          {label:'Last Visit Date', key:'lastVisitDate', type:'date'},
          {label:'Treating Clinician', key:'clinician', type:'text', ph:'Clinician name'},
        ].map(f=>(
          <div key={f.key} style={{ gridColumn: f.key==='clinician'?'1/-1':'auto' }}>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:4 }}>{f.label}</label>
            <input type={f.type} value={form[f.key]} placeholder={f.ph||''}
              onChange={e=>setF(f.key,e.target.value)}
              style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
          </div>
        ))}
      </div>
      <div>
        <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:4 }}>Notes</label>
        <textarea value={form.notes} onChange={e=>setF('notes',e.target.value)} rows={2}
          placeholder="Additional discharge notes..."
          style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
      </div>
      {/* Checklist */}
      <div style={{ background:B.bg, borderRadius:10, padding:'12px 14px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:8 }}>Discharge Checklist</div>
        {[
          {key:'docComplete',      label:'Documentation complete'},
          {key:'physicianSigned',  label:'Physician discharge order signed'},
          {key:'patientNotified',  label:'Patient / family notified'},
        ].map(c=>(
          <label key={c.key} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, cursor:'pointer', fontSize:13, color:B.black }}>
            <input type="checkbox" checked={form[c.key]} onChange={e=>setF(c.key,e.target.checked)}
              style={{ width:16, height:16 }} />
            {c.label}
          </label>
        ))}
      </div>
      <button onClick={save} disabled={!form.reason||saving}
        style={{ background:`linear-gradient(135deg,${B.danger},#B91C1C)`, border:'none', borderRadius:10, color:'#fff', padding:'12px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!form.reason||saving?0.5:1 }}>
        {saving?'Saving...':'Log Discharge'}
      </button>
    </div>
  );
}
 
// ── Main Page ─────────────────────────────────────────────────
export default function CareCoordPatientQueue({ initialFilter }) {
  const { profile } = useAuth();
  const coordinatorName = profile?.full_name || profile?.name || '';
  const assignedRegions = COORD_REGIONS[coordinatorName] || [];
  const isPreview       = assignedRegions.length === 0;
  const myRegions       = isPreview ? ALL_REGIONS : assignedRegions;
 
  const [filterStatus, setFilterStatus]   = useState(initialFilter || 'all');
  const [filterRegion, setFilterRegion]   = useState('all');
  const [search, setSearch]               = useState('');
  const [showDischarged, setShowDischarged] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [sortBy, setSortBy]               = useState('urgency');
 
  const censusData = useMemo(() => {
    try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch { return null; }
  }, []);
 
  const myPatients = useMemo(() => {
    if (!censusData?.patients) return [];
    return censusData.patients
      .filter(p => myRegions.includes(p.region))
      .map(p => {
        const days = daysSince(p.changed);
        const uf   = URGENCY[p.status];
        const flag = uf && (uf.threshold === 0 || (days !== null && days >= uf.threshold)) ? uf.label : null;
        return { ...p, daysInStatus: days, urgencyFlag: flag, priority: STATUS_META[p.status]?.priority ?? 9 };
      });
  }, [censusData, myRegions]);
 
  const visible = useMemo(() => {
    let list = myPatients;
    if (!showDischarged) list = list.filter(p => p.status !== 'discharge');
    if (filterStatus !== 'all') {
      if (filterStatus === 'on_hold_all') list = list.filter(p => p.status.startsWith('on_hold'));
      else list = list.filter(p => p.status === filterStatus);
    }
    if (filterRegion !== 'all') list = list.filter(p => p.region === filterRegion);
    if (search) list = list.filter(p => (p.name||'').toLowerCase().includes(search.toLowerCase()));
    if (sortBy === 'urgency') list = [...list].sort((a,b) => {
      if (a.urgencyFlag && !b.urgencyFlag) return -1;
      if (!a.urgencyFlag && b.urgencyFlag) return 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (b.daysInStatus||0) - (a.daysInStatus||0);
    });
    if (sortBy === 'name')    list = [...list].sort((a,b) => (a.name||'').localeCompare(b.name||''));
    if (sortBy === 'days')    list = [...list].sort((a,b) => (b.daysInStatus||0) - (a.daysInStatus||0));
    if (sortBy === 'region')  list = [...list].sort((a,b) => (a.region||'').localeCompare(b.region||''));
    return list;
  }, [myPatients, showDischarged, filterStatus, filterRegion, search, sortBy]);
 
  // Status counts
  const counts = useMemo(() => {
    const c = {};
    myPatients.filter(p=>p.status!=='discharge').forEach(p => { c[p.status] = (c[p.status]||0)+1; });
    return c;
  }, [myPatients]);
 
  const urgentCount = myPatients.filter(p=>p.urgencyFlag).length;
  const regions     = [...new Set(myPatients.map(p=>p.region).filter(Boolean))].sort();
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>👥 Patient Queue</div>
          <div style={{ fontSize:13, color:B.gray }}>
            {isPreview ? 'All Regions (Preview)' : `Your regions: ${myRegions.join(', ')}`}
            {' · '}{myPatients.filter(p=>p.status!=='discharge').length} active patients
            {urgentCount > 0 && <span style={{ color:B.danger, fontWeight:700 }}> · ⚠️ {urgentCount} urgent</span>}
          </div>
        </div>
      </div>
 
      {/* Status filter pills */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        {[
          { key:'all',            label:'All',          count:myPatients.filter(p=>p.status!=='discharge').length },
          { key:'soc_pending',    label:'SOC Pending',  count:counts.soc_pending||0,    color:'#0284C7' },
          { key:'eval_pending',   label:'Eval Pending', count:counts.eval_pending||0,   color:B.blue    },
          { key:'active',         label:'Active',       count:counts.active||0,          color:B.green   },
          { key:'active_auth_pending', label:'Auth Risk', count:counts.active_auth_pending||0, color:B.orange },
          { key:'on_hold_all',    label:'On Hold',      count:(['on_hold','on_hold_facility','on_hold_pt','on_hold_md'].reduce((s,k)=>s+(counts[k]||0),0)), color:B.gray },
          { key:'waitlist',       label:'Waitlist',     count:counts.waitlist||0,        color:B.purple  },
          { key:'hospitalized',   label:'Hospitalized', count:counts.hospitalized||0,    color:B.danger  },
        ].map(f => (
          <button key={f.key} onClick={()=>setFilterStatus(f.key)}
            style={{ padding:'5px 12px', borderRadius:20, border:`1.5px solid ${filterStatus===f.key?(f.color||B.red):B.border}`, background:filterStatus===f.key?(f.color||B.red)+'15':'transparent', color:filterStatus===f.key?(f.color||B.red):B.gray, fontSize:12, fontWeight:filterStatus===f.key?700:400, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
            {f.label}
            {f.count > 0 && <span style={{ background:filterStatus===f.key?(f.color||B.red):'rgba(0,0,0,0.1)', color:filterStatus===f.key?'#fff':B.gray, borderRadius:10, padding:'0 6px', fontSize:10, fontWeight:700 }}>{f.count}</span>}
          </button>
        ))}
      </div>
 
      {/* Search + sort row */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient..."
          style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:180 }} />
        {myRegions.length > 1 && (
          <select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)}
            style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
            <option value="all">All Regions</option>
            {regions.map(r=><option key={r} value={r}>Region {r}</option>)}
          </select>
        )}
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
          style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
          <option value="urgency">Sort: Urgency</option>
          <option value="days">Sort: Days in Status</option>
          <option value="name">Sort: Name A-Z</option>
          <option value="region">Sort: Region</option>
        </select>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:B.gray, cursor:'pointer' }}>
          <input type="checkbox" checked={showDischarged} onChange={e=>setShowDischarged(e.target.checked)} /> Discharged
        </label>
        <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visible.length} patients</span>
      </div>
 
      {!censusData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'40px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>📂</div>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No census data</div>
          <div style={{ fontSize:13, color:B.gray }}>Ask your director to upload the latest census.</div>
        </div>
      ) : (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 55px 140px 65px 90px 95px 75px', padding:'8px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
            {['Patient','Rgn','Status','Days','Insurance','SOC Date',''].map(h=>(
              <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
            ))}
          </div>
 
          {visible.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No patients match these filters</div>
          ) : visible.map(p => {
            const sm  = STATUS_META[p.status] || STATUS_META.active;
            const uf  = URGENCY[p.status];
            const urgent = !!p.urgencyFlag;
            const daysColor = p.daysInStatus === null ? B.lightGray
              : uf && p.daysInStatus >= uf.threshold ? B.danger
              : p.daysInStatus > 7 ? B.orange
              : B.green;
            return (
              <div key={p.name} style={{ display:'grid', gridTemplateColumns:'1fr 55px 140px 65px 90px 95px 75px', padding:'9px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:urgent?'#FFF8F8':'transparent' }}>
                <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:8 }}>
                  {urgent && <span style={{ color:B.danger, marginRight:4, fontSize:10 }}>⚠️</span>}
                  {p.name}
                </div>
                <div style={{ fontSize:11, fontWeight:700, color:B.gray }}>{p.region}</div>
                <div>
                  <span style={{ fontSize:9, fontWeight:700, color:sm.color, background:sm.bg, border:`1px solid ${sm.border}`, borderRadius:10, padding:'2px 6px', whiteSpace:'nowrap' }}>
                    {sm.icon} {sm.label}
                  </span>
                </div>
                <div style={{ fontSize:11, fontWeight:700, color:daysColor, fontFamily:'monospace' }}>
                  {p.daysInStatus !== null ? `${p.daysInStatus}d` : '—'}
                </div>
                <div style={{ fontSize:11, color:B.gray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.ins||'—'}</div>
                <div style={{ fontSize:11, color:B.gray }}>{p.soc?fmtDate(p.soc):'—'}</div>
                <div style={{ display:'flex', gap:4 }}>
                  <button onClick={()=>setSelectedPatient(p)}
                    style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'4px 9px', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
 
      {selectedPatient && (
        <PatientPanel
          patient={selectedPatient}
          coordinatorName={coordinatorName}
          onClose={()=>setSelectedPatient(null)}
        />
      )}
    </div>
  );
}
 

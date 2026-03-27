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
 
const HOLD_META = {
  on_hold:          { label:'On Hold',          color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB', icon:'⏸️', reason:'General hold' },
  on_hold_facility: { label:'On Hold – Facility', color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'🏥', reason:'Facility-based hold' },
  on_hold_pt:       { label:'On Hold – PT Req',  color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'🙋', reason:'Patient requested hold' },
  on_hold_md:       { label:'On Hold – MD Req',  color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'👨‍⚕️', reason:'MD ordered hold' },
};
 
const RECOVERY_STATUS = {
  not_started: { label:'Not Started', color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'○' },
  working:     { label:'Working',     color:B.blue,   bg:'#EFF6FF', border:'#BFDBFE', icon:'🔄' },
  contacted:   { label:'Contacted',   color:B.yellow, bg:'#FFFBEB', border:'#FDE68A', icon:'📞' },
  ready:       { label:'Ready to Return', color:B.green, bg:'#F0FDF4', border:'#BBF7D0', icon:'✅' },
  lost:        { label:'Lost',        color:B.danger, bg:'#FEF2F2', border:'#FECACA', icon:'❌' },
};
 
const CARE_COORDINATORS = ['Gypsy Renos','Mary Imperio','Audrey Sarmiento','April Manalo','Unassigned'];
 
function daysSince(d) {
  if (!d) return null;
  return Math.floor((new Date() - new Date(d+'T12:00:00')) / 86400000);
}
 
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});
}
 
function AgeBadge({ days }) {
  if (days === null) return <span style={{ color:B.lightGray }}>—</span>;
  const color = days <= 14 ? B.green : days <= 30 ? B.yellow : days <= 60 ? B.orange : B.danger;
  const bg    = days <= 14 ? '#F0FDF4' : days <= 30 ? '#FFFBEB' : days <= 60 ? '#FFF7ED' : '#FEF2F2';
  return (
    <span style={{ background:bg, color, border:`1px solid ${color}30`, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>
      {days}d
    </span>
  );
}
 
// ── Edit Modal ────────────────────────────────────────────────
function RecoveryEditModal({ record, onSave, onClose, currentUser }) {
  const [form, setForm] = useState({
    recovery_status: record.recovery_status || 'not_started',
    assigned_coordinator: record.assigned_coordinator || '',
    last_contact_date: record.last_contact_date || '',
    last_contact_notes: record.last_contact_notes || '',
    target_return_date: record.target_return_date || '',
    recovery_notes: record.recovery_notes || '',
  });
  const [saving, setSaving] = useState(false);
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));
 
  const save = async () => {
    setSaving(true);
    const timestamp = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    let notes = form.recovery_notes;
    // Append note with timestamp if last_contact_notes changed
    if (form.last_contact_notes && form.last_contact_notes !== record.last_contact_notes) {
      const prev = record.recovery_notes ? record.recovery_notes + '\n\n' : '';
      notes = `${prev}[${timestamp} – ${currentUser}] ${form.last_contact_notes}`;
    }
    await supabase.from('on_hold_recovery').update({
      recovery_status: form.recovery_status,
      assigned_coordinator: form.assigned_coordinator || null,
      last_contact_date: form.last_contact_date || null,
      last_contact_notes: form.last_contact_notes || null,
      target_return_date: form.target_return_date || null,
      recovery_notes: notes,
      updated_at: new Date().toISOString(),
      ...(form.recovery_status === 'ready' ? { ready_at: new Date().toISOString() } : {}),
    }).eq('id', record.id);
    setSaving(false);
    onSave();
  };
 
  const rs = RECOVERY_STATUS[form.recovery_status] || RECOVERY_STATUS.not_started;
 
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:B.card, borderRadius:20, padding:28, width:'100%', maxWidth:540, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
 
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:B.black }}>{record.patient_name}</div>
            <div style={{ fontSize:12, color:B.gray, marginTop:2 }}>{HOLD_META[record.hold_status]?.label||record.hold_status} · {record.payer||'—'} · Region {record.region||'—'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
        </div>
 
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Recovery Status</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {Object.entries(RECOVERY_STATUS).map(([k,v])=>(
                <button key={k} onClick={()=>setF('recovery_status',k)}
                  style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${form.recovery_status===k?v.color:B.border}`, background:form.recovery_status===k?v.bg:'transparent', color:form.recovery_status===k?v.color:B.gray, fontSize:12, fontWeight:form.recovery_status===k?700:400, cursor:'pointer', fontFamily:'inherit' }}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
          </div>
 
          <div>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Assigned Coordinator</label>
            <select value={form.assigned_coordinator} onChange={e=>setF('assigned_coordinator',e.target.value)}
              style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>
              <option value="">Unassigned</option>
              {CARE_COORDINATORS.filter(c=>c!=='Unassigned').map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
 
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Last Contact Date</label>
              <input type="date" value={form.last_contact_date} onChange={e=>setF('last_contact_date',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Target Return Date</label>
              <input type="date" value={form.target_return_date} onChange={e=>setF('target_return_date',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
            </div>
          </div>
 
          <div>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Contact Notes (appended to log)</label>
            <textarea value={form.last_contact_notes} onChange={e=>setF('last_contact_notes',e.target.value)} rows={3}
              placeholder="Who you spoke with, what was discussed, next steps..."
              style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
          </div>
 
          {record.recovery_notes && (
            <div style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', marginBottom:6 }}>Contact History</div>
              <div style={{ fontSize:11, color:B.black, whiteSpace:'pre-wrap', maxHeight:120, overflowY:'auto' }}>{record.recovery_notes}</div>
            </div>
          )}
        </div>
 
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'9px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving}
            style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
 
// ── Main ──────────────────────────────────────────────────────
export default function OnHoldRecovery() {
  const { profile, isSuperAdmin, isDirector, isTeamLeader } = useAuth();
  const isLeader = isSuperAdmin || isDirector || isTeamLeader;
  const currentUser = profile?.full_name || profile?.name || '';
 
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editRecord, setEditRecord] = useState(null);
  const [search, setSearch]         = useState('');
  const [filterStatus, setFilterStatus]     = useState('all');
  const [filterHold, setFilterHold]         = useState('all');
  const [filterCoord, setFilterCoord]       = useState('all');
  const [sortBy, setSortBy]         = useState('days_on_hold');
  const [sortDir, setSortDir]       = useState('desc');
 
  const load = async () => {
    const { data } = await supabase
      .from('on_hold_recovery')
      .select('*')
      .order('created_at', { ascending: false });
    setRecords(data || []);
    setLoading(false);
  };
 
  useEffect(() => {
    load();
    const sub = supabase.channel('on-hold-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'on_hold_recovery' }, load)
      .subscribe();
    return () => sub.unsubscribe();
  }, []);
 
  // Augment with computed fields
  const augmented = useMemo(() => records.map(r => ({
    ...r,
    days_on_hold: daysSince(r.hold_start_date),
    days_since_contact: daysSince(r.last_contact_date),
  })), [records]);
 
  // Filter + sort
  const visible = useMemo(() => {
    let list = augmented.filter(r => r.recovery_status !== 'recovered');
    if (filterStatus !== 'all') list = list.filter(r => (r.recovery_status||'not_started') === filterStatus);
    if (filterHold !== 'all') list = list.filter(r => r.hold_status === filterHold);
    if (filterCoord !== 'all') list = list.filter(r => (r.assigned_coordinator||'') === filterCoord);
    if (search) list = list.filter(r => (r.patient_name||'').toLowerCase().includes(search.toLowerCase()));
    list = [...list].sort((a,b) => {
      let va = a[sortBy], vb = b[sortBy];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return list;
  }, [augmented, filterStatus, filterHold, filterCoord, search, sortBy, sortDir]);
 
  const recovered = augmented.filter(r => r.recovery_status === 'recovered');
 
  // KPIs
  const total       = augmented.filter(r => r.recovery_status !== 'recovered').length;
  const notStarted  = augmented.filter(r => !r.recovery_status || r.recovery_status === 'not_started').length;
  const readyReturn = augmented.filter(r => r.recovery_status === 'ready').length;
  const lost        = augmented.filter(r => r.recovery_status === 'lost').length;
  const longHold    = augmented.filter(r => (r.days_on_hold||0) > 30 && r.recovery_status !== 'recovered').length;
  const noContact   = augmented.filter(r => !r.last_contact_date && r.recovery_status !== 'recovered' && r.recovery_status !== 'lost').length;
 
  const coordinators = [...new Set(augmented.map(r=>r.assigned_coordinator).filter(Boolean))].sort();
 
  const markRecovered = async (record) => {
    await supabase.from('on_hold_recovery').update({
      recovery_status: 'recovered',
      recovered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', record.id);
    // Also update patient_census if it exists
    await supabase.from('patient_census').update({
      status: 'active',
      updated_at: new Date().toISOString(),
    }).ilike('patient_name', record.patient_name);
    load();
  };
 
  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };
 
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>
      Loading recovery tracker...
    </div>
  );
 
  const noData = augmented.length === 0;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
 
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:B.black, marginBottom:4 }}>⏸️ On-Hold Recovery</div>
          <div style={{ fontSize:13, color:B.gray }}>Track and recover on-hold patients. Updates automatically when new census is uploaded.</div>
        </div>
      </div>
 
      {noData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⏸️</div>
          <div style={{ fontSize:16, fontWeight:700, color:B.black, marginBottom:8 }}>No on-hold records yet</div>
          <div style={{ fontSize:13, color:B.gray, maxWidth:440, margin:'0 auto' }}>
            On-hold patients populate automatically when census data is uploaded. Run this SQL to sync existing census data:
          </div>
          <div style={{ background:'#1A1A1A', borderRadius:10, padding:'14px 18px', marginTop:16, textAlign:'left', maxWidth:500, margin:'16px auto 0' }}>
            <code style={{ fontSize:11, color:'#86EFAC', fontFamily:'monospace', whiteSpace:'pre-wrap' }}>
{`INSERT INTO on_hold_recovery (patient_name, hold_status, payer, region, hold_start_date)
SELECT patient_name, status, payer, region, NOW()::date
FROM patient_census
WHERE status LIKE 'on_hold%'
ON CONFLICT (patient_name) DO NOTHING;`}
            </code>
          </div>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:20 }}>
            {[
              { label:'On Hold Total',    value:total,       color:'#6B7280', icon:'⏸️' },
              { label:'Not Started',      value:notStarted,  color:B.lightGray, icon:'○',  alert:notStarted>0 },
              { label:'Ready to Return',  value:readyReturn, color:B.green,     icon:'✅' },
              { label:'Hold 30+ Days',    value:longHold,    color:B.danger,    icon:'🔴', alert:longHold>0 },
              { label:'No Contact Yet',   value:noContact,   color:B.orange,    icon:'📵', alert:noContact>0 },
              { label:'Recovered',        value:recovered.length, color:B.green, icon:'🎉' },
            ].map(k=>(
              <div key={k.label} style={{ background:k.alert?`${k.color}08`:B.card, border:`1.5px solid ${k.alert?k.color:B.border}`, borderRadius:12, padding:'14px', textAlign:'center', boxShadow:k.alert?`0 2px 8px ${k.color}15`:'none' }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{k.icon}</div>
                <div style={{ fontSize:24, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:10, color:B.gray, marginTop:4 }}>{k.label}</div>
              </div>
            ))}
          </div>
 
          {/* Alert: ready to return */}
          {readyReturn > 0 && (
            <div style={{ background:'#F0FDF4', border:'1.5px solid #BBF7D0', borderRadius:12, padding:'12px 18px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:B.green }}>✅ {readyReturn} patient{readyReturn!==1?'s':''} ready to return to care</div>
                <div style={{ fontSize:12, color:B.green, opacity:0.8, marginTop:2 }}>
                  {augmented.filter(r=>r.recovery_status==='ready').slice(0,3).map(r=>r.patient_name).join(' · ')}
                </div>
              </div>
              <button onClick={()=>setFilterStatus('ready')} style={{ background:B.green, border:'none', borderRadius:8, color:'#fff', padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
                View All
              </button>
            </div>
          )}
 
          {/* Filters */}
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient..."
              style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:180 }} />
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Statuses</option>
              {Object.entries(RECOVERY_STATUS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filterHold} onChange={e=>setFilterHold(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Hold Types</option>
              {Object.entries(HOLD_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filterCoord} onChange={e=>setFilterCoord(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Coordinators</option>
              {coordinators.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visible.length} patients</span>
          </div>
 
          {/* Table */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 70px 100px 90px 90px 110px 120px 100px', padding:'9px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {[
                {col:'patient_name',    label:'Patient'},
                {col:'hold_status',     label:'Hold Type'},
                {col:'region',          label:'Rgn'},
                {col:'assigned_coordinator', label:'Coordinator'},
                {col:'days_on_hold',    label:'Days Hold'},
                {col:'last_contact_date',label:'Last Contact'},
                {col:'recovery_status', label:'Recovery Status'},
                {col:'target_return_date',label:'Target Return'},
                {col:null,              label:''},
              ].map((h,i)=>(
                <div key={i} onClick={h.col?()=>toggleSort(h.col):undefined}
                  style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em', cursor:h.col?'pointer':'default', display:'flex', alignItems:'center', gap:3 }}>
                  {h.label}
                  {h.col && <span style={{ fontSize:8, color:sortBy===h.col?B.red:B.lightGray }}>{sortBy===h.col?(sortDir==='asc'?'▲':'▼'):'⇅'}</span>}
                </div>
              ))}
            </div>
 
            {visible.length === 0 ? (
              <div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No patients match these filters</div>
            ) : visible.map(r => {
              const hm = HOLD_META[r.hold_status] || HOLD_META.on_hold;
              const rs = RECOVERY_STATUS[r.recovery_status||'not_started'] || RECOVERY_STATUS.not_started;
              const urgent = (r.days_on_hold||0) > 30;
              const noContactAlert = !r.last_contact_date && r.recovery_status !== 'lost';
              return (
                <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 70px 100px 90px 90px 110px 120px 100px', padding:'9px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:urgent&&r.recovery_status==='not_started'?'#FFF8F8':'transparent' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:8 }}>{r.patient_name}</div>
                  <div>
                    <span style={{ fontSize:9, fontWeight:700, color:hm.color, background:hm.bg, border:`1px solid ${hm.border}`, borderRadius:10, padding:'2px 6px', whiteSpace:'nowrap' }}>
                      {hm.icon} {hm.label}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:B.gray }}>{r.region||'—'}</div>
                  <div style={{ fontSize:11, color:r.assigned_coordinator?B.black:B.lightGray, fontStyle:r.assigned_coordinator?'normal':'italic' }}>
                    {r.assigned_coordinator?.split(' ')[0]||'—'}
                  </div>
                  <div><AgeBadge days={r.days_on_hold} /></div>
                  <div style={{ fontSize:11, color:noContactAlert?B.orange:B.gray, fontWeight:noContactAlert?700:400 }}>
                    {noContactAlert ? '⚠️ None' : fmtDate(r.last_contact_date)}
                  </div>
                  <div>
                    <span style={{ fontSize:10, fontWeight:700, color:rs.color, background:rs.bg, border:`1px solid ${rs.border}`, borderRadius:10, padding:'2px 8px', whiteSpace:'nowrap' }}>
                      {rs.icon} {rs.label}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:B.gray }}>{fmtDate(r.target_return_date)}</div>
                  <div style={{ display:'flex', gap:4 }}>
                    <button onClick={()=>setEditRecord(r)}
                      style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'4px 8px', fontSize:10, cursor:'pointer', fontFamily:'inherit' }}>
                      Update
                    </button>
                    {r.recovery_status === 'ready' && (
                      <button onClick={()=>markRecovered(r)}
                        style={{ background:B.green, border:'none', borderRadius:6, color:'#fff', padding:'4px 8px', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                        ✓ Recovered
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
 
          {/* Recovered section */}
          {recovered.length > 0 && (
            <div style={{ marginTop:24 }}>
              <div style={{ fontSize:14, fontWeight:700, color:B.green, marginBottom:12 }}>🎉 Recovered ({recovered.length})</div>
              <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:14, overflow:'hidden' }}>
                {recovered.slice(0,10).map(r => (
                  <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', borderBottom:'1px solid #D1FAE5' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{r.patient_name}</div>
                      <div style={{ fontSize:10, color:B.lightGray }}>{HOLD_META[r.hold_status]?.label||r.hold_status} · {r.payer||'—'} · {r.assigned_coordinator||'—'}</div>
                    </div>
                    <div style={{ fontSize:11, color:B.green, fontWeight:600 }}>
                      Recovered {r.recovered_at ? fmtDate(r.recovered_at.split('T')[0]) : ''}
                    </div>
                  </div>
                ))}
                {recovered.length > 10 && <div style={{ padding:'8px 16px', fontSize:11, color:B.lightGray }}>+{recovered.length-10} more recovered</div>}
              </div>
            </div>
          )}
        </>
      )}
 
      {editRecord && (
        <RecoveryEditModal
          record={editRecord}
          currentUser={currentUser}
          onSave={()=>{ load(); setEditRecord(null); }}
          onClose={()=>setEditRecord(null)}
        />
      )}
    </div>
  );
}

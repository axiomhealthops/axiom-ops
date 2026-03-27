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
 
function daysSince(d) {
  if (!d) return null;
  const parsed = new Date(d);
  if (isNaN(parsed)) return null;
  return Math.floor((new Date() - parsed) / 86400000);
}
 
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); } catch { return d; }
}
 
// ── Task Card ─────────────────────────────────────────────────
function TaskCard({ task, onDismiss, onNote }) {
  const [expanded, setExpanded] = useState(false);
 
  const PRIORITY_STYLE = {
    critical: { color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨', label:'Critical' },
    high:     { color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', icon:'⚠️',  label:'High'     },
    medium:   { color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'📋', label:'Medium'   },
  };
  const style = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.medium;
 
  return (
    <div style={{ background:B.card, border:`1.5px solid ${style.border}`, borderRadius:12, overflow:'hidden', boxShadow:`0 2px 6px ${style.color}10` }}>
      <div onClick={()=>setExpanded(p=>!p)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', cursor:'pointer' }}>
        <span style={{ fontSize:18, flexShrink:0 }}>{style.icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{task.title}</div>
          <div style={{ fontSize:11, color:B.gray, marginTop:2 }}>{task.subtitle}</div>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:9, fontWeight:700, color:style.color, background:style.bg, border:`1px solid ${style.border}`, borderRadius:10, padding:'2px 8px' }}>{style.label}</span>
          <span style={{ fontSize:10, color:B.lightGray }}>{expanded?'▲':'▼'}</span>
        </div>
      </div>
 
      {expanded && (
        <div style={{ padding:'0 16px 14px', borderTop:`1px solid ${B.border}` }}>
          {task.patients && task.patients.length > 0 && (
            <div style={{ marginTop:10 }}>
              {task.patients.slice(0,6).map((p,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px', marginBottom:4, background:B.bg, borderRadius:8, border:`1px solid ${B.border}` }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{p.name}</div>
                    {p.detail && <div style={{ fontSize:10, color:B.gray }}>{p.detail}</div>}
                  </div>
                  {p.badge && <span style={{ fontSize:10, fontWeight:700, color:style.color, background:style.bg, borderRadius:8, padding:'2px 7px' }}>{p.badge}</span>}
                </div>
              ))}
              {task.patients.length > 6 && <div style={{ fontSize:11, color:B.lightGray, padding:'4px 10px' }}>+{task.patients.length-6} more</div>}
            </div>
          )}
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <button onClick={()=>onNote(task)}
              style={{ background:style.color, border:'none', borderRadius:8, color:'#fff', padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              Log Action
            </button>
            <button onClick={()=>onDismiss(task.id)}
              style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
 
// ── PTO Logger Modal ──────────────────────────────────────────
function PTOModal({ onClose, myRegions }) {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState({ clinician:'', date:'', note:'' });
  const [saving, setSaving]     = useState(false);
 
  useEffect(() => {
    supabase.from('clinician_pto')
      .select('*')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date')
      .then(({ data }) => { setEntries(data||[]); setLoading(false); });
  }, []);
 
  const save = async () => {
    if (!form.clinician.trim() || !form.date) return;
    setSaving(true);
    await supabase.from('clinician_pto').insert({
      clinician: form.clinician.trim(),
      date: form.date,
      note: form.note.trim() || null,
      logged_by: 'coordinator',
      created_at: new Date().toISOString(),
    });
    setForm({ clinician:'', date:'', note:'' });
    setSaving(false);
    const { data } = await supabase.from('clinician_pto').select('*').gte('date', new Date().toISOString().split('T')[0]).order('date');
    setEntries(data||[]);
  };
 
  const remove = async (id) => {
    await supabase.from('clinician_pto').delete().eq('id', id);
    setEntries(p => p.filter(e=>e.id!==id));
  };
 
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:B.card, borderRadius:20, padding:28, width:'100%', maxWidth:520, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:B.black }}>📅 Clinician Availability</div>
            <div style={{ fontSize:12, color:B.gray, marginTop:2 }}>Log PTO, sick days, or unavailability</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
        </div>
 
        {/* Add form */}
        <div style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:12, padding:'16px', marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:700, color:B.black, marginBottom:12 }}>Log Unavailability</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:4 }}>Clinician Name</label>
              <input value={form.clinician} onChange={e=>setForm(p=>({...p,clinician:e.target.value}))}
                placeholder="e.g. James Smith"
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:4 }}>Date</label>
              <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
            </div>
          </div>
          <input value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))}
            placeholder="Reason (PTO, sick, personal, etc.)"
            style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box', marginBottom:10 }} />
          <button onClick={save} disabled={!form.clinician.trim()||!form.date||saving}
            style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'8px 18px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!form.clinician.trim()||!form.date?0.5:1 }}>
            {saving?'Saving...':'Log Unavailability'}
          </button>
        </div>
 
        {/* Upcoming unavailability */}
        <div style={{ fontSize:12, fontWeight:700, color:B.black, marginBottom:10 }}>Upcoming Unavailability</div>
        {loading ? (
          <div style={{ fontSize:12, color:B.lightGray, textAlign:'center', padding:16 }}>Loading...</div>
        ) : entries.length === 0 ? (
          <div style={{ fontSize:12, color:B.lightGray, textAlign:'center', padding:16 }}>No upcoming unavailability logged</div>
        ) : entries.map(e => (
          <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:B.bg, border:`1px solid ${B.border}`, borderRadius:9, marginBottom:6 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{e.clinician}</div>
              <div style={{ fontSize:11, color:B.gray }}>{fmtDate(e.date)}{e.note?` · ${e.note}`:''}</div>
            </div>
            <button onClick={()=>remove(e.id)} style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:7, color:B.danger, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
 
// ── Log Action Modal ──────────────────────────────────────────
function LogActionModal({ task, coordinatorName, onClose }) {
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
 
  const save = async () => {
    if (!note.trim()) return;
    setSaving(true);
    await supabase.from('care_coord_task_log').insert({
      task_type:   task.type,
      task_title:  task.title,
      coordinator: coordinatorName,
      note:        note.trim(),
      created_at:  new Date().toISOString(),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 1200);
  };
 
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1001, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:B.card, borderRadius:16, padding:24, width:'100%', maxWidth:460, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>Log Action</div>
        <div style={{ fontSize:12, color:B.gray, marginBottom:14 }}>{task.title}</div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={4}
          placeholder="What action did you take? Who did you contact? What was the outcome?"
          style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${B.border}`, borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box', marginBottom:12 }} />
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'8px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={save} disabled={!note.trim()||saving||saved}
            style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            {saved ? '✅ Saved!' : saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
 
// ── Main Dashboard ────────────────────────────────────────────
export default function CareCoordDashboard() {
  const { profile } = useAuth();
  const coordinatorName = profile?.full_name || profile?.name || '';
  const assignedRegions = COORD_REGIONS[coordinatorName] || [];
  const isPreview       = assignedRegions.length === 0;
  const myRegions       = isPreview ? ALL_REGIONS : assignedRegions;
  const firstName       = isPreview ? 'Director' : coordinatorName.split(' ')[0];
 
  const [showPTO, setShowPTO]           = useState(false);
  const [logTask, setLogTask]           = useState(null);
  const [dismissed, setDismissed]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('cc_dismissed_tasks')||'[]'); } catch { return []; }
  });
  const [ptoEntries, setPTOEntries]     = useState([]);
  const [recentNotes, setRecentNotes]   = useState([]);
  const [loading, setLoading]           = useState(true);
 
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayStr = new Date().toISOString().split('T')[0];
 
  // Load data
  const censusData = useMemo(() => {
    try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch { return null; }
  }, []);
  const csvData = useMemo(() => {
    try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch { return null; }
  }, []);
 
  useEffect(() => {
    Promise.all([
      supabase.from('clinician_pto').select('*').gte('date', todayStr).order('date').limit(20),
      supabase.from('care_coord_notes').select('*').eq('coordinator', coordinatorName).order('created_at',{ascending:false}).limit(10),
    ]).then(([pto, notes]) => {
      setPTOEntries(pto.data||[]);
      setRecentNotes(notes.data||[]);
      setLoading(false);
    });
  }, [coordinatorName, todayStr]);
 
  // My patients scoped to regions
  const myPatients = useMemo(() => {
    if (!censusData?.patients) return [];
    return censusData.patients.filter(p => myRegions.includes(p.region));
  }, [censusData, myRegions]);
 
  // Pariox visit data for my regions
  const myVisitData = useMemo(() => {
    if (!csvData?.regionData) return {};
    return Object.fromEntries(Object.entries(csvData.regionData).filter(([r]) => myRegions.includes(r)));
  }, [csvData, myRegions]);
 
  // Scheduled patient names from Pariox
  const scheduledPatientNames = useMemo(() => {
    const names = new Set();
    Object.values(myVisitData).forEach(rd => {
      if (rd.clinicianList) rd.clinicianList.forEach(c => { /* names not available at region level */ });
    });
    // Use staffStats for patient names
    if (csvData?.staffStats) {
      Object.values(csvData.staffStats).forEach(s => {
        if (myRegions.some(r => s.regions?.includes(r))) {
          // staffStats doesn't have patient names, use uniquePatients count
        }
      });
    }
    return names;
  }, [myVisitData, csvData, myRegions]);
 
  // PTO conflicts — clinicians with PTO who have visits scheduled
  const ptoConflicts = useMemo(() => {
    if (!ptoEntries.length || !csvData?.staffStats) return [];
    return ptoEntries.filter(pto => {
      const staff = csvData.staffStats[pto.clinician];
      if (!staff) return false;
      // Check if they have visits scheduled in my regions
      return staff.regions?.some(r => myRegions.includes(r));
    }).map(pto => ({
      name: pto.clinician,
      date: pto.date,
      note: pto.note,
      visits: csvData.staffStats[pto.clinician]?.totalVisits || 0,
    }));
  }, [ptoEntries, csvData, myRegions]);
 
  // Auto-generate tasks
  const allTasks = useMemo(() => {
    const tasks = [];
 
    // 1. SOC Pending > 2 days
    const socOverdue = myPatients.filter(p => p.status === 'soc_pending' && daysSince(p.changed) >= 2);
    if (socOverdue.length > 0) tasks.push({
      id: 'soc_overdue', type: 'soc', priority: 'critical',
      title: `${socOverdue.length} Patient${socOverdue.length!==1?'s':''} — SOC Pending Over 2 Days`,
      subtitle: 'Evaluation needs to be scheduled immediately',
      patients: socOverdue.map(p => ({ name: p.name, detail: `Region ${p.region} · ${p.ins||'—'}`, badge: `${daysSince(p.changed)}d` })),
    });
 
    // 2. Eval Pending > 3 days
    const evalOverdue = myPatients.filter(p => p.status === 'eval_pending' && daysSince(p.changed) >= 3);
    if (evalOverdue.length > 0) tasks.push({
      id: 'eval_overdue', type: 'eval', priority: 'critical',
      title: `${evalOverdue.length} Patient${evalOverdue.length!==1?'s':''} — Eval Pending Over 3 Days`,
      subtitle: 'SOC needs to be scheduled',
      patients: evalOverdue.map(p => ({ name: p.name, detail: `Region ${p.region} · ${p.ins||'—'}`, badge: `${daysSince(p.changed)}d` })),
    });
 
    // 3. Missed/cancelled visits needing reschedule
    const missedList = [];
    Object.entries(myVisitData).forEach(([region, rd]) => {
      if (rd.clinicianList) {
        rd.clinicianList.forEach(c => {
          const missed = c.scheduled - c.completed;
          if (missed > 0) missedList.push({ name: c.name, detail: `Region ${region} · ${missed} missed visit${missed!==1?'s':''}`, badge: `${missed} missed` });
        });
      }
    });
    if (missedList.length > 0) tasks.push({
      id: 'missed_visits', type: 'missed', priority: 'high',
      title: `${missedList.length} Clinician${missedList.length!==1?'s':''} Have Missed Visits — Reschedule Required`,
      subtitle: 'Contact clinician and patient to reschedule',
      patients: missedList,
    });
 
    // 4. New referrals with no action
    const newRefs = myPatients.filter(p => ['soc_pending','eval_pending','waitlist'].includes(p.status) && daysSince(p.changed) === 0);
    if (newRefs.length > 0) tasks.push({
      id: 'new_referrals', type: 'referral', priority: 'high',
      title: `${newRefs.length} New Referral${newRefs.length!==1?'s':''} Need Action`,
      subtitle: 'Contact patient and schedule first visit',
      patients: newRefs.map(p => ({ name: p.name, detail: `Region ${p.region} · ${p.ins||'—'} · ${p.status.replace(/_/g,' ')}`, badge: 'New today' })),
    });
 
    // 5. Active patients not scheduled this week
    const myActiveCount = myPatients.filter(p => ['active','active_auth_pending'].includes(p.status)).length;
    const myScheduledCount = Object.values(myVisitData).reduce((s,rd) => s+(rd.scheduled||0), 0);
    const unscheduledEst = Math.max(0, myActiveCount - myScheduledCount);
    if (unscheduledEst > 0) tasks.push({
      id: 'unscheduled', type: 'schedule', priority: 'high',
      title: `~${unscheduledEst} Active Patient${unscheduledEst!==1?'s':''} Not Scheduled This Week`,
      subtitle: 'Verify schedule and coordinate with field staff',
      patients: [],
    });
 
    // 6. On-hold patients with no recent contact (> 7 days)
    const onHoldNoContact = myPatients.filter(p => p.status.startsWith('on_hold') && daysSince(p.changed) >= 7);
    if (onHoldNoContact.length > 0) tasks.push({
      id: 'onhold_contact', type: 'onhold', priority: 'medium',
      title: `${onHoldNoContact.length} On-Hold Patient${onHoldNoContact.length!==1?'s':''} — Follow Up Required`,
      subtitle: 'No activity in 7+ days — contact patient to assess return to care',
      patients: onHoldNoContact.map(p => ({ name: p.name, detail: `Region ${p.region} · ${p.status.replace(/_/g,' ')}`, badge: `${daysSince(p.changed)}d` })),
    });
 
    // 7. PTO conflicts
    if (ptoConflicts.length > 0) tasks.push({
      id: 'pto_conflicts', type: 'pto', priority: 'high',
      title: `${ptoConflicts.length} Clinician${ptoConflicts.length!==1?'s':''} Have PTO With Visits on Schedule`,
      subtitle: 'Visits need to be reassigned before the date',
      patients: ptoConflicts.map(c => ({ name: c.name, detail: `${fmtDate(c.date)}${c.note?` · ${c.note}`:''}`, badge: `${c.visits} visits` })),
    });
 
    return tasks.filter(t => !dismissed.includes(t.id));
  }, [myPatients, myVisitData, ptoConflicts, dismissed]);
 
  const dismiss = (id) => {
    const updated = [...dismissed, id];
    setDismissed(updated);
    localStorage.setItem('cc_dismissed_tasks', JSON.stringify(updated));
  };
 
  // Reset dismissals at midnight
  useEffect(() => {
    const lastReset = localStorage.getItem('cc_dismiss_date');
    if (lastReset !== todayStr) {
      localStorage.removeItem('cc_dismissed_tasks');
      localStorage.setItem('cc_dismiss_date', todayStr);
      setDismissed([]);
    }
  }, [todayStr]);
 
  // KPIs
  const active      = myPatients.filter(p => ['active','active_auth_pending'].includes(p.status)).length;
  const onHoldCount = myPatients.filter(p => p.status.startsWith('on_hold')).length;
  const pendingCount= myPatients.filter(p => ['soc_pending','eval_pending'].includes(p.status)).length;
  const totalMissed = Object.values(myVisitData).reduce((s,rd) => s + Math.max(0,(rd.scheduled||0)-(rd.completed||0)), 0);
  const criticalCount = allTasks.filter(t=>t.priority==='critical').length;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
 
      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${B.darkRed},${B.red},${B.orange})`, borderRadius:16, padding:'20px 24px', marginBottom:20, position:'relative', overflow:'hidden', boxShadow:'0 4px 16px rgba(139,26,16,0.2)' }}>
        <div style={{ position:'absolute', inset:0, opacity:0.05, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
        <div style={{ position:'relative', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>Care Coordination</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:2 }}>{greeting}, {firstName} 👋</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)' }}>
              {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
              {' · '}
              {isPreview ? 'All Regions (Preview)' : `Regions: ${myRegions.join(', ')}`}
            </div>
          </div>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <div style={{ display:'flex', gap:20 }}>
              {[
                { label:'Tasks Today',  value:allTasks.length,  color:allTasks.length>0?'#FDE68A':'#BBF7D0' },
                { label:'Critical',     value:criticalCount,    color:criticalCount>0?'#FCA5A5':'#BBF7D0' },
                { label:'My Patients',  value:myPatients.filter(p=>p.status!=='discharge').length, color:'#fff' },
              ].map((s,i)=>(
                <div key={s.label} style={{ textAlign:'center', paddingLeft:i>0?16:0, borderLeft:i>0?'1px solid rgba(255,255,255,0.2)':'none' }}>
                  <div style={{ fontSize:26, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>setShowPTO(true)}
              style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:10, color:'#fff', padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', backdropFilter:'blur(4px)' }}>
              📅 Log PTO
            </button>
          </div>
        </div>
      </div>
 
      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Active Census',  value:active,       color:B.green,  icon:'✅' },
          { label:'Pending SOC/Eval',value:pendingCount, color:B.blue,   icon:'📅', alert:pendingCount>0 },
          { label:'On Hold',        value:onHoldCount,  color:B.gray,   icon:'⏸️' },
          { label:'Missed Visits',  value:totalMissed,  color:totalMissed>0?B.danger:B.green, icon:'❌', alert:totalMissed>0 },
        ].map(k=>(
          <div key={k.label} style={{ background:k.alert?`${k.color}08`:B.card, border:`1.5px solid ${k.alert?k.color:B.border}`, borderRadius:12, padding:'14px 16px', boxShadow:k.alert?`0 2px 8px ${k.color}15`:'none' }}>
            <div style={{ fontSize:18, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:B.gray, marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
 
      {/* PTO alert */}
      {ptoEntries.length > 0 && (
        <div style={{ background:'#EFF6FF', border:'1.5px solid #BFDBFE', borderRadius:12, padding:'11px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.blue }}>
            📅 {ptoEntries.length} clinician{ptoEntries.length!==1?'s':''} have upcoming unavailability logged
          </div>
          <button onClick={()=>setShowPTO(true)} style={{ background:B.blue, border:'none', borderRadius:8, color:'#fff', padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>View</button>
        </div>
      )}
 
      {/* Task queue */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:16, fontWeight:800, color:B.black }}>
          📋 Today's Tasks
          {allTasks.length > 0 && <span style={{ marginLeft:8, background:B.red, color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>{allTasks.length}</span>}
        </div>
        {dismissed.length > 0 && (
          <button onClick={()=>{ setDismissed([]); localStorage.removeItem('cc_dismissed_tasks'); }}
            style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'5px 12px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
            Restore {dismissed.length} dismissed
          </button>
        )}
      </div>
 
      {!censusData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'40px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>📂</div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No census data loaded</div>
          <div style={{ fontSize:13, color:B.gray }}>Ask your director to upload the latest Pariox patient census to generate your task list.</div>
        </div>
      ) : allTasks.length === 0 ? (
        <div style={{ background:'#F0FDF4', border:'1.5px solid #BBF7D0', borderRadius:14, padding:'32px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:10 }}>✅</div>
          <div style={{ fontSize:15, fontWeight:800, color:B.green, marginBottom:6 }}>All caught up!</div>
          <div style={{ fontSize:13, color:B.gray }}>No urgent tasks for your regions right now. Check back after the next data upload.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Critical first */}
          {allTasks.filter(t=>t.priority==='critical').map(t=>(
            <TaskCard key={t.id} task={t} onDismiss={dismiss} onNote={setLogTask} />
          ))}
          {allTasks.filter(t=>t.priority==='high').map(t=>(
            <TaskCard key={t.id} task={t} onDismiss={dismiss} onNote={setLogTask} />
          ))}
          {allTasks.filter(t=>t.priority==='medium').map(t=>(
            <TaskCard key={t.id} task={t} onDismiss={dismiss} onNote={setLogTask} />
          ))}
        </div>
      )}
 
      {/* Recent activity */}
      {recentNotes.length > 0 && (
        <div style={{ marginTop:24 }}>
          <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:10 }}>🕐 Recent Activity</div>
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
            {recentNotes.slice(0,5).map(n=>(
              <div key={n.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'10px 16px', borderBottom:'1px solid #FAF4F2' }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{n.patient_name}</div>
                  <div style={{ fontSize:11, color:B.gray, marginTop:2 }}>{n.note}</div>
                </div>
                <div style={{ fontSize:10, color:B.lightGray, whiteSpace:'nowrap', marginLeft:12 }}>
                  {new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
 
      {/* Modals */}
      {showPTO && <PTOModal onClose={()=>setShowPTO(false)} myRegions={myRegions} />}
      {logTask  && <LogActionModal task={logTask} coordinatorName={coordinatorName} onClose={()=>setLogTask(null)} />}
    </div>
  );
}
 

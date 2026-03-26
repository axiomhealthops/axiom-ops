import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useOpsData } from '../hooks/useOpsData';
import { supabase } from '../lib/supabase';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626',
  blue:'#1D4ED8', purple:'#7C3AED',
};

const PAYER_COLORS = {
  'Humana':'#0066CC','CarePlus':'#009B77','Medicare/Devoted':'#1565C0',
  'FL Health Care Plans':'#2E7D32','Aetna':'#7B1FA2',
  'Cigna':'#E65100','HealthFirst':'#00838F','Other':'#6B7280',
};
const PAYER_PHONES = {
  'Humana':'1-800-448-6262','CarePlus':'1-800-794-5907',
  'Medicare/Devoted':'1-800-338-6833','FL Health Care Plans':'1-800-955-8771',
  'Aetna':'1-800-624-0756','Cigna':'1-800-244-6224','HealthFirst':'1-800-935-5465',
};
const ALL_PAYERS = ['Humana','CarePlus','Medicare/Devoted','FL Health Care Plans','Aetna','Cigna','HealthFirst'];
const ALL_REGIONS = ['A','B','C','G','H','J','M','N','T','V'];
const AUTH_STANDARD = { visits:24, periodDays:90, renewalTrigger:9 };
const TEAM_MEMBERS = ['Ethel Camposano','Gerilyn Bayson','Uriel Sarabosing'];

const PRIORITY_META = {
  critical: { label:'No Auth — Active',  color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨', order:0 },
  high:     { label:'Expiring ≤7 days',  color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', icon:'⚠️', order:1 },
  medium:   { label:'Expiring ≤14 days', color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'🕐', order:2 },
  followup: { label:'Follow-up Due',     color:B.purple,  bg:'#F5F3FF', border:'#DDD6FE', icon:'📞', order:3 },
  pending:  { label:'Pending Review',    color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE', icon:'🔄', order:4 },
  ok:       { label:'Active',            color:B.green,   bg:'#F0FDF4', border:'#BBF7D0', icon:'✅', order:5 },
};

const STATUS_META = {
  active:            { label:'Active',            color:B.green,  bg:'#F0FDF4', border:'#BBF7D0' },
  pending:           { label:'Pending Review',    color:B.yellow, bg:'#FFFBEB', border:'#FDE68A' },
  approved:          { label:'Approved',          color:B.green,  bg:'#F0FDF4', border:'#BBF7D0' },
  denied:            { label:'Denied',            color:B.danger, bg:'#FEF2F2', border:'#FECACA' },
  expired:           { label:'Expired',           color:'#6B7280',bg:'#F9FAFB', border:'#E5E7EB' },
  renewal_submitted: { label:'Renewal Submitted', color:B.blue,   bg:'#EFF6FF', border:'#BFDBFE' },
};

function getPayer(ref) {
  const r=(ref||'').toUpperCase();
  if (r.startsWith('HU')) return 'Humana';
  if (r.startsWith('CP')) return 'CarePlus';
  if (r.startsWith('MED')||r.startsWith('DH')) return 'Medicare/Devoted';
  if (r.startsWith('FHC')) return 'FL Health Care Plans';
  if (r.startsWith('AM')||r.startsWith('AC')) return 'Aetna';
  if (r.startsWith('CIG')) return 'Cigna';
  if (r.startsWith('HF')) return 'HealthFirst';
  return 'Other';
}

const EMPTY_AUTH = {
  authNumber:'', approvedVisits:24, usedVisits:0,
  approvedFrom:'', approvedThru:'', status:'active',
  submittedDate:'', lastCallDate:'', lastCallNotes:'',
  nextFollowUp:'', denialReason:'', assignedTo:'',
};

function getPriority(auth, censusStatus) {
  if (!auth) return censusStatus === 'active_auth_pending' ? 'critical' : 'critical';
  const exp = auth.approvedThru ? Math.floor((new Date(auth.approvedThru)-new Date())/86400000) : null;
  const isFollowToday = auth.nextFollowUp && new Date(auth.nextFollowUp).toDateString()===new Date().toDateString();
  const isOverdue = auth.nextFollowUp && new Date(auth.nextFollowUp) < new Date() && !isFollowToday;
  if (exp !== null && exp <= 7) return 'high';
  if (isFollowToday || isOverdue) return 'followup';
  if (exp !== null && exp <= 14) return 'medium';
  if (auth.status === 'pending') return 'pending';
  return 'ok';
}

export default function AuthTracker() {
  const { isSuperAdmin, isDirector, isTeamLeader, profile } = useAuth();
  const { censusData, hasCensus, loading: censusLoading } = useOpsData();
  const isLeaderOrAbove = isSuperAdmin || isDirector || isTeamLeader;

  // Auth records stored in Supabase auth_tracker table
  const [authRecords, setAuthRecords] = useState({});
  const [assignments, setAssignments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('axiom_auth_assignments_v2')||'{}'); } catch { return {}; }
  });

  const [view, setView] = useState('dashboard');
  const [editingPatient, setEditingPatient] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_AUTH);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterPayer, setFilterPayer] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [showAssign, setShowAssign] = useState(false);
  const [editingAssign, setEditingAssign] = useState(null);

  const setField = (k,v) => setEditForm(p=>({...p,[k]:v}));

  // Load auth records from Supabase
  useEffect(() => {
    loadAuthRecords();
    // Real-time subscription
    const sub = supabase.channel('auth-tracker-changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'auth_tracker' }, loadAuthRecords)
      .subscribe();
    return () => sub.unsubscribe();
  }, []);

  const loadAuthRecords = async () => {
    const { data } = await supabase.from('auth_tracker').select('*');
    if (data) {
      const map = {};
      data.forEach(row => {
        try {
          const parsed = row.notes ? JSON.parse(row.notes) : {};
          map[row.patient_name] = { ...parsed, id: row.id, status: row.auth_status || parsed.status || 'active', assignedTo: parsed.assignedTo || '' };
        } catch {
          map[row.patient_name] = { id: row.id, status: row.auth_status || 'active', assignedTo: '' };
        }
      });
      setAuthRecords(map);
    }
  };

  const saveAssignments = (a) => {
    setAssignments(a);
    try { localStorage.setItem('axiom_auth_assignments_v2', JSON.stringify(a)); } catch{}
  };

  // Build full patient list with priority scoring
  const allPatients = useMemo(() => {
    if (!hasCensus || !censusData?.patients) return [];
    return censusData.patients
      .filter(p => ['active','active_auth_pending','auth_pending'].includes(p.status))
      .map(p => {
        const payer = getPayer(p.ref || p.payer);
        const auth = authRecords[p.name] || null;
        const priority = getPriority(auth, p.status);
        // Find assignment
        const assignedTo = auth?.assignedTo || (() => {
          const match = Object.entries(assignments).find(([,a]) =>
            (a.payers||[]).includes(payer) && (a.regions||[]).includes(p.region)
          );
          return match?.[0] || '';
        })();
        return { ...p, payer, auth, priority, assignedTo };
      })
      .sort((a,b) => (PRIORITY_META[a.priority]?.order||9) - (PRIORITY_META[b.priority]?.order||9));
  }, [censusData, hasCensus, authRecords, assignments]);

  // Filtered list
  const visiblePatients = useMemo(() => {
    let list = allPatients;
    if (filterPayer !== 'all') list = list.filter(p => p.payer === filterPayer);
    if (filterRegion !== 'all') list = list.filter(p => p.region === filterRegion);
    if (filterPriority !== 'all') list = list.filter(p => p.priority === filterPriority);
    if (filterAssignee !== 'all') list = list.filter(p => p.assignedTo === filterAssignee);
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [allPatients, filterPayer, filterRegion, filterPriority, filterAssignee, search]);

  // KPIs
  const noAuth       = allPatients.filter(p => !p.auth).length;
  const critical     = allPatients.filter(p => p.priority === 'critical').length;
  const expiringSoon = allPatients.filter(p => ['high','medium'].includes(p.priority)).length;
  const followToday  = allPatients.filter(p => p.priority === 'followup');
  const pendingCount = allPatients.filter(p => p.priority === 'pending').length;

  // Today's follow-ups (including overdue)
  const followUpQueue = useMemo(() => allPatients.filter(p => {
    if (!p.auth?.nextFollowUp) return false;
    return new Date(p.auth.nextFollowUp) <= new Date(new Date().setHours(23,59,59));
  }).sort((a,b) => new Date(a.auth.nextFollowUp) - new Date(b.auth.nextFollowUp)), [allPatients]);

  // This week's follow-ups
  const weekFollowUps = useMemo(() => {
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
    return allPatients.filter(p => {
      if (!p.auth?.nextFollowUp) return false;
      const d = new Date(p.auth.nextFollowUp);
      return d > new Date() && d <= weekEnd;
    }).sort((a,b) => new Date(a.auth.nextFollowUp) - new Date(b.auth.nextFollowUp));
  }, [allPatients]);

  // Per-member metrics
  const memberMetrics = useMemo(() => TEAM_MEMBERS.map(name => {
    const pts = allPatients.filter(p => p.assignedTo === name);
    return {
      name, initial: name.split(' ').map(n=>n[0]).join(''),
      total: pts.length,
      noAuth: pts.filter(p => !p.auth).length,
      critical: pts.filter(p => p.priority === 'critical').length,
      followToday: pts.filter(p => p.priority === 'followup').length,
      expiring: pts.filter(p => ['high','medium'].includes(p.priority)).length,
    };
  }), [allPatients]);

  // Payer breakdown
  const payerBreakdown = useMemo(() => {
    const map = {};
    allPatients.forEach(p => {
      if (!map[p.payer]) map[p.payer] = { total:0, noAuth:0, critical:0 };
      map[p.payer].total++;
      if (!p.auth) map[p.payer].noAuth++;
      if (p.priority === 'critical') map[p.payer].critical++;
    });
    return Object.entries(map).sort(([,a],[,b]) => b.total - a.total);
  }, [allPatients]);

  // Save auth record
  const saveAuth = async () => {
    setSaving(true);
    const existing = authRecords[editingPatient.name];
    const payload = {
      patient_name: editingPatient.name,
      auth_status: editForm.status,
      payer: editingPatient.payer,
      notes: JSON.stringify(editForm),
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      await supabase.from('auth_tracker').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('auth_tracker').insert(payload);
    }
    await loadAuthRecords();
    setSaving(false);
    setEditingPatient(null);
    setView('list');
  };

  const startEdit = (patient) => {
    setEditingPatient(patient);
    setEditForm(patient.auth ? { ...EMPTY_AUTH, ...patient.auth } : { ...EMPTY_AUTH, submittedDate: new Date().toISOString().split('T')[0], assignedTo: patient.assignedTo || '' });
    setView('edit');
  };

  const visRem  = a => a ? (a.approvedVisits||0)-(a.usedVisits||0) : null;
  const daysExp = a => a?.approvedThru ? Math.floor((new Date(a.approvedThru)-new Date())/86400000) : null;

  if (censusLoading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>Loading auth tracker...</div>;

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>🔒 Authorization Tracker</h1>
          <p style={{ fontSize:13, color:B.gray, margin:0 }}>{allPatients.length} active patients · Live sync · Updates visible to all team members</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isLeaderOrAbove && <button onClick={()=>setShowAssign(p=>!p)} style={{ padding:'7px 14px', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${B.border}`, background:'transparent', color:B.gray }}>👥 Assign Team</button>}
          {['dashboard','list','calendar'].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{ padding:'7px 14px', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${view===v?B.red:B.border}`, background:view===v?'#FFF5F2':'transparent', color:view===v?B.red:B.gray, fontWeight:view===v?700:400 }}>
              {v==='dashboard'?'📊 Overview':v==='list'?'📋 Patient List':'📅 Follow-Up Calendar'}
            </button>
          ))}
        </div>
      </div>

      {!hasCensus && <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'16px 20px', fontSize:13, color:B.blue, marginBottom:20 }}>ℹ️ Waiting for census upload from director.</div>}

      {/* Team Assignment Panel */}
      {showAssign && isLeaderOrAbove && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'20px 24px', marginBottom:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.black, marginBottom:16 }}>👥 Team Queue Assignments</div>
          <div style={{ fontSize:12, color:B.gray, marginBottom:16 }}>Assign payers and regions to each team member. Patients matching their assignment appear in their queue.</div>
          {TEAM_MEMBERS.map(name => {
            const assign = assignments[name] || { payers:[], regions:[] };
            const isEditing = editingAssign === name;
            const pts = allPatients.filter(p => (assign.payers||[]).includes(p.payer) && (assign.regions||[]).includes(p.region));
            return (
              <div key={name} style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:10, padding:'14px 16px', marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:isEditing?12:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:'50%', background:'#FFF5F2', border:`2px solid ${B.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:B.red }}>{name.split(' ').map(n=>n[0]).join('')}</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{name}</div>
                      <div style={{ fontSize:11, color:B.lightGray }}>{pts.length} patients assigned</div>
                    </div>
                  </div>
                  <button onClick={()=>setEditingAssign(isEditing?null:name)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'5px 12px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>{isEditing?'Done':'Edit'}</button>
                </div>
                {isEditing ? (
                  <div style={{ marginTop:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Payers</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                      {ALL_PAYERS.map(payer => {
                        const active=(assign.payers||[]).includes(payer);
                        const col=PAYER_COLORS[payer]||B.gray;
                        return <button key={payer} onClick={()=>{ const a={...assignments}; const payers=active?(assign.payers||[]).filter(p=>p!==payer):[...(assign.payers||[]),payer]; a[name]={...assign,payers}; saveAssignments(a); }} style={{ padding:'5px 12px', borderRadius:20, border:`2px solid ${active?col:B.border}`, background:active?`${col}15`:'transparent', color:active?col:B.lightGray, fontSize:12, fontWeight:active?700:400, cursor:'pointer', fontFamily:'inherit' }}>{payer}</button>;
                      })}
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Regions</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {ALL_REGIONS.map(region => {
                        const active=(assign.regions||[]).includes(region);
                        return <button key={region} onClick={()=>{ const a={...assignments}; const regions=active?(assign.regions||[]).filter(r=>r!==region):[...(assign.regions||[]),region]; a[name]={...assign,regions}; saveAssignments(a); }} style={{ width:36, height:36, borderRadius:'50%', border:`2px solid ${active?B.red:B.border}`, background:active?'#FFF5F2':'transparent', color:active?B.red:B.lightGray, fontSize:13, fontWeight:active?800:400, cursor:'pointer', fontFamily:'inherit' }}>{region}</button>;
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:16, fontSize:12, marginTop:8 }}>
                    <div><span style={{ color:B.lightGray }}>Payers: </span>{(assign.payers||[]).length>0?(assign.payers||[]).map(p=><span key={p} style={{ color:PAYER_COLORS[p]||B.gray, fontWeight:600, marginRight:6 }}>{p}</span>):<span style={{ color:B.lightGray, fontStyle:'italic' }}>None assigned</span>}</div>
                    <div><span style={{ color:B.lightGray }}>Regions: </span><span style={{ fontWeight:600, color:B.red }}>{(assign.regions||[]).join(', ')||'None'}</span></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Form */}
      {view==='edit' && editingPatient && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', marginBottom:20, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:2 }}>{editingPatient.auth?'Update':'Add'} Authorization — {editingPatient.name}</div>
            <div style={{ fontSize:12, color:B.gray }}>
              <span style={{ color:PAYER_COLORS[editingPatient.payer]||B.gray, fontWeight:700 }}>{editingPatient.payer}</span>
              {' · '}Region {editingPatient.region}
              {PAYER_PHONES[editingPatient.payer]&&<span style={{ marginLeft:12, color:B.lightGray }}>📞 {PAYER_PHONES[editingPatient.payer]}</span>}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:14 }}>
            {[
              {label:'Auth Number',key:'authNumber',type:'text',ph:'e.g. HUM-2026-001234'},
              {label:'Approved Visits',key:'approvedVisits',type:'number',ph:'24'},
              {label:'Visits Used',key:'usedVisits',type:'number',ph:'0'},
              {label:'Auth Start Date',key:'approvedFrom',type:'date'},
              {label:'Auth Expiry',key:'approvedThru',type:'date'},
              {label:'Submitted Date',key:'submittedDate',type:'date'},
              {label:'Last Call Date',key:'lastCallDate',type:'date'},
              {label:'Next Follow-Up',key:'nextFollowUp',type:'date'},
            ].map(f=>(
              <div key={f.key}>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{f.label}</label>
                <input type={f.type} value={editForm[f.key]||''} placeholder={f.ph}
                  onChange={e=>setField(f.key,f.type==='number'?parseInt(e.target.value)||0:e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Auth Status</label>
              <select value={editForm.status} onChange={e=>setField('status',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>
                {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Assigned To</label>
              <select value={editForm.assignedTo||''} onChange={e=>setField('assignedTo',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>
                <option value="">Unassigned</option>
                {TEAM_MEMBERS.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Last Call Notes</label>
            <textarea value={editForm.lastCallNotes||''} onChange={e=>setField('lastCallNotes',e.target.value)} placeholder="Who you spoke with, reference number, outcome..." rows={3}
              style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
          </div>
          {editForm.status==='denied'&&(
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Denial Reason / Appeal Notes</label>
              <textarea value={editForm.denialReason||''} onChange={e=>setField('denialReason',e.target.value)} placeholder="Denial reason, appeal reference..." rows={2}
                style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
            </div>
          )}
          <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:B.blue }}>
            📋 Standard: {AUTH_STANDARD.visits} visits · {AUTH_STANDARD.periodDays} days · Renew when ≤{AUTH_STANDARD.renewalTrigger} visits remain
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={()=>{setEditingPatient(null);setView('list');}} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'9px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={saveAuth} disabled={saving} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              {saving?'Saving...':'Save Authorization'}
            </button>
          </div>
        </div>
      )}

      {/* Dashboard */}
      {view==='dashboard' && (
        <>
          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:20 }}>
            {[
              {label:'No Auth on File',count:noAuth,color:B.danger,bg:'#FEF2F2',border:'#FECACA',filter:'critical'},
              {label:'Expiring Soon',count:expiringSoon,color:B.yellow,bg:'#FFFBEB',border:'#FDE68A',filter:'high'},
              {label:'Follow-Up Due',count:followUpQueue.length,color:B.purple,bg:'#F5F3FF',border:'#DDD6FE',filter:'followup'},
              {label:'Pending Review',count:pendingCount,color:B.blue,bg:'#EFF6FF',border:'#BFDBFE',filter:'pending'},
              {label:'Total Active',count:allPatients.length,color:B.green,bg:'#F0FDF4',border:'#BBF7D0',filter:'all'},
            ].map(m=>(
              <div key={m.label} onClick={()=>{setFilterPriority(m.filter==='all'?'all':m.filter);setView('list');}}
                style={{ background:m.bg, border:`1px solid ${m.border}`, borderRadius:12, padding:'14px', textAlign:'center', cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ fontSize:28, fontWeight:800, color:m.color, fontFamily:'monospace', lineHeight:1 }}>{m.count}</div>
                <div style={{ fontSize:10, color:m.color, textTransform:'uppercase', letterSpacing:'0.07em', marginTop:5 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Team queue cards */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:12 }}>👥 Team Queues</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {memberMetrics.map(m => (
                <div key={m.name} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'16px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'#FFF5F2', border:`2px solid ${B.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:B.red }}>{m.initial}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{m.name.split(' ')[0]}</div>
                    </div>
                    <button onClick={()=>{setFilterAssignee(m.name);setView('list');}} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>View Queue →</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
                    {[
                      {label:'Total',value:m.total,color:B.black},
                      {label:'No Auth',value:m.noAuth,color:m.noAuth>0?B.danger:B.green},
                      {label:'Expiring',value:m.expiring,color:m.expiring>0?B.yellow:B.green},
                      {label:'Call Today',value:m.followToday,color:m.followToday>0?B.purple:B.green},
                    ].map(s=>(
                      <div key={s.label} style={{ textAlign:'center', padding:'8px 4px', background:B.bg, borderRadius:8 }}>
                        <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                        <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {m.followToday>0&&<div style={{ marginTop:8, padding:'5px 10px', background:'#F5F3FF', borderRadius:6, fontSize:11, color:B.purple, fontWeight:600 }}>📞 {m.followToday} call{m.followToday>1?'s':''} due today</div>}
                  {m.total===0&&<div style={{ marginTop:8, fontSize:11, color:B.lightGray, fontStyle:'italic' }}>No patients assigned yet — use Assign Team above</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Payer breakdown */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px', marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:14 }}>🏥 Auth Status by Payer</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
              {payerBreakdown.map(([payer,data])=>{
                const col=PAYER_COLORS[payer]||B.gray;
                const pct=data.total>0?Math.round((data.total-data.noAuth)/data.total*100):0;
                return (
                  <div key={payer} onClick={()=>{setFilterPayer(payer);setView('list');}} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:B.bg, borderRadius:8, cursor:'pointer', border:`1px solid ${B.border}` }}>
                    <div style={{ width:8, height:36, background:col, borderRadius:2, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:B.black, marginBottom:4 }}>{payer}</div>
                      <div style={{ height:4, background:'rgba(0,0,0,0.08)', borderRadius:2 }}><div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:2 }} /></div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:col, fontFamily:'monospace' }}>{data.total}</div>
                      {data.noAuth>0&&<div style={{ fontSize:10, color:B.danger, fontWeight:700 }}>{data.noAuth} no auth</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Follow-Up Calendar */}
      {view==='calendar' && (
        <>
          {followUpQueue.length>0&&(
            <div style={{ background:B.card, border:'1.5px solid #DDD6FE', borderRadius:14, padding:'18px 20px', marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:800, color:B.purple, marginBottom:12 }}>📞 Due Today & Overdue — {followUpQueue.length} patients</div>
              {followUpQueue.map(p=>{
                const isOverdue=new Date(p.auth.nextFollowUp) < new Date(new Date().setHours(0,0,0,0));
                return (
                  <div key={p.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:isOverdue?'#FEF2F2':'#F5F3FF', borderRadius:8, border:`1px solid ${isOverdue?'#FECACA':'#DDD6FE'}`, marginBottom:8 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{p.name}</div>
                        {isOverdue&&<span style={{ fontSize:10, color:B.danger, fontWeight:700, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'1px 6px' }}>OVERDUE</span>}
                      </div>
                      <div style={{ fontSize:11, color:B.gray, marginTop:2 }}>
                        <span style={{ color:PAYER_COLORS[p.payer]||B.gray, fontWeight:600 }}>{p.payer}</span> · Region {p.region}
                        {p.assignedTo&&<span style={{ color:B.lightGray, marginLeft:8 }}>→ {p.assignedTo.split(' ')[0]}</span>}
                        {PAYER_PHONES[p.payer]&&<span style={{ color:B.lightGray, marginLeft:8 }}>📞 {PAYER_PHONES[p.payer]}</span>}
                      </div>
                      {p.auth?.lastCallNotes&&<div style={{ fontSize:11, color:B.lightGray, marginTop:2, fontStyle:'italic' }}>Last note: {p.auth.lastCallNotes.slice(0,80)}{p.auth.lastCallNotes.length>80?'...':''}</div>}
                    </div>
                    <button onClick={()=>startEdit(p)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'7px 14px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', marginLeft:12 }}>Update Auth</button>
                  </div>
                );
              })}
            </div>
          )}

          {weekFollowUps.length>0&&(
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px', marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:12 }}>📅 Upcoming This Week — {weekFollowUps.length} patients</div>
              {weekFollowUps.map(p=>{
                const daysAway=Math.ceil((new Date(p.auth.nextFollowUp)-new Date())/86400000);
                return (
                  <div key={p.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', background:B.bg, borderRadius:8, border:`1px solid ${B.border}`, marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{p.name}</div>
                      <div style={{ fontSize:11, color:B.gray, marginTop:1 }}>
                        <span style={{ color:PAYER_COLORS[p.payer]||B.gray, fontWeight:600 }}>{p.payer}</span> · Region {p.region}
                        {p.assignedTo&&<span style={{ color:B.lightGray, marginLeft:8 }}>→ {p.assignedTo.split(' ')[0]}</span>}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:daysAway<=2?B.orange:B.gray }}>{new Date(p.auth.nextFollowUp+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
                        <div style={{ fontSize:10, color:B.lightGray }}>in {daysAway} day{daysAway!==1?'s':''}</div>
                      </div>
                      <button onClick={()=>startEdit(p)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {followUpQueue.length===0&&weekFollowUps.length===0&&(
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:14, padding:'40px', textAlign:'center' }}>
              <div style={{ fontSize:24, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:15, fontWeight:700, color:B.green }}>No follow-ups due</div>
              <div style={{ fontSize:12, color:B.green, marginTop:4 }}>Set follow-up dates when updating auth records to track them here</div>
            </div>
          )}
        </>
      )}

      {/* Patient List */}
      {view==='list' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient..."
              style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:180 }} />
            <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Priorities</option>
              {Object.entries(PRIORITY_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Team Members</option>
              {TEAM_MEMBERS.map(n=><option key={n} value={n}>{n.split(' ')[0]}</option>)}
              <option value="">Unassigned</option>
            </select>
            <select value={filterPayer} onChange={e=>setFilterPayer(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Payers</option>
              {ALL_PAYERS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Regions</option>
              {ALL_REGIONS.map(r=><option key={r} value={r}>Region {r}</option>)}
            </select>
            <button onClick={()=>{setFilterPriority('all');setFilterAssignee('all');setFilterPayer('all');setFilterRegion('all');setSearch('');}} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'7px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Clear Filters</button>
            <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visiblePatients.length} patients</span>
          </div>

          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'180px 110px 55px 100px 70px 80px 80px 85px 1fr', padding:'9px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {['Patient','Payer','Rgn','Assigned','Auth #','Approved','Used','Expiry',''].map(h=>(
                <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
              ))}
            </div>
            {visiblePatients.slice(0,150).map(p=>{
              const a=p.auth;
              const rem=visRem(a);
              const exp=daysExp(a);
              const meta=PRIORITY_META[p.priority]||PRIORITY_META.ok;
              const payCol=PAYER_COLORS[p.payer]||B.gray;
              const isFollowToday=a?.nextFollowUp&&new Date(a.nextFollowUp).toDateString()===new Date().toDateString();
              return (
                <div key={p.name} style={{ display:'grid', gridTemplateColumns:'180px 110px 55px 100px 70px 80px 80px 85px 1fr', padding:'9px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:p.priority==='critical'?'#FFFBEB':isFollowToday?'#FFF5F2':'transparent' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                    <span style={{ fontSize:9, fontWeight:700, color:meta.color, background:meta.bg, border:`1px solid ${meta.border}`, borderRadius:10, padding:'1px 5px' }}>{meta.icon} {meta.label}</span>
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, color:payCol, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.payer}</div>
                  <div style={{ fontSize:12, color:B.gray }}>{p.region}</div>
                  <div style={{ fontSize:10, color:B.gray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.assignedTo?p.assignedTo.split(' ')[0]:<span style={{ color:B.lightGray, fontStyle:'italic' }}>None</span>}</div>
                  <div style={{ fontSize:11, color:a?.authNumber?B.black:B.lightGray }}>{a?.authNumber||'—'}</div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{a?.approvedVisits||'—'}</div>
                  <div style={{ fontSize:12, color:B.gray }}>{a?.usedVisits||'—'}</div>
                  <div>
                    <div style={{ fontSize:11, color:exp!=null?(exp<=7?B.danger:exp<=14?B.yellow:B.green):B.lightGray, fontWeight:exp!=null&&exp<=14?700:400 }}>
                      {a?.approvedThru?new Date(a.approvedThru+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}
                    </div>
                    {exp!=null&&<div style={{ fontSize:9, color:exp<=7?B.danger:exp<=14?B.yellow:B.lightGray }}>{exp}d</div>}
                  </div>
                  <div>
                    <button onClick={()=>startEdit(p)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                      {a?'Update':'+ Add'}
                    </button>
                  </div>
                </div>
              );
            })}
            {visiblePatients.length===0&&<div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No patients match these filters</div>}
          </div>
        </>
      )}
    </div>
  );
}

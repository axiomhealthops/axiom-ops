import { useState, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
  purple:'#7C3AED',
};

const PAYER_COLORS = {
  'Humana':'#0066CC', 'CarePlus':'#009B77', 'Medicare/Devoted':'#1565C0',
  'FL Health Care Plans':'#2E7D32', 'Aetna':'#7B1FA2',
  'Cigna':'#E65100', 'HealthFirst':'#00838F', 'Other':'#6B7280',
};

const PAYER_PHONES = {
  'Humana':'1-800-448-6262', 'CarePlus':'1-800-794-5907',
  'Medicare/Devoted':'1-800-338-6833', 'FL Health Care Plans':'1-800-955-8771',
  'Aetna':'1-800-624-0756', 'Cigna':'1-800-244-6224', 'HealthFirst':'1-800-935-5465',
};

const ALL_PAYERS = ['Humana','CarePlus','Medicare/Devoted','FL Health Care Plans','Aetna','Cigna','HealthFirst'];
const ALL_REGIONS = ['A','B','C','G','H','J','M','N','T','V'];

const AUTH_STANDARD = { visits:24, evalVisits:1, reassessments:3, periodDays:90, renewalTrigger:9 };

// Default coordinator assignments — Gerilyn pre-configured, others blank
const DEFAULT_ASSIGNMENTS = {
  'Gerilyn': { payers:['Humana','CarePlus'], regions:['A','G','M'], color:'#D94F2B' },
};

const STATUS_META = {
  active:            { label:'Active',           color:B.green,  bg:'#F0FDF4', border:'#BBF7D0' },
  pending:           { label:'Pending Review',   color:B.yellow, bg:'#FFFBEB', border:'#FDE68A' },
  approved:          { label:'Approved',         color:B.green,  bg:'#F0FDF4', border:'#BBF7D0' },
  denied:            { label:'Denied',           color:B.danger, bg:'#FEF2F2', border:'#FECACA' },
  expired:           { label:'Expired',          color:'#6B7280',bg:'#F9FAFB', border:'#E5E7EB' },
  renewal_submitted: { label:'Renewal Submitted',color:B.blue,   bg:'#EFF6FF', border:'#BFDBFE' },
};

function getPayer(ref) {
  const r = (ref||'').toUpperCase();
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
  nextFollowUp:'', denialReason:'', renewalSubmitted:false,
};

export default function AuthTracker({ censusData, hasCensus }) {
  const { isSuperAdmin, isDirector, profile } = useAuth();
  const isDirectorView = isSuperAdmin || isDirector;

  // ── Persistent state ─────────────────────────────────────────
  const [assignments, setAssignments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('axiom_auth_assignments')||'null') || DEFAULT_ASSIGNMENTS; }
    catch { return DEFAULT_ASSIGNMENTS; }
  });
  const [authRecords, setAuthRecords] = useState(() => {
    try { return JSON.parse(localStorage.getItem('axiom_auth_tracker')||'{}'); } catch { return {}; }
  });

  // ── UI state ─────────────────────────────────────────────────
  const [view, setView]                     = useState('dashboard');
  const [editingPatient, setEditingPatient] = useState(null);
  const [editForm, setEditForm]             = useState(EMPTY_AUTH);
  const [search, setSearch]                 = useState('');
  const [filterPayer, setFilterPayer]       = useState('all');
  const [filterRegion, setFilterRegion]     = useState('all');
  const [filterStatus, setFilterStatus]     = useState('all');
  const [filterCoord, setFilterCoord]       = useState('all');
  const [showAssignments, setShowAssignments] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [newCoordName, setNewCoordName]     = useState('');

  const saveAssignments = (a) => { setAssignments(a); try { localStorage.setItem('axiom_auth_assignments',JSON.stringify(a)); } catch{} };
  const saveRecords     = (r) => { setAuthRecords(r);  try { localStorage.setItem('axiom_auth_tracker',JSON.stringify(r));    } catch{} };
  const setField        = (k,v) => setEditForm(p=>({...p,[k]:v}));

  // ── Determine current user's assignment ──────────────────────
  const myName       = profile?.name || '';
  const myAssignment = isDirectorView ? null : (assignments[myName] || null);

  // ── Build patient list from census ───────────────────────────
  const allPatients = useMemo(() => {
    if (!hasCensus || !censusData?.patients) return [];
    return censusData.patients
      .filter(p => ['active','active_auth_pending','auth_pending'].includes(p.status))
      .map(p => {
        const payer = getPayer(p.ref);
        const auth  = authRecords[p.name] || null;
        // Find which coordinator owns this patient
        const owner = Object.entries(assignments).find(([,a]) =>
          a.payers?.includes(payer) && a.regions?.includes(p.region)
        )?.[0] || 'Unassigned';
        return { ...p, payer, auth, owner };
      });
  }, [censusData, hasCensus, authRecords, assignments]);

  // ── Filter based on role ──────────────────────────────────────
  const visiblePatients = useMemo(() => {
    let list = allPatients;
    // Coordinators only see their assignment
    if (!isDirectorView && myAssignment) {
      list = list.filter(p => myAssignment.payers?.includes(p.payer) && myAssignment.regions?.includes(p.region));
    }
    // Director filters
    if (filterCoord  !== 'all') list = list.filter(p => p.owner === filterCoord);
    if (filterPayer  !== 'all') list = list.filter(p => p.payer === filterPayer);
    if (filterRegion !== 'all') list = list.filter(p => p.region === filterRegion);
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filterStatus === 'no_auth')       list = list.filter(p => !p.auth);
    if (filterStatus === 'renewal_due')   list = list.filter(p => p.auth && (p.auth.approvedVisits - p.auth.usedVisits) <= AUTH_STANDARD.renewalTrigger);
    if (filterStatus === 'expiring_soon') list = list.filter(p => { if (!p.auth?.approvedThru) return false; return Math.floor((new Date(p.auth.approvedThru)-new Date())/86400000) <= 14; });
    if (filterStatus === 'follow_up_today') list = list.filter(p => p.auth?.nextFollowUp && new Date(p.auth.nextFollowUp).toDateString()===new Date().toDateString());
    if (['pending','denied','expired','renewal_submitted'].includes(filterStatus)) list = list.filter(p => p.auth?.status === filterStatus);
    return list;
  }, [allPatients, isDirectorView, myAssignment, filterCoord, filterPayer, filterRegion, search, filterStatus]);

  // ── Metrics ───────────────────────────────────────────────────
  const myPatients   = !isDirectorView && myAssignment ? allPatients.filter(p => myAssignment.payers?.includes(p.payer) && myAssignment.regions?.includes(p.region)) : allPatients;
  const noAuth       = myPatients.filter(p => !p.auth).length;
  const renewalDue   = myPatients.filter(p => p.auth && (p.auth.approvedVisits-p.auth.usedVisits) <= AUTH_STANDARD.renewalTrigger).length;
  const expiringSoon = myPatients.filter(p => { if (!p.auth?.approvedThru) return false; return Math.floor((new Date(p.auth.approvedThru)-new Date())/86400000) <= 14; }).length;
  const pendingCount = myPatients.filter(p => p.auth?.status==='pending').length;
  const deniedCount  = myPatients.filter(p => p.auth?.status==='denied').length;
  const followToday  = myPatients.filter(p => p.auth?.nextFollowUp && new Date(p.auth.nextFollowUp).toDateString()===new Date().toDateString());

  // ── Per-coordinator metrics for director ──────────────────────
  const coordMetrics = useMemo(() => Object.entries(assignments).map(([name, assign]) => {
    const pts = allPatients.filter(p => assign.payers?.includes(p.payer) && assign.regions?.includes(p.region));
    return {
      name, color: assign.color || B.red,
      total:       pts.length,
      noAuth:      pts.filter(p => !p.auth).length,
      renewalDue:  pts.filter(p => p.auth && (p.auth.approvedVisits-p.auth.usedVisits)<=AUTH_STANDARD.renewalTrigger).length,
      followToday: pts.filter(p => p.auth?.nextFollowUp && new Date(p.auth.nextFollowUp).toDateString()===new Date().toDateString()).length,
      payers:      assign.payers || [],
      regions:     assign.regions || [],
    };
  }), [allPatients, assignments]);

  const unassigned = allPatients.filter(p => p.owner === 'Unassigned');

  // ── Auth record save ─────────────────────────────────────────
  const saveAuth = () => {
    saveRecords({ ...authRecords, [editingPatient.name]: editForm });
    setEditingPatient(null);
    setView('list');
  };

  const startEdit = (patient) => {
    setEditingPatient(patient);
    setEditForm(patient.auth || { ...EMPTY_AUTH, submittedDate: new Date().toISOString().split('T')[0] });
    setView('edit');
  };

  const visRem = (a) => a ? (a.approvedVisits||0)-(a.usedVisits||0) : null;
  const daysExp = (a) => a?.approvedThru ? Math.floor((new Date(a.approvedThru)-new Date())/86400000) : null;
  const urgent  = (a) => { const r=visRem(a); const e=daysExp(a); return (r!=null&&r<=AUTH_STANDARD.renewalTrigger)||(e!=null&&e<=14); };

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>
            🔒 Authorization Tracker
            {!isDirectorView && myAssignment && (
              <span style={{ fontSize:13, fontWeight:400, color:B.gray, marginLeft:10 }}>— {myName}'s Queue</span>
            )}
          </h1>
          <p style={{ fontSize:13, color:B.gray, margin:0 }}>
            {!isDirectorView && myAssignment
              ? `Your patients: ${myAssignment.payers?.join(', ')} · Regions ${myAssignment.regions?.join(', ')}`
              : `${allPatients.length} total active patients · ${Object.keys(assignments).length} coordinators`}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isDirectorView && (
            <button onClick={() => setShowAssignments(p=>!p)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'7px 14px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
              👥 Manage Assignments
            </button>
          )}
          {['dashboard','list'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding:'7px 14px', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'inherit',
              border:`1px solid ${view===v?B.red:B.border}`, background:view===v?'#FFF5F2':'transparent',
              color:view===v?B.red:B.gray, fontWeight:view===v?700:400,
            }}>{v==='dashboard'?'📊 Overview':'📋 Patient List'}</button>
          ))}
        </div>
      </div>

      {/* ── Assignment Manager (director only) ── */}
      {showAssignments && isDirectorView && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'22px 24px', marginBottom:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.black, marginBottom:16 }}>👥 Coordinator Assignments</div>

          {/* Existing coordinators */}
          {Object.entries(assignments).map(([name, assign]) => (
            <div key={name} style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:10, padding:'16px', marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:`${assign.color||B.red}20`, border:`2px solid ${assign.color||B.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:assign.color||B.red }}>{name[0]}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.black }}>{name}</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => setEditingAssignment(editingAssignment===name?null:name)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                    {editingAssignment===name?'Done':'Edit'}
                  </button>
                  <button onClick={() => { const a={...assignments}; delete a[name]; saveAssignments(a); }} style={{ background:'none', border:'1px solid #FECACA', borderRadius:6, color:B.danger, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
                </div>
              </div>

              {editingAssignment === name ? (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Assigned Payers</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                    {ALL_PAYERS.map(payer => {
                      const active = assign.payers?.includes(payer);
                      const col = PAYER_COLORS[payer] || B.gray;
                      return (
                        <button key={payer} onClick={() => {
                          const a = {...assignments};
                          const payers = active ? assign.payers.filter(p=>p!==payer) : [...(assign.payers||[]),payer];
                          a[name] = {...assign, payers};
                          saveAssignments(a);
                        }} style={{ padding:'5px 12px', borderRadius:20, border:`2px solid ${active?col:B.border}`, background:active?`${col}15`:'transparent', color:active?col:B.lightGray, fontSize:12, fontWeight:active?700:400, cursor:'pointer', fontFamily:'inherit' }}>
                          {payer}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Assigned Regions</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {ALL_REGIONS.map(region => {
                      const active = assign.regions?.includes(region);
                      return (
                        <button key={region} onClick={() => {
                          const a = {...assignments};
                          const regions = active ? assign.regions.filter(r=>r!==region) : [...(assign.regions||[]),region];
                          a[name] = {...assign, regions};
                          saveAssignments(a);
                        }} style={{ width:36, height:36, borderRadius:'50%', border:`2px solid ${active?B.red:B.border}`, background:active?'#FFF5F2':'transparent', color:active?B.red:B.lightGray, fontSize:13, fontWeight:active?800:400, cursor:'pointer', fontFamily:'inherit' }}>
                          {region}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', gap:16, fontSize:12 }}>
                  <div><span style={{ color:B.lightGray }}>Payers: </span>{(assign.payers||[]).map(p => <span key={p} style={{ color:PAYER_COLORS[p]||B.gray, fontWeight:600, marginRight:6 }}>{p}</span>)}</div>
                  <div><span style={{ color:B.lightGray }}>Regions: </span><span style={{ fontWeight:600, color:B.red }}>{(assign.regions||[]).join(', ')}</span></div>
                </div>
              )}
            </div>
          ))}

          {/* Add coordinator */}
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <input value={newCoordName} onChange={e => setNewCoordName(e.target.value)} placeholder="Coordinator name..."
              style={{ flex:1, padding:'8px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black }} />
            <button onClick={() => {
              if (!newCoordName.trim()) return;
              const colors = ['#D94F2B','#1565C0','#059669','#7C3AED','#D97706'];
              const usedColors = Object.values(assignments).map(a=>a.color);
              const color = colors.find(c=>!usedColors.includes(c)) || B.red;
              saveAssignments({...assignments,[newCoordName.trim()]:{payers:[],regions:[],color}});
              setNewCoordName('');
              setEditingAssignment(newCoordName.trim());
            }} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'8px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              + Add Coordinator
            </button>
          </div>

          {/* Coverage gaps */}
          {unassigned.length > 0 && (
            <div style={{ marginTop:14, padding:'10px 14px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, fontSize:12, color:B.yellow }}>
              ⚠️ <strong>{unassigned.length} patients are unassigned</strong> — their payer/region combination isn't covered by any coordinator. Check assignments above.
            </div>
          )}
        </div>
      )}

      {/* ── No census state ── */}
      {!hasCensus && (
        <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'20px 24px', fontSize:13, color:B.blue, marginBottom:20 }}>
          ℹ️ Upload your patient census in <strong>Data Uploads</strong> to populate the auth tracker.
        </div>
      )}

      {/* ── Edit Auth Form ── */}
      {view === 'edit' && editingPatient && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', marginBottom:20, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:2 }}>
              {editingPatient.auth ? 'Update' : 'Add'} Authorization — {editingPatient.name}
            </div>
            <div style={{ fontSize:12, color:B.gray }}>
              <span style={{ color:PAYER_COLORS[editingPatient.payer]||B.gray, fontWeight:700 }}>{editingPatient.payer}</span>
              {' · '}Region {editingPatient.region}
              {PAYER_PHONES[editingPatient.payer] && <span style={{ marginLeft:12, color:B.lightGray }}>📞 {PAYER_PHONES[editingPatient.payer]}</span>}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:14 }}>
            {[
              { label:'Auth Number',     key:'authNumber',     type:'text',   ph:'e.g. HUM-2026-001234' },
              { label:'Approved Visits', key:'approvedVisits', type:'number', ph:'24' },
              { label:'Visits Used',     key:'usedVisits',     type:'number', ph:'0' },
              { label:'Auth Start Date', key:'approvedFrom',   type:'date',   ph:'' },
              { label:'Auth Expiry',     key:'approvedThru',   type:'date',   ph:'' },
              { label:'Submitted Date',  key:'submittedDate',  type:'date',   ph:'' },
              { label:'Last Call Date',  key:'lastCallDate',   type:'date',   ph:'' },
              { label:'Next Follow-Up',  key:'nextFollowUp',   type:'date',   ph:'' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{f.label}</label>
                <input type={f.type} value={editForm[f.key]||''} placeholder={f.ph}
                  onChange={e => setField(f.key, f.type==='number'?parseInt(e.target.value)||0:e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Auth Status</label>
              <select value={editForm.status} onChange={e => setField('status', e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>
                {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Last Call Notes</label>
            <textarea value={editForm.lastCallNotes||''} onChange={e => setField('lastCallNotes',e.target.value)}
              placeholder="Who you spoke with, reference number, what was discussed, outcome..."
              rows={3} style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
          </div>

          {editForm.status === 'denied' && (
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Denial Reason / Appeal Notes</label>
              <textarea value={editForm.denialReason||''} onChange={e => setField('denialReason',e.target.value)}
                placeholder="Denial reason, appeal submitted date, appeal reference number, expected outcome..."
                rows={2} style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
            </div>
          )}

          <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:B.blue }}>
            📋 Standard auth: {AUTH_STANDARD.visits} visits · {AUTH_STANDARD.evalVisits} eval · {AUTH_STANDARD.reassessments} reassessments · {AUTH_STANDARD.periodDays} days · Renew when ≤{AUTH_STANDARD.renewalTrigger} visits remain
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={() => { setEditingPatient(null); setView('list'); }} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'9px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={saveAuth} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Save Authorization</button>
          </div>
        </div>
      )}

      {/* ── Dashboard Overview ── */}
      {view === 'dashboard' && (
        <>
          {/* My KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:20 }}>
            {[
              { label:'No Auth on File', count:noAuth,       color:B.danger, bg:'#FEF2F2', border:'#FECACA', filter:'no_auth'        },
              { label:'Renewal Due',     count:renewalDue,   color:B.orange, bg:'#FFF7ED', border:'#FED7AA', filter:'renewal_due'    },
              { label:'Expiring ≤14d',  count:expiringSoon,  color:B.yellow, bg:'#FFFBEB', border:'#FDE68A', filter:'expiring_soon'  },
              { label:'Pending Review',  count:pendingCount, color:B.blue,   bg:'#EFF6FF', border:'#BFDBFE', filter:'pending'        },
              { label:'Follow Up Today', count:followToday.length, color:B.purple||'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE', filter:'follow_up_today' },
            ].map(m => (
              <div key={m.label} onClick={() => { setFilterStatus(m.filter); setView('list'); }}
                style={{ background:m.bg, border:`1px solid ${m.border}`, borderRadius:12, padding:'14px', textAlign:'center', cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ fontSize:28, fontWeight:800, color:m.color, fontFamily:'monospace', lineHeight:1 }}>{m.count}</div>
                <div style={{ fontSize:10, color:m.color, textTransform:'uppercase', letterSpacing:'0.07em', marginTop:5 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Follow up today panel */}
          {followToday.length > 0 && (
            <div style={{ background:B.card, border:'1.5px solid #FECACA', borderRadius:14, padding:'18px 20px', marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:800, color:B.danger, marginBottom:12 }}>📞 Follow Up Today — {followToday.length} patients</div>
              {followToday.map(p => (
                <div key={p.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:B.bg, borderRadius:8, border:`1px solid ${B.border}`, marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{p.name}</div>
                    <div style={{ fontSize:11, color:B.gray, marginTop:2 }}>
                      <span style={{ color:PAYER_COLORS[p.payer]||B.gray, fontWeight:600 }}>{p.payer}</span>
                      {' · '}Region {p.region}
                      {p.auth?.authNumber && <span style={{ color:B.lightGray, marginLeft:8 }}>#{p.auth.authNumber}</span>}
                      {p.auth?.lastCallNotes && <span style={{ color:B.lightGray, marginLeft:8 }}>· {p.auth.lastCallNotes.slice(0,60)}...</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                    {PAYER_PHONES[p.payer] && <span style={{ fontSize:11, color:PAYER_COLORS[p.payer]||B.gray, fontWeight:600 }}>{PAYER_PHONES[p.payer]}</span>}
                    <button onClick={() => startEdit(p)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Update</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Director: per-coordinator breakdown */}
          {isDirectorView && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:12 }}>👥 Coordinator Queues</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                {coordMetrics.map(c => (
                  <div key={c.name} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:30, height:30, borderRadius:'50%', background:`${c.color}20`, border:`2px solid ${c.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:c.color }}>{c.name[0]}</div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{c.name}</div>
                          <div style={{ fontSize:10, color:B.lightGray }}>{c.payers.join(', ')} · Regions {c.regions.join(', ')}</div>
                        </div>
                      </div>
                      <button onClick={() => { setFilterCoord(c.name); setView('list'); }} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>View Queue</button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                      {[
                        { label:'Total',       value:c.total,       color:B.black  },
                        { label:'No Auth',     value:c.noAuth,      color:c.noAuth>0?B.danger:B.green },
                        { label:'Renew Due',   value:c.renewalDue,  color:c.renewalDue>0?B.orange:B.green },
                        { label:'Call Today',  value:c.followToday, color:c.followToday>0?B.purple||'#7C3AED':B.green },
                      ].map(m => (
                        <div key={m.label} style={{ textAlign:'center', padding:'8px 4px', background:B.bg, borderRadius:8 }}>
                          <div style={{ fontSize:20, fontWeight:800, color:m.color, fontFamily:'monospace' }}>{m.value}</div>
                          <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.06em' }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                    {c.followToday > 0 && (
                      <div style={{ marginTop:8, padding:'6px 10px', background:'#FEF2F2', borderRadius:6, fontSize:11, color:B.danger, fontWeight:600 }}>
                        ⚠️ {c.followToday} follow-up call{c.followToday>1?'s':''} due today
                      </div>
                    )}
                  </div>
                ))}
                {unassigned.length > 0 && (
                  <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:14, padding:'18px 20px' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:B.yellow, marginBottom:8 }}>⚠️ Unassigned ({unassigned.length} patients)</div>
                    <div style={{ fontSize:12, color:B.gray }}>These patients' payer/region combinations aren't covered. Use Manage Assignments to fix coverage gaps.</div>
                    <button onClick={() => setShowAssignments(true)} style={{ marginTop:10, background:'none', border:`1px solid #FDE68A`, borderRadius:6, color:B.yellow, padding:'5px 12px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Manage Assignments</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Auth standard reference */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:B.black, marginBottom:12 }}>📋 Standard Authorization Parameters</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {[
                { label:'Visit Allowance',  value:`${AUTH_STANDARD.visits} visits` },
                { label:'Evaluation',        value:`${AUTH_STANDARD.evalVisits} initial eval` },
                { label:'Reassessments',     value:`${AUTH_STANDARD.reassessments} included` },
                { label:'Auth Period',       value:`${AUTH_STANDARD.periodDays} days` },
                { label:'Renewal Trigger',   value:`≤${AUTH_STANDARD.renewalTrigger} visits remaining` },
                { label:'Lead Time',         value:'Submit 2–3 weeks before expiry' },
              ].map(f => (
                <div key={f.label} style={{ padding:'10px 12px', background:B.bg, borderRadius:8 }}>
                  <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{f.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Patient List ── */}
      {view === 'list' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient..."
              style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:180 }} />
            {isDirectorView && (
              <select value={filterCoord} onChange={e => setFilterCoord(e.target.value)}
                style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
                <option value="all">All Coordinators</option>
                {Object.keys(assignments).map(n => <option key={n} value={n}>{n}</option>)}
                <option value="Unassigned">Unassigned</option>
              </select>
            )}
            <select value={filterPayer} onChange={e => setFilterPayer(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Payers</option>
              {ALL_PAYERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Regions</option>
              {ALL_REGIONS.map(r => <option key={r} value={r}>Region {r}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Statuses</option>
              <option value="no_auth">No Auth on File</option>
              <option value="renewal_due">Renewal Due</option>
              <option value="expiring_soon">Expiring ≤14 days</option>
              <option value="follow_up_today">Follow Up Today</option>
              <option value="pending">Pending Review</option>
              <option value="denied">Denied</option>
            </select>
            <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visiblePatients.length} patients</span>
          </div>

          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:`180px 120px 60px ${isDirectorView?'100px ':''} 70px 90px 80px 90px 90px 1fr`, padding:'9px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {['Patient','Payer','Rgn', ...(isDirectorView?['Coordinator']:[]), 'Auth #','Approved','Used','Remaining','Expiry',''].map(h => (
                <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
              ))}
            </div>
            {visiblePatients.slice(0,150).map(p => {
              const a = p.auth;
              const rem = visRem(a);
              const exp = daysExp(a);
              const urg = urgent(a);
              const payCol = PAYER_COLORS[p.payer] || B.gray;
              const smeta  = a ? (STATUS_META[a.status] || STATUS_META.active) : { label:'No Auth', color:B.danger, bg:'#FEF2F2', border:'#FECACA' };
              const isFollowToday = a?.nextFollowUp && new Date(a.nextFollowUp).toDateString()===new Date().toDateString();
              return (
                <div key={p.name} style={{ display:'grid', gridTemplateColumns:`180px 120px 60px ${isDirectorView?'100px ':''} 70px 90px 80px 90px 90px 1fr`, padding:'9px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:urg?'#FFFBEB':isFollowToday?'#FFF5F2':'transparent' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                    {isFollowToday && <div style={{ fontSize:9, color:B.danger, fontWeight:700 }}>📞 CALL TODAY</div>}
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, color:payCol, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.payer}</div>
                  <div style={{ fontSize:12, color:B.gray }}>{p.region}</div>
                  {isDirectorView && <div style={{ fontSize:10, color:assignments[p.owner]?.color||B.gray, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.owner}</div>}
                  <div style={{ fontSize:11, color:a?.authNumber?B.black:B.lightGray }}>{a?.authNumber||'—'}</div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{a?.approvedVisits||'—'}</div>
                  <div style={{ fontSize:12, color:B.gray }}>{a?.usedVisits||'—'}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:rem!=null?(rem<=AUTH_STANDARD.renewalTrigger?B.danger:rem<=15?B.yellow:B.green):'#9CA3AF', fontFamily:'monospace' }}>{rem!=null?rem:'—'}</div>
                    {rem!=null&&rem<=AUTH_STANDARD.renewalTrigger&&<div style={{ fontSize:8, color:B.danger, fontWeight:700 }}>RENEW NOW</div>}
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:exp!=null?(exp<=7?B.danger:exp<=14?B.yellow:B.green):B.lightGray, fontWeight:exp!=null&&exp<=14?700:400 }}>
                      {a?.approvedThru?new Date(a.approvedThru).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}
                    </div>
                    {exp!=null&&<div style={{ fontSize:9, color:exp<=7?B.danger:exp<=14?B.yellow:B.lightGray }}>{exp}d</div>}
                  </div>
                  <div>
                    <button onClick={() => startEdit(p)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                      {a?'Update':'+ Add'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

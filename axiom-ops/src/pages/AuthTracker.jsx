import { useState, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useOpsData } from '../hooks/useOpsData';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8', purple:'#7C3AED',
};

const PAYER_COLORS = {
  'Humana':'#0066CC','CarePlus':'#009B77','Medicare/Devoted':'#1565C0',
  'FL Health Care Plans':'#2E7D32','Aetna':'#7B1FA2','Cigna':'#E65100',
  'HealthFirst':'#00838F','Other':'#6B7280',
};
const PAYER_PHONES = {
  'Humana':'1-800-448-6262','CarePlus':'1-800-794-5907',
  'Medicare/Devoted':'1-800-338-6833','FL Health Care Plans':'1-800-955-8771',
  'Aetna':'1-800-624-0756','Cigna':'1-800-244-6224','HealthFirst':'1-800-935-5465',
};
const ALL_PAYERS=['Humana','CarePlus','Medicare/Devoted','FL Health Care Plans','Aetna','Cigna','HealthFirst'];
const ALL_REGIONS=['A','B','C','G','H','J','M','N','T','V'];
const AUTH_STANDARD={ visits:24, evalVisits:1, reassessments:3, periodDays:90, renewalTrigger:9 };

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

const EMPTY_AUTH = { authNumber:'', approvedVisits:24, usedVisits:0, approvedFrom:'', approvedThru:'', status:'active', submittedDate:'', lastCallDate:'', lastCallNotes:'', nextFollowUp:'', denialReason:'', renewalSubmitted:false };

export default function AuthTracker() {
  const { isSuperAdmin, isDirector, profile } = useAuth();
  const { censusData, hasCensus, authRecordsMap, saveAuthRecord, loading } = useOpsData();
  const isDirectorView = isSuperAdmin || isDirector;

  const [view, setView] = useState('dashboard');
  const [editingPatient, setEditingPatient] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_AUTH);
  const [search, setSearch] = useState('');
  const [filterPayer, setFilterPayer] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [saving, setSaving] = useState(false);

  const setField = (k,v) => setEditForm(p=>({...p,[k]:v}));

  // Build patient list from live census
  const allPatients = useMemo(() => {
    if (!hasCensus || !censusData?.patients) return [];
    return censusData.patients
      .filter(p => ['active','active_auth_pending','auth_pending'].includes(p.status))
      .map(p => {
        const payer = getPayer(p.ref||p.payer);
        const auth  = authRecordsMap[p.name] || null;
        return { ...p, payer, auth };
      });
  }, [censusData, hasCensus, authRecordsMap]);

  const visiblePatients = useMemo(() => {
    let list = allPatients;
    if (filterPayer  !== 'all') list = list.filter(p => p.payer === filterPayer);
    if (filterRegion !== 'all') list = list.filter(p => p.region === filterRegion);
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filterStatus === 'no_auth')       list = list.filter(p => !p.auth);
    if (filterStatus === 'expiring_soon') list = list.filter(p => { if (!p.auth?.approvedThru) return false; return Math.floor((new Date(p.auth.approvedThru)-new Date())/86400000) <= 14; });
    if (filterStatus === 'follow_up_today') list = list.filter(p => p.auth?.nextFollowUp && new Date(p.auth.nextFollowUp).toDateString()===new Date().toDateString());
    if (['pending','denied','expired','renewal_submitted'].includes(filterStatus)) list = list.filter(p => p.auth?.status === filterStatus);
    return list;
  }, [allPatients, filterPayer, filterRegion, search, filterStatus]);

  // KPIs
  const noAuth       = allPatients.filter(p => !p.auth).length;
  const expiringSoon = allPatients.filter(p => { if (!p.auth?.approvedThru) return false; return Math.floor((new Date(p.auth.approvedThru)-new Date())/86400000)<=14; }).length;
  const pendingCount = allPatients.filter(p => p.auth?.status==='pending').length;
  const followToday  = allPatients.filter(p => p.auth?.nextFollowUp && new Date(p.auth.nextFollowUp).toDateString()===new Date().toDateString());

  const visRem  = a => a ? (a.approvedVisits||0)-(a.usedVisits||0) : null;
  const daysExp = a => a?.approvedThru ? Math.floor((new Date(a.approvedThru)-new Date())/86400000) : null;
  const urgent  = a => { const r=visRem(a); const e=daysExp(a); return (r!=null&&r<=AUTH_STANDARD.renewalTrigger)||(e!=null&&e<=14); };

  const saveAuth = async () => {
    setSaving(true);
    await saveAuthRecord(editingPatient.name, { ...editForm, payer: editingPatient.payer });
    setSaving(false);
    setEditingPatient(null);
    setView('list');
  };

  const startEdit = (patient) => {
    setEditingPatient(patient);
    setEditForm(patient.auth || { ...EMPTY_AUTH, submittedDate: new Date().toISOString().split('T')[0] });
    setView('edit');
  };

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>Loading auth tracker...</div>;

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>🔒 Authorization Tracker</h1>
          <p style={{ fontSize:13, color:B.gray, margin:0 }}>{allPatients.length} active patients · Live data — updates sync to all users</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {['dashboard','list'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding:'7px 14px', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${view===v?B.red:B.border}`, background:view===v?'#FFF5F2':'transparent', color:view===v?B.red:B.gray, fontWeight:view===v?700:400 }}>
              {v==='dashboard'?'📊 Overview':'📋 Patient List'}
            </button>
          ))}
        </div>
      </div>

      {!hasCensus && <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'16px 20px', fontSize:13, color:B.blue, marginBottom:20 }}>ℹ️ Upload your patient census so the director can populate the auth tracker.</div>}

      {/* Edit form */}
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
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Last Call Notes</label>
            <textarea value={editForm.lastCallNotes||''} onChange={e=>setField('lastCallNotes',e.target.value)} placeholder="Who you spoke with, reference number, outcome..." rows={3}
              style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
          </div>
          <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:B.blue }}>
            📋 Standard: {AUTH_STANDARD.visits} visits · {AUTH_STANDARD.periodDays} days · Renew when ≤{AUTH_STANDARD.renewalTrigger} visits remain
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={()=>{ setEditingPatient(null); setView('list'); }} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'9px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={saveAuth} disabled={saving} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              {saving?'Saving...':'Save Authorization'}
            </button>
          </div>
        </div>
      )}

      {/* Dashboard */}
      {view==='dashboard' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
            {[
              {label:'No Auth on File',count:noAuth,color:B.danger,bg:'#FEF2F2',border:'#FECACA',filter:'no_auth'},
              {label:'Expiring ≤14d',count:expiringSoon,color:B.yellow,bg:'#FFFBEB',border:'#FDE68A',filter:'expiring_soon'},
              {label:'Pending Review',count:pendingCount,color:B.blue,bg:'#EFF6FF',border:'#BFDBFE',filter:'pending'},
              {label:'Follow Up Today',count:followToday.length,color:B.purple,bg:'#F5F3FF',border:'#DDD6FE',filter:'follow_up_today'},
            ].map(m=>(
              <div key={m.label} onClick={()=>{ setFilterStatus(m.filter); setView('list'); }}
                style={{ background:m.bg, border:`1px solid ${m.border}`, borderRadius:12, padding:'14px', textAlign:'center', cursor:'pointer' }}>
                <div style={{ fontSize:28, fontWeight:800, color:m.color, fontFamily:'monospace', lineHeight:1 }}>{m.count}</div>
                <div style={{ fontSize:10, color:m.color, textTransform:'uppercase', letterSpacing:'0.07em', marginTop:5 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {followToday.length>0&&(
            <div style={{ background:B.card, border:'1.5px solid #FECACA', borderRadius:14, padding:'18px 20px', marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:800, color:B.danger, marginBottom:12 }}>📞 Follow Up Today — {followToday.length} patients</div>
              {followToday.map(p=>(
                <div key={p.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:B.bg, borderRadius:8, border:`1px solid ${B.border}`, marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{p.name}</div>
                    <div style={{ fontSize:11, color:B.gray, marginTop:2 }}>
                      <span style={{ color:PAYER_COLORS[p.payer]||B.gray, fontWeight:600 }}>{p.payer}</span>{' · '}Region {p.region}
                      {PAYER_PHONES[p.payer]&&<span style={{ color:B.lightGray, marginLeft:8 }}>{PAYER_PHONES[p.payer]}</span>}
                    </div>
                  </div>
                  <button onClick={()=>startEdit(p)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Update</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:13, fontWeight:700, color:B.black, marginBottom:12 }}>📋 Standard Authorization Parameters</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {[
                {label:'Visit Allowance',value:`${AUTH_STANDARD.visits} visits`},
                {label:'Evaluation',value:`${AUTH_STANDARD.evalVisits} initial eval`},
                {label:'Reassessments',value:`${AUTH_STANDARD.reassessments} included`},
                {label:'Auth Period',value:`${AUTH_STANDARD.periodDays} days`},
                {label:'Renewal Trigger',value:`≤${AUTH_STANDARD.renewalTrigger} visits remaining`},
                {label:'Lead Time',value:'Submit 2–3 weeks before expiry'},
              ].map(f=>(
                <div key={f.label} style={{ padding:'10px 12px', background:B.bg, borderRadius:8 }}>
                  <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{f.label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Patient List */}
      {view==='list' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient..."
              style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:180 }} />
            <select value={filterPayer} onChange={e=>setFilterPayer(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Payers</option>
              {ALL_PAYERS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Regions</option>
              {ALL_REGIONS.map(r=><option key={r} value={r}>Region {r}</option>)}
            </select>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Statuses</option>
              <option value="no_auth">No Auth on File</option>
              <option value="expiring_soon">Expiring ≤14 days</option>
              <option value="follow_up_today">Follow Up Today</option>
              <option value="pending">Pending Review</option>
              <option value="denied">Denied</option>
            </select>
            <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visiblePatients.length} patients</span>
          </div>

          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'180px 120px 60px 70px 90px 80px 90px 1fr', padding:'9px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {['Patient','Payer','Rgn','Auth #','Approved','Used','Expiry',''].map(h=>(
                <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
              ))}
            </div>
            {visiblePatients.slice(0,150).map(p=>{
              const a=p.auth;
              const rem=visRem(a);
              const exp=daysExp(a);
              const urg=urgent(a);
              const payCol=PAYER_COLORS[p.payer]||B.gray;
              const isFollowToday=a?.nextFollowUp&&new Date(a.nextFollowUp).toDateString()===new Date().toDateString();
              return (
                <div key={p.name} style={{ display:'grid', gridTemplateColumns:'180px 120px 60px 70px 90px 80px 90px 1fr', padding:'9px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:urg?'#FFFBEB':isFollowToday?'#FFF5F2':'transparent' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                    {isFollowToday&&<div style={{ fontSize:9, color:B.danger, fontWeight:700 }}>📞 CALL TODAY</div>}
                  </div>
                  <div style={{ fontSize:11, fontWeight:600, color:payCol, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.payer}</div>
                  <div style={{ fontSize:12, color:B.gray }}>{p.region}</div>
                  <div style={{ fontSize:11, color:a?.authNumber?B.black:B.lightGray }}>{a?.authNumber||'—'}</div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{a?.approvedVisits||'—'}</div>
                  <div style={{ fontSize:12, color:B.gray }}>{a?.usedVisits||'—'}</div>
                  <div>
                    <div style={{ fontSize:11, color:exp!=null?(exp<=7?B.danger:exp<=14?B.yellow:B.green):B.lightGray, fontWeight:exp!=null&&exp<=14?700:400 }}>
                      {a?.approvedThru?new Date(a.approvedThru).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—'}
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
          </div>
        </>
      )}
    </div>
  );
}

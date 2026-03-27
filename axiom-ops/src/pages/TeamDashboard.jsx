import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
 
// ── Design tokens ──────────────────────────────────────────────
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626',
  blue:'#1D4ED8', purple:'#7C3AED',
};
const AUTH_COLOR = '#0369A1';
const CC_COLOR   = '#059669';
 
const PAYER_COLORS = {
  'Humana':'#0066CC','CarePlus':'#009B77','Medicare/Devoted':'#1565C0',
  'FL Health Care Plans':'#2E7D32','Aetna':'#7B1FA2',
  'Cigna':'#E65100','HealthFirst':'#00838F','Simply':'#0891B2',
  'Medicare':'#64748B','Private Pay':'#92400E','Private Pay/LOA':'#78350F',
  'Other':'#6B7280','Unknown':'#9CA3AF',
};
const PAYER_PHONES = {
  'Humana':'1-800-448-6262','CarePlus':'1-800-794-5907',
  'Medicare/Devoted':'1-800-338-6833','FL Health Care Plans':'1-800-955-8771',
  'Aetna':'1-800-624-0756','Cigna':'1-800-244-6224','HealthFirst':'1-800-935-5465',
};
 
// ── Helpers ────────────────────────────────────────────────────
function daysUntil(d) {
  if (!d) return null;
  return Math.floor((new Date(d+'T12:00:00') - new Date()) / 86400000);
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});
}
 
const PRIORITY_ORDER = { overdue:0, expiring_critical:1, visits_low:2, followup_due:3, expiring_soon:4, no_auth:5, pending:6, expired:7, ok:8 };
const PRIORITY_META = {
  no_auth:          { label:'No Auth',        color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨' },
  expiring_critical:{ label:'Expiring ≤7d',   color:'#EA580C', bg:'#FFF7ED', border:'#FED7AA', icon:'⚠️' },
  visits_low:       { label:'≤3 Visits Left', color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', icon:'🔢' },
  followup_due:     { label:'Follow-Up Due',  color:B.purple,  bg:'#F5F3FF', border:'#DDD6FE', icon:'📞' },
  expiring_soon:    { label:'Expiring ≤30d',  color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'🕐' },
  expired:          { label:'Expired',        color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'⏰' },
  pending:          { label:'Pending',        color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE', icon:'🔄' },
  discharged:       { label:'Discharged',     color:'#6B7280', bg:'#F3F4F6', border:'#D1D5DB', icon:'📤' },
  ok:               { label:'Active',         color:B.green,   bg:'#F0FDF4', border:'#BBF7D0', icon:'✅' },
};
 
function getPriority(r) {
  if (r.auth_status === 'discharged') return 'discharged';
  if (!r.auth_number) return 'no_auth';
  const exp = daysUntil(r.auth_thru);
  const txRem = (r.tx_approved||0)-(r.tx_used||0);
  const isOverdue = r.next_follow_up && new Date(r.next_follow_up+'T12:00:00') < new Date(new Date().setHours(0,0,0,0));
  const isToday   = r.next_follow_up && new Date(r.next_follow_up+'T12:00:00').toDateString() === new Date().toDateString();
  if (exp !== null && exp < 0)              return 'expired';
  if (exp !== null && exp <= 7)             return 'expiring_critical';
  if (r.auth_number && txRem >= 0 && txRem <= 3) return 'visits_low';
  if (isOverdue || isToday)                 return 'followup_due';
  if (exp !== null && exp <= 30)            return 'expiring_soon';
  if ((r.auth_status||'') === 'pending')    return 'pending';
  return 'ok';
}
 
// ── Shared KPI card ────────────────────────────────────────────
function KPICard({ label, value, icon, color, sub, alert }) {
  return (
    <div style={{ background:alert?`${color}08`:B.card, border:`1.5px solid ${alert?color:B.border}`, borderRadius:14, padding:'16px 18px', flex:1, minWidth:130, boxShadow:alert?`0 2px 10px ${color}20`:'0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:20 }}>{icon}</span>
        {alert&&<span style={{ fontSize:9, fontWeight:800, color, background:`${color}15`, padding:'2px 7px', borderRadius:20, textTransform:'uppercase', letterSpacing:'0.08em' }}>Action</span>}
      </div>
      <div style={{ fontSize:30, fontWeight:800, color, fontFamily:"'DM Mono',monospace", lineHeight:1, marginBottom:5 }}>{value??'—'}</div>
      <div style={{ fontSize:12, fontWeight:600, color:B.gray, marginBottom:sub?2:0 }}>{label}</div>
      {sub&&<div style={{ fontSize:10, color:B.lightGray }}>{sub}</div>}
    </div>
  );
}
 
// ── Inline edit modal ──────────────────────────────────────────
function EditAuthModal({ record, onSave, onClose }) {
  const [form, setForm] = useState({...record});
  const [saving, setSaving] = useState(false);
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));
  const txRem = (parseInt(form.tx_approved)||0)-(parseInt(form.tx_used)||0);
 
  const save = async () => {
    setSaving(true);
    await supabase.from('auth_records').update({
      auth_number: form.auth_number||null, auth_from: form.auth_from||null,
      auth_thru: form.auth_thru||null, tx_approved: parseInt(form.tx_approved)||0,
      tx_used: parseInt(form.tx_used)||0, ra_approved: parseInt(form.ra_approved)||0,
      ra_used: parseInt(form.ra_used)||0, auth_status: form.auth_status||'active',
      pcp: form.pcp||null, last_call_date: form.last_call_date||null,
      last_call_notes: form.last_call_notes||null, next_follow_up: form.next_follow_up||null,
      notes: form.notes||null, vob_verified: form.vob_verified||false,
      updated_at: new Date().toISOString(),
    }).eq('id', record.id);
    setSaving(false);
    onSave();
  };
 
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:B.card, borderRadius:20, padding:'28px', width:'100%', maxWidth:640, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:B.black }}>{record.auth_number?'Update':'Add'} Authorization</div>
            <div style={{ fontSize:13, color:B.gray, marginTop:2 }}>{record.patient_name} · <span style={{ color:PAYER_COLORS[record.payer]||B.gray, fontWeight:700 }}>{record.payer||'Unknown'}</span> · Region {record.region||'—'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'6px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
        </div>
        {parseInt(form.tx_approved)>0&&(
          <div style={{ background:B.bg, borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:12, color:B.gray }}>TX Visits Remaining</span>
              <span style={{ fontSize:15, fontWeight:800, color:txRem<=3?B.danger:txRem<=9?B.yellow:B.green, fontFamily:'monospace' }}>{txRem} / {form.tx_approved}</span>
            </div>
            <div style={{ height:5, background:'rgba(0,0,0,0.08)', borderRadius:3 }}><div style={{ height:'100%', width:`${Math.max(0,Math.min(100,txRem/form.tx_approved*100))}%`, background:txRem<=3?B.danger:txRem<=9?B.yellow:B.green, borderRadius:3 }} /></div>
            {txRem<=3&&txRem>=0&&<div style={{ fontSize:11, color:B.danger, marginTop:3, fontWeight:700 }}>⚠️ Renew now — only {txRem} visit{txRem!==1?'s':''} left</div>}
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          {[
            {label:'Auth Number',key:'auth_number',type:'text',ph:'e.g. 222027872'},
            {label:'Auth Status',key:'auth_status',type:'select',opts:['active','pending','approved','denied','expired','renewal_submitted']},
            {label:'Auth Start',key:'auth_from',type:'date'},{label:'Auth Expiry',key:'auth_thru',type:'date'},
            {label:'TX Approved',key:'tx_approved',type:'number'},{label:'TX Used',key:'tx_used',type:'number'},
            {label:'RA Approved',key:'ra_approved',type:'number'},{label:'RA Used',key:'ra_used',type:'number'},
            {label:'Last Call Date',key:'last_call_date',type:'date'},{label:'Next Follow-Up',key:'next_follow_up',type:'date'},
          ].map(f=>(
            <div key={f.key}>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>{f.label}</label>
              {f.type==='select'
                ?<select value={form[f.key]||''} onChange={e=>setF(f.key,e.target.value)} style={{ width:'100%', padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>{f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                :<input type={f.type} value={form[f.key]||''} placeholder={f.ph} onChange={e=>setF(f.key,f.type==='number'?parseInt(e.target.value)||0:e.target.value)} style={{ width:'100%', padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />}
            </div>
          ))}
        </div>
        <div style={{ marginBottom:10 }}>
          <label style={{ display:'flex', gap:8, alignItems:'center', fontSize:12, color:B.gray, cursor:'pointer' }}>
            <input type="checkbox" checked={!!form.vob_verified} onChange={e=>setF('vob_verified',e.target.checked)} /> VOB Verified
          </label>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:3 }}>Last Call Notes</label>
          <textarea value={form.last_call_notes||''} onChange={e=>setF('last_call_notes',e.target.value)} placeholder="Who you spoke with, reference #, outcome..." rows={3} style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'8px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{saving?'Saving...':'Save'}</button>
        </div>
      </div>
    </div>
  );
}
 
// ══════════════════════════════════════════════════════════════
// AUTH TEAM DASHBOARD — reads live from Supabase auth_records
// ══════════════════════════════════════════════════════════════
export function AuthDashboard() {
  const { profile } = useAuth();
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editingRecord, setEditingRecord] = useState(null);
  const [search, setSearch]         = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterPayer, setFilterPayer]       = useState('all');
  const [showExpired, setShowExpired]       = useState(false);
  const [expandedTask, setExpandedTask]     = useState(null);
 
  const userName  = profile?.full_name || profile?.name || '';
  const firstName = userName.split(' ')[0] || 'Coordinator';
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today     = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
 
  const loadRecords = async () => {
    const { data } = await supabase.from('auth_records').select('*').order('patient_name');
    setAllRecords(data || []);
    setLoading(false);
  };
 
  useEffect(() => {
    loadRecords();
    const sub = supabase.channel('auth-dash-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'auth_records'},loadRecords)
      .subscribe();
    return () => sub.unsubscribe();
  }, []);
 
  // My records — scoped to logged-in user
  const myRecords = useMemo(() => {
    if (!userName) return allRecords; // fallback: show all if name not matched
    const mine = allRecords.filter(r => r.assigned_to === userName);
    return (mine.length > 0 ? mine : allRecords)
      .map(r => ({ ...r, priority:getPriority(r), txRemaining:(r.tx_approved||0)-(r.tx_used||0), daysLeft:daysUntil(r.auth_thru) }))
      .sort((a,b) => (PRIORITY_ORDER[a.priority]||9)-(PRIORITY_ORDER[b.priority]||9));
  }, [allRecords, userName]);
 
  const active = myRecords.filter(r => r.priority !== 'expired' && r.priority !== 'discharged');
 
  // Task buckets
  const todayStr   = new Date().toDateString();
  const overdue    = myRecords.filter(r => r.next_follow_up && new Date(r.next_follow_up+'T12:00:00') < new Date(new Date().setHours(0,0,0,0)));
  const callToday  = myRecords.filter(r => r.next_follow_up && new Date(r.next_follow_up+'T12:00:00').toDateString()===todayStr);
  const expiring7  = myRecords.filter(r => r.daysLeft!==null && r.daysLeft>=0 && r.daysLeft<=7);
  const visitsLow  = myRecords.filter(r => r.auth_number && r.txRemaining>=0 && r.txRemaining<=3);
  const noAuth     = active.filter(r => !r.auth_number);
 
  const taskItems = [
    { key:'overdue', icon:'🔴', label:'Overdue Follow-Up Calls',         count:overdue.length,   color:B.danger,  bg:'#FEF2F2', border:'#FECACA', patients:overdue,   action:'Past due — call now' },
    { key:'today',   icon:'📞', label:'Follow-Up Calls Due Today',        count:callToday.length, color:B.purple,  bg:'#F5F3FF', border:'#DDD6FE', patients:callToday, action:'Complete before end of day' },
    { key:'exp7',    icon:'⚠️',  label:'Auths Expiring Within 7 Days',    count:expiring7.length, color:'#EA580C', bg:'#FFF7ED', border:'#FED7AA', patients:expiring7, action:'Submit renewal immediately' },
    { key:'vis',     icon:'🔢', label:'Patients with ≤3 Visits Left',     count:visitsLow.length, color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', patients:visitsLow, action:'Request new auth now' },
    { key:'noauth',  icon:'🚨', label:'Active Patients — No Auth on File', count:noAuth.length,    color:B.danger,  bg:'#FEF2F2', border:'#FECACA', patients:noAuth,    action:'Verify with payer' },
  ].filter(t => t.count > 0);
 
  const payers = [...new Set(myRecords.map(r=>r.payer).filter(p=>p&&p.length>2))].sort();
 
  const visible = useMemo(() => {
    let list = myRecords;
    if (!showExpired) list = list.filter(r => r.priority !== 'expired' && r.priority !== 'discharged');
    if (filterPriority !== 'all') list = list.filter(r => r.priority === filterPriority);
    if (filterPayer !== 'all') list = list.filter(r => r.payer === filterPayer);
    if (search) list = list.filter(r => (r.patient_name||'').toLowerCase().includes(search.toLowerCase())||(r.auth_number||'').includes(search));
    return list;
  }, [myRecords, showExpired, filterPriority, filterPayer, search]);
 
  if (loading) return <div style={{ padding:40, textAlign:'center', color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>Loading your dashboard...</div>;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
 
      {/* Header banner */}
      <div style={{ background:`linear-gradient(135deg,${B.darkRed},${B.red},${B.orange})`, borderRadius:16, padding:'20px 28px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 4px 16px rgba(139,26,16,0.2)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:0.05, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
        <div style={{ position:'relative' }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:4 }}>Authorization Team</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:2 }}>{greeting}, {firstName} 👋</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>{today}</div>
        </div>
        <div style={{ display:'flex', gap:24, position:'relative' }}>
          {[
            {label:'My Patients', value:active.length, color:'#fff'},
            {label:'Tasks Today', value:taskItems.reduce((s,t)=>s+t.count,0), color:taskItems.length>0?'#FDE68A':'#BBF7D0'},
            {label:'No Auth',     value:noAuth.length, color:noAuth.length>0?'#FCA5A5':'#BBF7D0'},
          ].map((s,i)=>(
            <div key={s.label} style={{ textAlign:'center', paddingLeft:i>0?20:0, borderLeft:i>0?'1px solid rgba(255,255,255,0.25)':'none' }}>
              <div style={{ fontSize:30, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
 
      {/* Daily task list */}
      {taskItems.length > 0 ? (
        <div style={{ background:B.card, border:'1.5px solid #FED7AA', borderRadius:16, padding:'18px 22px', marginBottom:20, boxShadow:'0 2px 8px rgba(234,88,12,0.07)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:14, fontWeight:800, color:B.black }}>📋 Your Tasks for Today</div>
            <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:20, padding:'3px 12px', fontSize:11, fontWeight:700, color:'#EA580C' }}>{taskItems.reduce((s,t)=>s+t.count,0)} items</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {taskItems.map(task => (
              <div key={task.key}>
                <div onClick={()=>setExpandedTask(expandedTask===task.key?null:task.key)}
                  style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', background:task.bg, border:`1px solid ${task.border}`, borderRadius:10, cursor:'pointer' }}>
                  <span style={{ fontSize:16 }}>{task.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:task.color }}>{task.label}</div>
                    <div style={{ fontSize:11, color:task.color, opacity:0.75, marginTop:1 }}>{task.action}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ background:task.color, color:'#fff', borderRadius:20, padding:'2px 12px', fontSize:13, fontWeight:800, fontFamily:'monospace' }}>{task.count}</div>
                    <span style={{ fontSize:11, color:task.color }}>{expandedTask===task.key?'▲':'▼'}</span>
                  </div>
                </div>
                {expandedTask===task.key&&(
                  <div style={{ background:'#FAFAFA', border:`1px solid ${task.border}`, borderTop:'none', borderRadius:'0 0 10px 10px', padding:'8px 12px' }}>
                    {task.patients.slice(0,8).map(p=>{
                      const isOverdue2 = p.next_follow_up && new Date(p.next_follow_up+'T12:00:00') < new Date(new Date().setHours(0,0,0,0));
                      return (
                        <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 10px', marginBottom:4, background:B.card, borderRadius:8, border:`1px solid ${B.border}` }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:B.black }}>{p.patient_name}</div>
                            <div style={{ fontSize:10, color:B.gray, marginTop:1 }}>
                              <span style={{ color:PAYER_COLORS[p.payer]||B.gray, fontWeight:600 }}>{p.payer||'Unknown'}</span>
                              {p.region&&<span style={{ marginLeft:6 }}>· Region {p.region}</span>}
                              {p.daysLeft!==null&&p.daysLeft>=0&&p.daysLeft<=7&&<span style={{ marginLeft:6, color:'#EA580C', fontWeight:700 }}>· {p.daysLeft}d left</span>}
                              {p.txRemaining>=0&&p.txRemaining<=3&&p.auth_number&&<span style={{ marginLeft:6, color:B.danger, fontWeight:700 }}>· {p.txRemaining} visit{p.txRemaining!==1?'s':''} left</span>}
                              {p.next_follow_up&&<span style={{ marginLeft:6, color:isOverdue2?B.danger:B.purple, fontWeight:isOverdue2?700:400 }}>· {isOverdue2?'OVERDUE: ':''}{new Date(p.next_follow_up+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            {PAYER_PHONES[p.payer]&&<span style={{ fontSize:9, color:B.lightGray }}>📞 {PAYER_PHONES[p.payer]}</span>}
                            <button onClick={()=>setEditingRecord(p)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Update</button>
                          </div>
                        </div>
                      );
                    })}
                    {task.count>8&&<div style={{ fontSize:11, color:B.lightGray, textAlign:'center', padding:6 }}>+{task.count-8} more — see full queue below</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:14, padding:'14px 20px', marginBottom:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.green }}>✅ All clear — no urgent tasks today!</div>
        </div>
      )}
 
      {/* Patient queue */}
      <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ padding:'14px 20px', borderBottom:`1px solid ${B.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.black }}>My Patient Queue — {active.length} active</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient or auth#..." style={{ padding:'6px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:180 }} />
            <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} style={{ padding:'6px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Priorities</option>
              {Object.entries(PRIORITY_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filterPayer} onChange={e=>setFilterPayer(e.target.value)} style={{ padding:'6px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Payers</option>
              {payers.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:B.gray, cursor:'pointer' }}>
              <input type="checkbox" checked={showExpired} onChange={e=>setShowExpired(e.target.checked)} /> Expired / Discharged
            </label>
            <span style={{ fontSize:11, color:B.lightGray }}>{visible.length} shown</span>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 110px 50px 110px 65px 55px 55px 75px 75px', padding:'8px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
          {['Patient','Payer','Rgn','Auth #','Expiry','TX App','TX Rem','Priority',''].map(h=>(
            <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
          ))}
        </div>
        {visible.slice(0,150).map(r=>{
          const meta=PRIORITY_META[r.priority]||PRIORITY_META.ok;
          const payCol=PAYER_COLORS[r.payer]||B.gray;
          const urgent=['no_auth','expiring_critical','visits_low','followup_due'].includes(r.priority);
          return (
            <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1fr 110px 50px 110px 65px 55px 55px 75px 75px', padding:'8px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:urgent?'#FFFBEB':'transparent' }}>
              <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:6 }}>{r.patient_name}</div>
              <div style={{ fontSize:11, fontWeight:600, color:payCol, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.payer||'—'}</div>
              <div style={{ fontSize:11, color:B.gray }}>{r.region||'—'}</div>
              <div style={{ fontSize:10, color:r.auth_number?B.black:B.lightGray, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.auth_number||'—'}</div>
              <div style={{ fontSize:10, color:r.daysLeft!=null?(r.daysLeft<=7?B.danger:r.daysLeft<=30?B.yellow:B.green):B.lightGray, fontWeight:r.daysLeft!=null&&r.daysLeft<=30?700:400 }}>{fmtDate(r.auth_thru)}</div>
              <div style={{ fontSize:12, fontFamily:'monospace', color:B.black }}>{r.tx_approved||'—'}</div>
              <div style={{ fontSize:13, fontWeight:800, fontFamily:'monospace', color:r.txRemaining<=3?B.danger:r.txRemaining<=9?B.yellow:B.green }}>{r.auth_number?(r.txRemaining>=0?r.txRemaining:'—'):'—'}</div>
              <div><span style={{ fontSize:9, fontWeight:700, color:meta.color, background:meta.bg, border:`1px solid ${meta.border}`, borderRadius:10, padding:'2px 5px', whiteSpace:'nowrap' }}>{meta.icon} {meta.label}</span></div>
              <div><button onClick={()=>setEditingRecord(r)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'4px 9px', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{r.auth_number?'Update':'+ Auth'}</button></div>
            </div>
          );
        })}
        {visible.length===0&&<div style={{ padding:28, textAlign:'center', color:B.lightGray, fontSize:13 }}>{myRecords.length===0?`No patients assigned to ${firstName} yet`:'No patients match these filters'}</div>}
        {visible.length>150&&<div style={{ padding:'10px', textAlign:'center', fontSize:11, color:B.lightGray, borderTop:`1px solid ${B.border}` }}>Showing 150 of {visible.length} — use filters to narrow</div>}
      </div>
 
      {editingRecord&&<EditAuthModal record={editingRecord} onSave={()=>{loadRecords();setEditingRecord(null);}} onClose={()=>setEditingRecord(null)} />}
    </div>
  );
}
 
// ══════════════════════════════════════════════════════════════
// CARE COORD DASHBOARD — reads from census + pariox (unchanged)
// ══════════════════════════════════════════════════════════════
 
 

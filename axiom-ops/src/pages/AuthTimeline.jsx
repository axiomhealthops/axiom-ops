import { useState, useEffect, useMemo } from 'react';
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
  'FL Health Care Plans':'#2E7D32','Aetna':'#7B1FA2','Cigna':'#E65100',
  'HealthFirst':'#00838F','Simply':'#0891B2','Medicare':'#64748B',
  'Private Pay':'#92400E','Other':'#6B7280',
};
 
function daysBetween(a, b) {
  if (!a || !b) return null;
  const d1 = new Date(a+'T12:00:00');
  const d2 = new Date(b+'T12:00:00');
  return Math.round((d2 - d1) / 86400000);
}
 
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'});
}
 
function TATBadge({ days }) {
  if (days === null) return <span style={{ color:B.lightGray }}>—</span>;
  const color = days <= 3 ? B.green : days <= 7 ? B.yellow : days <= 14 ? B.orange : B.danger;
  const bg    = days <= 3 ? '#F0FDF4' : days <= 7 ? '#FFFBEB' : days <= 14 ? '#FFF7ED' : '#FEF2F2';
  return (
    <span style={{ background:bg, color, border:`1px solid ${color}30`, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>
      {days}d
    </span>
  );
}
 
function KPICard({ label, value, sub, color, icon, alert }) {
  return (
    <div style={{ background:alert?`${color}08`:B.card, border:`1.5px solid ${alert?color:B.border}`, borderRadius:14, padding:'16px 18px', flex:1, minWidth:130, boxShadow:alert?`0 2px 8px ${color}20`:'0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize:20, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:28, fontWeight:800, color, fontFamily:"'DM Mono',monospace", lineHeight:1, marginBottom:4 }}>{value??'—'}</div>
      <div style={{ fontSize:12, fontWeight:600, color:B.gray }}>{label}</div>
      {sub&&<div style={{ fontSize:10, color:B.lightGray, marginTop:2 }}>{sub}</div>}
    </div>
  );
}
 
export default function AuthTimeline() {
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterPayer, setFilterPayer]     = useState('all');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [filterTAT, setFilterTAT]         = useState('all');
  const [sortBy, setSortBy]     = useState('date_submitted');
  const [sortDir, setSortDir]   = useState('desc');
  const [activeTab, setActiveTab] = useState('table');
 
  useEffect(() => {
    supabase.from('auth_records')
      .select('id,patient_name,payer,region,assigned_to,auth_status,auth_number,date_submitted,auth_from,auth_thru,denial_reason,notes,updated_at')
      .order('date_submitted', { ascending:false, nullsFirst:false })
      .then(({ data }) => { setRecords(data||[]); setLoading(false); });
  }, []);
 
  // Augment with computed fields
  const augmented = useMemo(() => records.map(r => ({
    ...r,
    tat: daysBetween(r.date_submitted, r.auth_from || (r.auth_status==='denied'?r.updated_at?.split('T')[0]:null)),
    daysOpen: r.date_submitted && !r.auth_from && r.auth_status!=='denied'
      ? daysBetween(r.date_submitted, new Date().toISOString().split('T')[0])
      : null,
    outcome: r.auth_status === 'denied' ? 'denied'
      : r.auth_number ? 'approved'
      : r.date_submitted ? 'pending'
      : 'no_submission',
  })), [records]);
 
  // Filters
  const visible = useMemo(() => {
    let list = augmented.filter(r => r.date_submitted || r.auth_from); // only records with timeline data
    if (search) list = list.filter(r => (r.patient_name||'').toLowerCase().includes(search.toLowerCase()) || (r.auth_number||'').includes(search));
    if (filterPayer !== 'all') list = list.filter(r => r.payer === filterPayer);
    if (filterStatus !== 'all') list = list.filter(r => r.auth_status === filterStatus);
    if (filterAssignee !== 'all') list = list.filter(r => r.assigned_to === filterAssignee);
    if (filterTAT === 'fast') list = list.filter(r => r.tat !== null && r.tat <= 3);
    if (filterTAT === 'normal') list = list.filter(r => r.tat !== null && r.tat > 3 && r.tat <= 7);
    if (filterTAT === 'slow') list = list.filter(r => r.tat !== null && r.tat > 7 && r.tat <= 14);
    if (filterTAT === 'critical') list = list.filter(r => (r.tat !== null && r.tat > 14) || (r.daysOpen !== null && r.daysOpen > 14));
    if (filterTAT === 'pending') list = list.filter(r => r.daysOpen !== null);
    // Sort
    list = [...list].sort((a, b) => {
      let va = a[sortBy], vb = b[sortBy];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return list;
  }, [augmented, search, filterPayer, filterStatus, filterAssignee, filterTAT, sortBy, sortDir]);
 
  // KPIs
  const withTAT     = augmented.filter(r => r.tat !== null);
  const avgTAT      = withTAT.length ? Math.round(withTAT.reduce((s,r)=>s+r.tat,0)/withTAT.length) : null;
  const fastApprove = withTAT.filter(r => r.tat <= 3).length;
  const slowApprove = withTAT.filter(r => r.tat > 14).length;
  const pending     = augmented.filter(r => r.daysOpen !== null);
  const avgPending  = pending.length ? Math.round(pending.reduce((s,r)=>s+r.daysOpen,0)/pending.length) : null;
  const denied      = augmented.filter(r => r.outcome === 'denied').length;
  const approvalRate = withTAT.length ? Math.round((withTAT.length / (withTAT.length + denied)) * 100) : null;
  const overdue     = pending.filter(r => r.daysOpen > 14);
 
  // By payer breakdown
  const byPayer = useMemo(() => {
    const groups = {};
    augmented.filter(r => r.payer && r.tat !== null).forEach(r => {
      if (!groups[r.payer]) groups[r.payer] = { count:0, totalTAT:0, denied:0, approved:0 };
      groups[r.payer].count++;
      groups[r.payer].totalTAT += r.tat;
      if (r.outcome === 'denied') groups[r.payer].denied++;
      else groups[r.payer].approved++;
    });
    return Object.entries(groups)
      .map(([payer, d]) => ({ payer, count:d.count, avgTAT:Math.round(d.totalTAT/d.count), denied:d.denied, approved:d.approved, denialRate:Math.round(d.denied/(d.count)*100) }))
      .sort((a,b) => b.count - a.count);
  }, [augmented]);
 
  // By coordinator breakdown
  const byCoordinator = useMemo(() => {
    const groups = {};
    augmented.filter(r => r.assigned_to && r.tat !== null).forEach(r => {
      if (!groups[r.assigned_to]) groups[r.assigned_to] = { count:0, totalTAT:0, denied:0, overdue:0 };
      groups[r.assigned_to].count++;
      groups[r.assigned_to].totalTAT += r.tat;
      if (r.outcome === 'denied') groups[r.assigned_to].denied++;
    });
    augmented.filter(r => r.assigned_to && r.daysOpen > 14).forEach(r => {
      if (groups[r.assigned_to]) groups[r.assigned_to].overdue++;
    });
    return Object.entries(groups)
      .map(([name, d]) => ({ name, count:d.count, avgTAT:Math.round(d.totalTAT/d.count), denied:d.denied, overdue:d.overdue }))
      .sort((a,b) => b.count - a.count);
  }, [augmented]);
 
  const payers     = [...new Set(augmented.map(r=>r.payer).filter(Boolean))].sort();
  const assignees  = [...new Set(augmented.map(r=>r.assigned_to).filter(Boolean))].sort();
  const statuses   = [...new Set(augmented.map(r=>r.auth_status).filter(Boolean))].sort();
 
  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };
 
  const SortBtn = ({ col, label }) => (
    <div onClick={()=>toggleSort(col)} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:3, userSelect:'none' }}>
      {label}
      <span style={{ fontSize:9, color:sortBy===col?B.red:B.lightGray }}>{sortBy===col?(sortDir==='asc'?'▲':'▼'):'⇅'}</span>
    </div>
  );
 
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>
      Loading authorization timeline...
    </div>
  );
 
  const noData = augmented.filter(r => r.date_submitted || r.auth_from).length === 0;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
 
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800, color:B.black, marginBottom:4 }}>⏱️ Authorization Timeline Report</div>
        <div style={{ fontSize:13, color:B.gray }}>
          Tracks submission → approval turnaround time, denial rates, and pending auth aging across all coordinators and payers.
        </div>
      </div>
 
      {noData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📅</div>
          <div style={{ fontSize:16, fontWeight:700, color:B.black, marginBottom:8 }}>No timeline data yet</div>
          <div style={{ fontSize:13, color:B.gray, maxWidth:400, margin:'0 auto' }}>
            Timeline data populates once coordinators enter <strong>Date Submitted</strong> in the Auth Tracker edit form. This is the date the authorization request was sent to the insurance company.
          </div>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 }}>
            <KPICard label="Avg Turnaround" value={avgTAT !== null ? `${avgTAT}d` : '—'} sub="submission to approval" color={avgTAT!=null?(avgTAT<=5?B.green:avgTAT<=10?B.yellow:B.danger):B.gray} icon="⏱️" />
            <KPICard label="Approved ≤3 Days" value={fastApprove} sub="fast approvals" color={B.green} icon="⚡" />
            <KPICard label="Pending >14 Days" value={overdue.length} sub="needs escalation" color={overdue.length>0?B.danger:B.green} icon="🚨" alert={overdue.length>0} />
            <KPICard label="Avg Pending Age" value={avgPending !== null ? `${avgPending}d` : '—'} sub={`${pending.length} still open`} color={avgPending!=null&&avgPending>7?B.danger:B.blue} icon="📋" />
            <KPICard label="Approval Rate" value={approvalRate !== null ? `${approvalRate}%` : '—'} sub={`${denied} denied`} color={approvalRate!=null?(approvalRate>=90?B.green:approvalRate>=75?B.yellow:B.danger):B.gray} icon="✅" />
            <KPICard label="Slowest >14 Days" value={slowApprove} sub="took 2+ weeks" color={slowApprove>0?B.orange:B.green} icon="🐢" alert={slowApprove>0} />
          </div>
 
          {/* Overdue alert */}
          {overdue.length > 0 && (
            <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, padding:'12px 18px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:B.danger }}>🚨 {overdue.length} authorization{overdue.length!==1?'s':''} pending for 14+ days</div>
                <div style={{ fontSize:12, color:B.danger, marginTop:2, opacity:0.8 }}>
                  {overdue.slice(0,3).map(r=>`${r.patient_name} (${r.daysOpen}d)`).join(' · ')}{overdue.length>3?` +${overdue.length-3} more`:''}
                </div>
              </div>
              <button onClick={()=>{ setFilterTAT('pending'); setActiveTab('table'); }} style={{ background:B.danger, border:'none', borderRadius:8, color:'#fff', padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
                View All
              </button>
            </div>
          )}
 
          {/* Tabs */}
          <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${B.border}`, marginBottom:16 }}>
            {[
              { key:'table',   label:'📋 Auth Log' },
              { key:'payer',   label:'🏦 By Payer' },
              { key:'coordinator', label:'👤 By Coordinator' },
            ].map(t=>(
              <button key={t.key} onClick={()=>setActiveTab(t.key)}
                style={{ background:'none', border:'none', borderBottom:`2px solid ${activeTab===t.key?B.red:'transparent'}`, color:activeTab===t.key?B.red:B.gray, padding:'10px 18px', fontSize:13, fontWeight:activeTab===t.key?700:400, cursor:'pointer', fontFamily:'inherit' }}>
                {t.label}
              </button>
            ))}
          </div>
 
          {/* Auth Log Table */}
          {activeTab==='table' && (
            <>
              {/* Filters */}
              <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient or auth#..."
                  style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:200 }} />
                <select value={filterPayer} onChange={e=>setFilterPayer(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
                  <option value="all">All Payers</option>
                  {payers.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <select value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
                  <option value="all">All Coordinators</option>
                  {assignees.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
                  <option value="all">All Statuses</option>
                  {statuses.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filterTAT} onChange={e=>setFilterTAT(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
                  <option value="all">All Turnarounds</option>
                  <option value="fast">⚡ Fast (≤3d)</option>
                  <option value="normal">✅ Normal (4-7d)</option>
                  <option value="slow">⚠️ Slow (8-14d)</option>
                  <option value="critical">🚨 Critical (14d+)</option>
                  <option value="pending">📋 Still Pending</option>
                </select>
                <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visible.length} records</span>
              </div>
 
              {/* Table */}
              <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 80px 100px 100px 85px 85px 80px', padding:'9px 16px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                  {[
                    {col:'patient_name',label:'Patient'},
                    {col:'payer',label:'Payer'},
                    {col:'region',label:'Rgn'},
                    {col:'assigned_to',label:'Coordinator'},
                    {col:'date_submitted',label:'Submitted'},
                    {col:'auth_from',label:'Approved'},
                    {col:'tat',label:'TAT'},
                    {col:'auth_status',label:'Status'},
                  ].map(h=>(
                    <div key={h.col} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>
                      <SortBtn col={h.col} label={h.label} />
                    </div>
                  ))}
                </div>
 
                {visible.length === 0 ? (
                  <div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No records match these filters</div>
                ) : (
                  visible.slice(0,200).map(r => {
                    const payCol = PAYER_COLORS[r.payer] || B.gray;
                    const isOverdue = r.daysOpen > 14;
                    const isDenied  = r.outcome === 'denied';
                    return (
                      <div key={r.id} style={{ display:'grid', gridTemplateColumns:'1fr 100px 80px 100px 100px 85px 85px 80px', padding:'8px 16px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:isOverdue?'#FFF8F8':isDenied?'#FFFBEB':'transparent' }}>
                        <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:8 }}>{r.patient_name}</div>
                        <div style={{ fontSize:11, fontWeight:600, color:payCol, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.payer||'—'}</div>
                        <div style={{ fontSize:11, color:B.gray }}>{r.region||'—'}</div>
                        <div style={{ fontSize:10, color:B.gray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.assigned_to?.split(' ')[0]||'—'}</div>
                        <div style={{ fontSize:11, color:B.black }}>{fmtDate(r.date_submitted)}</div>
                        <div style={{ fontSize:11, color:r.auth_from?B.green:r.daysOpen>14?B.danger:B.lightGray }}>{fmtDate(r.auth_from)}</div>
                        <div>
                          {r.tat !== null ? <TATBadge days={r.tat} /> :
                           r.daysOpen !== null ? <span style={{ fontSize:10, fontWeight:700, color:r.daysOpen>14?B.danger:B.orange }}>⏳ {r.daysOpen}d open</span> :
                           <span style={{ color:B.lightGray, fontSize:10 }}>—</span>}
                        </div>
                        <div>
                          {r.auth_status && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:10,
                              background:r.auth_status==='denied'?'#FFFBEB':r.auth_status==='active'||r.auth_status==='approved'?'#F0FDF4':'#EFF6FF',
                              color:r.auth_status==='denied'?B.orange:r.auth_status==='active'||r.auth_status==='approved'?B.green:B.blue,
                              border:`1px solid ${r.auth_status==='denied'?'#FDE68A':r.auth_status==='active'||r.auth_status==='approved'?'#BBF7D0':'#BFDBFE'}` }}>
                              {r.auth_status}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                {visible.length > 200 && (
                  <div style={{ padding:'10px', textAlign:'center', fontSize:11, color:B.lightGray, borderTop:`1px solid ${B.border}` }}>
                    Showing 200 of {visible.length} — use filters to narrow
                  </div>
                )}
              </div>
            </>
          )}
 
          {/* By Payer */}
          {activeTab==='payer' && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 80px 80px 100px', padding:'10px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Payer','Auths','Avg TAT','Approved','Denied','Denial Rate'].map(h=>(
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                ))}
              </div>
              {byPayer.length === 0 ? (
                <div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No payer data with turnaround times yet</div>
              ) : byPayer.map(p => {
                const pc = PAYER_COLORS[p.payer] || B.gray;
                const tatColor = p.avgTAT <= 5 ? B.green : p.avgTAT <= 10 ? B.yellow : B.danger;
                return (
                  <div key={p.payer} style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 80px 80px 100px', padding:'12px 18px', borderBottom:'1px solid #FAF4F2', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:pc, flexShrink:0 }} />
                      <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{p.payer}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:B.black, fontFamily:'monospace' }}>{p.count}</div>
                    <div><TATBadge days={p.avgTAT} /></div>
                    <div style={{ fontSize:13, color:B.green, fontWeight:600 }}>{p.approved}</div>
                    <div style={{ fontSize:13, color:p.denied>0?B.danger:B.lightGray, fontWeight:p.denied>0?700:400 }}>{p.denied}</div>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1, height:6, background:'rgba(0,0,0,0.08)', borderRadius:3 }}>
                          <div style={{ height:'100%', width:`${p.denialRate}%`, background:p.denialRate>20?B.danger:p.denialRate>10?B.yellow:B.green, borderRadius:3 }} />
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:p.denialRate>20?B.danger:p.denialRate>10?B.yellow:B.green, minWidth:32 }}>{p.denialRate}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {byPayer.length > 0 && (
                <div style={{ padding:'12px 18px', background:'#FBF7F6', borderTop:`1px solid ${B.border}`, display:'grid', gridTemplateColumns:'1fr 80px 100px 80px 80px 100px', alignItems:'center' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:B.gray }}>TOTAL / AVERAGE</div>
                  <div style={{ fontSize:13, fontWeight:800, color:B.black, fontFamily:'monospace' }}>{byPayer.reduce((s,p)=>s+p.count,0)}</div>
                  <div><TATBadge days={Math.round(byPayer.reduce((s,p)=>s+p.avgTAT*p.count,0)/byPayer.reduce((s,p)=>s+p.count,0))} /></div>
                  <div style={{ fontSize:13, color:B.green, fontWeight:700 }}>{byPayer.reduce((s,p)=>s+p.approved,0)}</div>
                  <div style={{ fontSize:13, color:B.danger, fontWeight:700 }}>{byPayer.reduce((s,p)=>s+p.denied,0)}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:B.gray }}>
                    {Math.round(byPayer.reduce((s,p)=>s+p.denied,0)/byPayer.reduce((s,p)=>s+p.count,0)*100)}% overall
                  </div>
                </div>
              )}
            </div>
          )}
 
          {/* By Coordinator */}
          {activeTab==='coordinator' && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 80px 80px', padding:'10px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Coordinator','Auths','Avg TAT','Denied','Pending 14d+'].map(h=>(
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                ))}
              </div>
              {byCoordinator.length === 0 ? (
                <div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No coordinator data yet</div>
              ) : byCoordinator.map(c => {
                const tatColor = c.avgTAT <= 5 ? B.green : c.avgTAT <= 10 ? B.yellow : B.danger;
                return (
                  <div key={c.name} style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 80px 80px', padding:'12px 18px', borderBottom:'1px solid #FAF4F2', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg,${B.red},${B.darkRed})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{c.name}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:B.black, fontFamily:'monospace' }}>{c.count}</div>
                    <div><TATBadge days={c.avgTAT} /></div>
                    <div style={{ fontSize:13, color:c.denied>0?B.danger:B.lightGray, fontWeight:c.denied>0?700:400 }}>{c.denied||0}</div>
                    <div style={{ fontSize:13, color:c.overdue>0?B.danger:B.lightGray, fontWeight:c.overdue>0?700:400 }}>{c.overdue||0}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
 

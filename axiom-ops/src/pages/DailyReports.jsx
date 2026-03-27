import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626',
  blue:'#1D4ED8',
};
 
function today() { return new Date().toISOString().split('T')[0]; }
 
function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
 
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}
 
// ── Submission Form (coordinator view) ───────────────────────
function ReportForm({ profile, reportType, existingReport, onSaved }) {
  const coordinatorId = profile?.id;
  const coordinatorName = profile?.full_name || profile?.name || '';
 
  const blank = {
    visits_completed: '', visits_scheduled: '', visits_missed: '',
    active_patients: '', auths_pending: '', auths_expiring_7d: '',
    new_referrals: '', tasks_open: '', notes: '',
  };
 
  const [form, setForm] = useState(() => existingReport ? {
    visits_completed:  existingReport.visits_completed ?? '',
    visits_scheduled:  existingReport.visits_scheduled ?? '',
    visits_missed:     existingReport.visits_missed ?? '',
    active_patients:   existingReport.active_patients ?? '',
    auths_pending:     existingReport.auths_pending ?? '',
    auths_expiring_7d: existingReport.auths_expiring_7d ?? '',
    new_referrals:     existingReport.new_referrals ?? '',
    tasks_open:        existingReport.tasks_open ?? '',
    notes:             existingReport.notes ?? '',
  } : blank);
 
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));
  const num = v => v===''?null:(parseInt(v)||0);
 
  const save = async () => {
    setSaving(true);
    const payload = {
      coordinator_id:   coordinatorId,
      coordinator_name: coordinatorName,
      report_date:      today(),
      report_type:      reportType,
      visits_completed:  num(form.visits_completed),
      visits_scheduled:  num(form.visits_scheduled),
      visits_missed:     num(form.visits_missed),
      active_patients:   num(form.active_patients),
      auths_pending:     num(form.auths_pending),
      auths_expiring_7d: num(form.auths_expiring_7d),
      new_referrals:     num(form.new_referrals),
      tasks_open:        num(form.tasks_open),
      notes:             form.notes.trim() || null,
      updated_at:        new Date().toISOString(),
    };
    if (existingReport?.id) {
      await supabase.from('daily_reports').update(payload).eq('id', existingReport.id);
    } else {
      await supabase.from('daily_reports').insert({ ...payload, created_at: new Date().toISOString() });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved();
  };
 
  const isMorning = reportType === 'morning';
  const deadline  = isMorning ? '9:00 AM' : '5:00 PM';
  const icon      = isMorning ? '🌅' : '🌙';
 
  const FIELDS = isMorning ? [
    { key:'visits_scheduled',  label:'Visits Scheduled Today',    icon:'📅', hint:'Total visits on your schedule' },
    { key:'active_patients',   label:'Active Patient Census',     icon:'👥', hint:'Total active patients on your caseload' },
    { key:'auths_pending',     label:'Auths Pending',             icon:'🔒', hint:'Authorizations awaiting approval' },
    { key:'auths_expiring_7d', label:'Auths Expiring ≤7 Days',   icon:'⏰', hint:'Auths that expire within a week' },
    { key:'new_referrals',     label:'New Referrals Received',    icon:'📋', hint:'New referrals since yesterday' },
    { key:'tasks_open',        label:'Open Tasks',                icon:'📌', hint:'Total action items currently open' },
  ] : [
    { key:'visits_completed',  label:'Visits Completed Today',   icon:'✅', hint:'Completed visits for today' },
    { key:'visits_missed',     label:'Visits Missed / No-Show',  icon:'❌', hint:'Cancellations, no-shows, missed' },
    { key:'active_patients',   label:'Active Patient Census',    icon:'👥', hint:'Current active caseload count' },
    { key:'auths_pending',     label:'Auths Pending',            icon:'🔒', hint:'Outstanding authorization requests' },
    { key:'new_referrals',     label:'New Referrals Today',      icon:'📋', hint:'New patient referrals received' },
    { key:'tasks_open',        label:'Open Tasks',               icon:'📌', hint:'Open action items at end of day' },
  ];
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${B.darkRed},${B.red},${B.orange})`, borderRadius:16, padding:'20px 24px', marginBottom:20, position:'relative', overflow:'hidden', boxShadow:'0 4px 16px rgba(139,26,16,0.2)' }}>
        <div style={{ position:'absolute', inset:0, opacity:0.05, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
        <div style={{ position:'relative', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:4 }}>Daily Report</div>
            <div style={{ fontSize:20, fontWeight:800, color:'#fff' }}>{icon} {isMorning?'Morning':'End-of-Day'} Report</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', marginTop:4 }}>
              {fmtDate(today())} · Due by {deadline} · {coordinatorName}
            </div>
          </div>
          {existingReport && (
            <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'8px 14px', textAlign:'center' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', marginBottom:2 }}>Submitted</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{fmtTime(existingReport.created_at)}</div>
            </div>
          )}
        </div>
      </div>
 
      {/* Fields */}
      <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'22px 24px', marginBottom:16 }}>
        <div style={{ fontSize:13, fontWeight:700, color:B.black, marginBottom:16 }}>
          {isMorning ? '📊 Start-of-Day Numbers' : '📊 End-of-Day Numbers'}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:14 }}>
          {FIELDS.map(f => (
            <div key={f.key}>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>
                {f.icon} {f.label}
              </label>
              <input
                type="number" min="0"
                value={form[f.key]}
                onChange={e=>setF(f.key,e.target.value)}
                placeholder="0"
                style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${form[f.key]!==''?B.red:B.border}`, borderRadius:9, fontSize:16, fontFamily:"'DM Mono',monospace", fontWeight:700, color:B.red, outline:'none', boxSizing:'border-box', background:'#FDFAF9', textAlign:'center' }}
              />
              <div style={{ fontSize:10, color:B.lightGray, marginTop:3 }}>{f.hint}</div>
            </div>
          ))}
        </div>
      </div>
 
      {/* Notes */}
      <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px', marginBottom:16 }}>
        <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
          📝 Notes / Blockers / Flags
        </label>
        <textarea
          value={form.notes}
          onChange={e=>setF('notes',e.target.value)}
          rows={3}
          placeholder={isMorning ? "Any issues starting the day? Patients requiring immediate attention?" : "How did the day go? Any blockers, patient concerns, or escalations needed?"}
          style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${B.border}`, borderRadius:9, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }}
        />
      </div>
 
      {/* Submit */}
      <button onClick={save} disabled={saving}
        style={{ width:'100%', background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:12, color:'#fff', padding:'14px', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'inherit', opacity:saving?0.7:1, boxShadow:'0 4px 12px rgba(139,26,16,0.25)' }}>
        {saving ? 'Submitting...' : saved ? '✅ Report Saved!' : existingReport ? '✏️ Update Report' : `Submit ${isMorning?'Morning':'EOD'} Report`}
      </button>
 
      {saved && (
        <div style={{ marginTop:12, background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'12px 16px', textAlign:'center', fontSize:13, fontWeight:700, color:B.green }}>
          ✅ Report submitted successfully at {new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
        </div>
      )}
    </div>
  );
}
 
// ── Director History View ─────────────────────────────────────
function DirectorView({ coordinators }) {
  const [reports, setReports]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [viewDate, setViewDate]         = useState(today());
  const [filterCoord, setFilterCoord]   = useState('all');
  const [filterType, setFilterType]     = useState('all');
  const [expandedId, setExpandedId]     = useState(null);
 
  const load = async () => {
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', viewDate)
      .order('created_at', { ascending: false });
    setReports(data || []);
    setLoading(false);
  };
 
  useEffect(() => { setLoading(true); load(); }, [viewDate]);
 
  useEffect(() => {
    const sub = supabase.channel('daily-reports-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'daily_reports'}, load)
      .subscribe();
    return () => sub.unsubscribe();
  }, [viewDate]);
 
  const visible = reports.filter(r => {
    if (filterCoord !== 'all' && r.coordinator_name !== filterCoord) return false;
    if (filterType !== 'all' && r.report_type !== filterType) return false;
    return true;
  });
 
  // Which coordinators submitted today
  const submitted = new Set(reports.map(r => r.coordinator_id));
  const missing   = coordinators.filter(c => !submitted.has(c.id) && c.role !== 'super_admin' && c.role !== 'director');
  const morning   = reports.filter(r => r.report_type === 'morning');
  const eod       = reports.filter(r => r.report_type === 'eod');
 
  const sum = (key, arr) => arr.reduce((s,r)=>s+(r[key]||0),0);
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:22, fontWeight:800, color:B.black, marginBottom:4 }}>📋 Daily Reports</div>
      <div style={{ fontSize:13, color:B.gray, marginBottom:20 }}>Morning and EOD submissions from your team.</div>
 
      {/* Summary KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Reports In',      value:`${reports.length}/${(coordinators.filter(c=>c.role!=='super_admin'&&c.role!=='director').length)*2}`, color:B.red, icon:'📋' },
          { label:'Missing Today',   value:missing.length, color:missing.length>0?B.danger:B.green, icon:'⚠️', alert:missing.length>0 },
          { label:'Visits Completed',value:sum('visits_completed',eod), color:B.green, icon:'✅' },
          { label:'Visits Scheduled',value:sum('visits_scheduled',morning), color:B.blue, icon:'📅' },
        ].map(k=>(
          <div key={k.label} style={{ background:k.alert?`${k.color}08`:B.card, border:`1.5px solid ${k.alert?k.color:B.border}`, borderRadius:12, padding:'14px 16px', boxShadow:k.alert?`0 2px 8px ${k.color}20`:'none' }}>
            <div style={{ fontSize:18, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:24, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:B.gray, marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
 
      {/* Missing alert */}
      {missing.length > 0 && (
        <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, padding:'12px 18px', marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:800, color:B.danger, marginBottom:4 }}>
            🚨 {missing.length} coordinator{missing.length!==1?'s':''} haven't submitted a report today
          </div>
          <div style={{ fontSize:12, color:B.danger, opacity:0.8 }}>
            {missing.map(c=>c.name).join(' · ')}
          </div>
        </div>
      )}
 
      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input type="date" value={viewDate} onChange={e=>setViewDate(e.target.value)}
          style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none' }} />
        <select value={filterCoord} onChange={e=>setFilterCoord(e.target.value)}
          style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
          <option value="all">All Coordinators</option>
          {[...new Set(reports.map(r=>r.coordinator_name).filter(Boolean))].sort().map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)}
          style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
          <option value="all">Both Report Types</option>
          <option value="morning">🌅 Morning Only</option>
          <option value="eod">🌙 EOD Only</option>
        </select>
        <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visible.length} reports</span>
      </div>
 
      {/* Report cards */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:B.lightGray }}>Loading reports...</div>
      ) : visible.length === 0 ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'40px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📭</div>
          <div style={{ fontSize:15, fontWeight:700, color:B.black, marginBottom:6 }}>No reports for {fmtDate(viewDate)}</div>
          <div style={{ fontSize:13, color:B.gray }}>Reports will appear here once coordinators submit them.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {visible.map(r => {
            const isMorning = r.report_type === 'morning';
            const isExpanded = expandedId === r.id;
            const completionRate = r.visits_scheduled>0 ? Math.round((r.visits_completed||0)/r.visits_scheduled*100) : null;
            return (
              <div key={r.id} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                {/* Card header */}
                <div onClick={()=>setExpandedId(isExpanded?null:r.id)}
                  style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', cursor:'pointer', background:isExpanded?'#FBF7F6':'transparent' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:`linear-gradient(135deg,${B.red},${B.darkRed})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:'#fff', flexShrink:0 }}>
                      {r.coordinator_name?.[0]?.toUpperCase()||'?'}
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{r.coordinator_name||'Unknown'}</div>
                      <div style={{ fontSize:11, color:B.gray, marginTop:1 }}>
                        <span style={{ background:isMorning?'#FFF7ED':'#EFF6FF', color:isMorning?B.orange:B.blue, padding:'1px 7px', borderRadius:8, fontWeight:600 }}>
                          {isMorning?'🌅 Morning':'🌙 EOD'}
                        </span>
                        <span style={{ marginLeft:8 }}>Submitted {fmtTime(r.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  {/* Quick stats */}
                  <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                    {isMorning ? (
                      <>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:18, fontWeight:800, color:B.black, fontFamily:"'DM Mono',monospace" }}>{r.visits_scheduled??'—'}</div>
                          <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase' }}>Scheduled</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:18, fontWeight:800, color:(r.auths_expiring_7d||0)>2?B.danger:B.yellow, fontFamily:"'DM Mono',monospace" }}>{r.auths_expiring_7d??'—'}</div>
                          <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase' }}>Auth ⚠️</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:18, fontWeight:800, color:B.red, fontFamily:"'DM Mono',monospace" }}>{r.active_patients??'—'}</div>
                          <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase' }}>Patients</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:18, fontWeight:800, color:B.green, fontFamily:"'DM Mono',monospace" }}>{r.visits_completed??'—'}</div>
                          <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase' }}>Done</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:18, fontWeight:800, color:(r.visits_missed||0)>2?B.danger:B.gray, fontFamily:"'DM Mono',monospace" }}>{r.visits_missed??'—'}</div>
                          <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase' }}>Missed</div>
                        </div>
                        {completionRate !== null && (
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:18, fontWeight:800, color:completionRate>=85?B.green:completionRate>=70?B.yellow:B.danger, fontFamily:"'DM Mono',monospace" }}>{completionRate}%</div>
                            <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase' }}>Rate</div>
                          </div>
                        )}
                      </>
                    )}
                    <span style={{ fontSize:11, color:B.lightGray }}>{isExpanded?'▲':'▼'}</span>
                  </div>
                </div>
 
                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ padding:'14px 18px', borderTop:`1px solid ${B.border}`, background:'#FDFAF9' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:r.notes?12:0 }}>
                      {[
                        {label:'Visits Scheduled',  val:r.visits_scheduled},
                        {label:'Visits Completed',  val:r.visits_completed},
                        {label:'Visits Missed',     val:r.visits_missed},
                        {label:'Active Patients',   val:r.active_patients},
                        {label:'Auths Pending',     val:r.auths_pending},
                        {label:'Auths Expiring ≤7d',val:r.auths_expiring_7d},
                        {label:'New Referrals',     val:r.new_referrals},
                        {label:'Open Tasks',        val:r.tasks_open},
                      ].map(f=>(
                        <div key={f.label} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:8, padding:'8px 12px', textAlign:'center' }}>
                          <div style={{ fontSize:18, fontWeight:800, color:B.black, fontFamily:"'DM Mono',monospace" }}>{f.val??'—'}</div>
                          <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase', marginTop:2 }}>{f.label}</div>
                        </div>
                      ))}
                    </div>
                    {r.notes && (
                      <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:8, padding:'10px 14px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:B.blue, textTransform:'uppercase', marginBottom:4 }}>Notes</div>
                        <div style={{ fontSize:12, color:B.black, lineHeight:1.5 }}>{r.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
 
// ── Root: role-aware ──────────────────────────────────────────
export default function DailyReports() {
  const { profile, isSuperAdmin, isDirector, isTeamLeader } = useAuth();
  const isLeader = isSuperAdmin || isDirector;
 
  const [coordinators, setCoordinators] = useState([]);
  const [myMorning, setMyMorning]       = useState(null);
  const [myEOD, setMyEOD]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('morning');
 
  const loadMyReports = async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('coordinator_id', profile.id)
      .eq('report_date', today());
    const m = data?.find(r=>r.report_type==='morning') || null;
    const e = data?.find(r=>r.report_type==='eod') || null;
    setMyMorning(m);
    setMyEOD(e);
  };
 
  useEffect(() => {
    const init = async () => {
      if (isLeader) {
        const { data } = await supabase.from('coordinators').select('*').order('name');
        setCoordinators(data || []);
      }
      await loadMyReports();
      setLoading(false);
    };
    init();
  }, [profile?.id]);
 
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>
      Loading daily reports...
    </div>
  );
 
  // Director / super admin — full history + coordinator view
  if (isLeader) {
    return (
      <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
        <DirectorView coordinators={coordinators} />
      </div>
    );
  }
 
  // Coordinator / team leader — submit form
  const hour = new Date().getHours();
  const defaultTab = hour < 13 ? 'morning' : 'eod';
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", maxWidth:640, margin:'0 auto' }}>
      {/* Tab picker */}
      <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${B.border}`, marginBottom:20 }}>
        {[
          { key:'morning', label:'🌅 Morning Report', done:!!myMorning },
          { key:'eod',     label:'🌙 End-of-Day Report', done:!!myEOD },
        ].map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            style={{ flex:1, background:'none', border:'none', borderBottom:`2px solid ${activeTab===t.key?B.red:'transparent'}`, color:activeTab===t.key?B.red:B.gray, padding:'12px', fontSize:13, fontWeight:activeTab===t.key?700:400, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            {t.label}
            {t.done && <span style={{ background:B.green, color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700 }}>✓</span>}
          </button>
        ))}
      </div>
 
      <ReportForm
        key={activeTab}
        profile={profile}
        reportType={activeTab}
        existingReport={activeTab==='morning'?myMorning:myEOD}
        onSaved={loadMyReports}
      />
    </div>
  );
}
 

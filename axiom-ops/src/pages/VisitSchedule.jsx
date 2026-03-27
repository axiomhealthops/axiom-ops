import { useState, useMemo } from 'react';
import { useOpsData } from '../hooks/useOpsData';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
const REGION_COLORS = ['#D94F2B','#1565C0','#059669','#7C3AED','#D97706','#0284C7','#DC2626','#E8763A','#0891B2','#65A30D'];
 
function statusMeta(status) {
  const s = (status||'').toLowerCase();
  if (s.startsWith('completed'))  return { color:B.green,   bg:'#F0FDF4', border:'#BBF7D0', label:'Completed'  };
  if (s.includes('missed') || s.includes('no show') || s.includes('cancel'))
                                  return { color:B.danger,  bg:'#FEF2F2', border:'#FECACA', label:'Missed'     };
  return                                 { color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE', label:'Scheduled'  };
}
 
function CompletionBar({ completed, scheduled, height=6 }) {
  const pct = scheduled > 0 ? Math.round(completed/scheduled*100) : 0;
  const color = pct >= 85 ? B.green : pct >= 70 ? B.yellow : B.danger;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height, background:'rgba(0,0,0,0.07)', borderRadius:height/2 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:height/2 }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, minWidth:34, textAlign:'right' }}>{pct}%</span>
    </div>
  );
}
 
export default function VisitSchedule() {
  const { visitSchedule, hasVisits, loading } = useOpsData();
 
  const [expandedRegion, setExpandedRegion]     = useState(null);
  const [expandedClinician, setExpandedClinician] = useState(null);
  const [filterStatus, setFilterStatus]         = useState('all');
  const [search, setSearch]                     = useState('');
 
  // Build region → clinician → patient structure
  const regionData = useMemo(() => {
    const map = {};
    visitSchedule.forEach(v => {
      const region = (v.region || 'Unknown').trim();
      const clinician = (v.coordinator || v.staff || 'Unknown Clinician').trim();
      const patient = (v.patient_name || '').trim();
      const status = (v.status || '').toLowerCase();
      const isCompleted = status.startsWith('completed');
      const isMissed    = status.includes('missed') || status.includes('no show') || status.includes('cancel');
 
      if (!map[region]) map[region] = { scheduled:0, completed:0, missed:0, clinicians:{} };
      map[region].scheduled++;
      if (isCompleted) map[region].completed++;
      if (isMissed)    map[region].missed++;
 
      if (!map[region].clinicians[clinician]) {
        map[region].clinicians[clinician] = { scheduled:0, completed:0, missed:0, patients:{} };
      }
      map[region].clinicians[clinician].scheduled++;
      if (isCompleted) map[region].clinicians[clinician].completed++;
      if (isMissed)    map[region].clinicians[clinician].missed++;
 
      if (patient) {
        if (!map[region].clinicians[clinician].patients[patient]) {
          map[region].clinicians[clinician].patients[patient] = { visits:[], status:'scheduled' };
        }
        map[region].clinicians[clinician].patients[patient].visits.push({
          date: v.visit_date, status: v.status, disc: v.disc,
        });
        if (isCompleted) map[region].clinicians[clinician].patients[patient].status = 'completed';
        if (isMissed)    map[region].clinicians[clinician].patients[patient].status = 'missed';
      }
    });
 
    // Convert to sorted arrays
    return Object.entries(map)
      .map(([region, data], i) => ({
        region,
        scheduled:  data.scheduled,
        completed:  data.completed,
        missed:     data.missed,
        color:      REGION_COLORS[i % REGION_COLORS.length],
        clinicians: Object.entries(data.clinicians)
          .map(([name, cd]) => ({
            name,
            scheduled:  cd.scheduled,
            completed:  cd.completed,
            missed:     cd.missed,
            patients:   Object.entries(cd.patients).map(([pname, pd]) => ({
              name:    pname,
              visits:  pd.visits,
              status:  pd.status,
              visitCount: pd.visits.length,
            })).sort((a,b) => {
              // Missed first
              if (a.status==='missed' && b.status!=='missed') return -1;
              if (a.status!=='missed' && b.status==='missed') return 1;
              return a.name.localeCompare(b.name);
            }),
          }))
          .sort((a,b) => b.missed - a.missed || b.scheduled - a.scheduled),
      }))
      .sort((a,b) => a.region.localeCompare(b.region));
  }, [visitSchedule]);
 
  // Totals
  const totals = useMemo(() => regionData.reduce(
    (s,r) => ({ scheduled:s.scheduled+r.scheduled, completed:s.completed+r.completed, missed:s.missed+r.missed }),
    { scheduled:0, completed:0, missed:0 }
  ), [regionData]);
 
  const toggleRegion = (region) => {
    setExpandedRegion(p => p===region ? null : region);
    setExpandedClinician(null);
  };
 
  const toggleClinician = (e, key) => {
    e.stopPropagation();
    setExpandedClinician(p => p===key ? null : key);
  };
 
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>
      Loading visit schedule...
    </div>
  );
 
  if (!hasVisits) return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", padding:'0 0 24px' }}>
      <div style={{ fontSize:22, fontWeight:800, color:B.black, marginBottom:4 }}>📅 Visit Schedule</div>
      <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center', marginTop:20 }}>
        <div style={{ fontSize:36, marginBottom:12 }}>📅</div>
        <div style={{ fontSize:16, fontWeight:700, color:B.black, marginBottom:8 }}>No visit data loaded</div>
        <div style={{ fontSize:13, color:B.gray }}>Upload your Pariox visit export in Data Uploads to see the schedule.</div>
      </div>
    </div>
  );
 
  const overallRate = totals.scheduled > 0 ? Math.round(totals.completed/totals.scheduled*100) : 0;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
 
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800, color:B.black, marginBottom:4 }}>📅 Visit Schedule</div>
        <div style={{ fontSize:13, color:B.gray }}>
          {regionData.length} regions · {totals.scheduled} visits scheduled · {totals.completed} completed · {totals.missed} missed
        </div>
      </div>
 
      {/* Summary banner */}
      <div style={{ background:`linear-gradient(135deg,${B.darkRed},${B.red},${B.orange})`, borderRadius:16, padding:'18px 24px', marginBottom:20, boxShadow:'0 4px 16px rgba(139,26,16,0.15)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:0.05, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
        <div style={{ position:'relative', display:'flex', gap:32, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>Weekly Visit Schedule</div>
            <div style={{ fontSize:42, fontWeight:800, color:'#fff', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{totals.scheduled}</div>
            <div style={{ marginTop:8, height:5, background:'rgba(255,255,255,0.2)', borderRadius:3 }}>
              <div style={{ height:'100%', width:`${overallRate}%`, background:'#fff', borderRadius:3 }} />
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:4 }}>{overallRate}% completion rate</div>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {[
              { label:'Completed', value:totals.completed, color:'#BBF7D0' },
              { label:'Missed',    value:totals.missed,    color:totals.missed>0?'#FCA5A5':'#BBF7D0' },
              { label:'Regions',   value:regionData.length, color:'#fff' },
            ].map((s,i) => (
              <div key={s.label} style={{ textAlign:'center', paddingLeft:i>0?20:0, borderLeft:i>0?'1px solid rgba(255,255,255,0.2)':'none' }}>
                <div style={{ fontSize:26, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
 
      {/* Region cards grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12, marginBottom:16 }}>
        {regionData.map(r => {
          const isOpen    = expandedRegion === r.region;
          const rate      = r.scheduled > 0 ? Math.round(r.completed/r.scheduled*100) : 0;
          const hasMissed = r.missed > 0;
          return (
            <div key={r.region} onClick={() => toggleRegion(r.region)}
              style={{ background:B.card, border:`1.5px solid ${isOpen?r.color:hasMissed?`${B.danger}40`:B.border}`, borderRadius:14, overflow:'hidden', cursor:'pointer', transition:'all 0.15s', boxShadow:isOpen?`0 4px 16px ${r.color}25`:hasMissed?`0 2px 8px ${B.danger}10`:'none', gridColumn: isOpen ? '1 / -1' : 'auto' }}>
 
              {/* Region header */}
              <div style={{ padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:r.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>
                    {r.region}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:B.black }}>Region {r.region}</div>
                    <div style={{ fontSize:11, color:B.gray, marginTop:1 }}>{r.clinicians.length} clinician{r.clinicians.length!==1?'s':''}</div>
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:20, fontWeight:800, color:B.black, fontFamily:"'DM Mono',monospace" }}>{r.scheduled}</div>
                  <div style={{ fontSize:10, color:B.lightGray }}>visits</div>
                </div>
              </div>
 
              {/* Completion bar */}
              <div style={{ padding:'0 16px 12px' }}>
                <CompletionBar completed={r.completed} scheduled={r.scheduled} />
                <div style={{ display:'flex', gap:12, marginTop:6 }}>
                  <span style={{ fontSize:10, color:B.green, fontWeight:600 }}>✅ {r.completed} done</span>
                  {r.missed > 0 && <span style={{ fontSize:10, color:B.danger, fontWeight:700 }}>❌ {r.missed} missed</span>}
                  <span style={{ fontSize:10, color:B.lightGray, marginLeft:'auto' }}>{isOpen?'▲ Close':'▼ View Clinicians'}</span>
                </div>
              </div>
 
              {/* Expanded: clinician breakdown */}
              {isOpen && (
                <div style={{ borderTop:`1px solid ${B.border}`, background:B.bg }}>
                  <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em' }}>
                    Clinicians — Region {r.region}
                  </div>
 
                  {r.clinicians.map(c => {
                    const clinKey = `${r.region}::${c.name}`;
                    const isClinicianOpen = expandedClinician === clinKey;
                    const cRate = c.scheduled > 0 ? Math.round(c.completed/c.scheduled*100) : 0;
                    const cColor = cRate >= 85 ? B.green : cRate >= 70 ? B.yellow : B.danger;
 
                    return (
                      <div key={c.name} style={{ margin:'0 12px 8px', background:B.card, border:`1px solid ${c.missed>0?`${B.danger}30`:B.border}`, borderRadius:10, overflow:'hidden' }}>
 
                        {/* Clinician row */}
                        <div onClick={e=>toggleClinician(e, clinKey)}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer' }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', background:`${r.color}20`, border:`1.5px solid ${r.color}50`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:r.color, flexShrink:0 }}>
                            {c.name[0]?.toUpperCase()||'?'}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
                            <div style={{ fontSize:10, color:B.gray, marginTop:1 }}>{c.patients.length} patient{c.patients.length!==1?'s':''} · {c.scheduled} visits</div>
                          </div>
                          <div style={{ display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
                            <div style={{ textAlign:'center' }}>
                              <div style={{ fontSize:14, fontWeight:800, color:B.green, fontFamily:'monospace' }}>{c.completed}</div>
                              <div style={{ fontSize:9, color:B.lightGray }}>done</div>
                            </div>
                            {c.missed > 0 && (
                              <div style={{ textAlign:'center' }}>
                                <div style={{ fontSize:14, fontWeight:800, color:B.danger, fontFamily:'monospace' }}>{c.missed}</div>
                                <div style={{ fontSize:9, color:B.lightGray }}>missed</div>
                              </div>
                            )}
                            <div style={{ width:50 }}>
                              <CompletionBar completed={c.completed} scheduled={c.scheduled} height={4} />
                            </div>
                            <span style={{ fontSize:10, color:B.lightGray }}>{isClinicianOpen?'▲':'▼'}</span>
                          </div>
                        </div>
 
                        {/* Patient list */}
                        {isClinicianOpen && (
                          <div style={{ borderTop:`1px solid ${B.border}`, background:'#FDFAF9' }}>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 80px 70px', padding:'6px 14px', background:'#F5F0EE', borderBottom:`1px solid ${B.border}` }}>
                              {['Patient','Visits','Status','Disc'].map(h=>(
                                <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                              ))}
                            </div>
                            {c.patients.map(p => {
                              const sm = statusMeta(p.status === 'completed' ? 'completed' : p.status === 'missed' ? 'missed' : 'scheduled');
                              const disc = [...new Set(p.visits.map(v=>v.disc).filter(Boolean))].join(', ');
                              return (
                                <div key={p.name} style={{ display:'grid', gridTemplateColumns:'1fr 60px 80px 70px', padding:'7px 14px', borderBottom:'1px solid #F0EDE9', alignItems:'center' }}>
                                  <div style={{ fontSize:12, fontWeight:500, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                                  <div style={{ fontSize:12, fontWeight:700, color:B.black, fontFamily:'monospace', textAlign:'center' }}>{p.visitCount}</div>
                                  <div>
                                    <span style={{ fontSize:9, fontWeight:700, color:sm.color, background:sm.bg, border:`1px solid ${sm.border}`, borderRadius:10, padding:'2px 6px', whiteSpace:'nowrap' }}>
                                      {sm.label}
                                    </span>
                                  </div>
                                  <div style={{ fontSize:10, color:B.gray }}>{disc||'—'}</div>
                                </div>
                              );
                            })}
                            {c.patients.length === 0 && (
                              <div style={{ padding:'12px 14px', fontSize:12, color:B.lightGray }}>No patient data available</div>
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
        })}
      </div>
 
      {regionData.length === 0 && (
        <div style={{ textAlign:'center', padding:'40px', color:B.lightGray, fontSize:13 }}>No region data available in current Pariox export</div>
      )}
    </div>
  );
}
 

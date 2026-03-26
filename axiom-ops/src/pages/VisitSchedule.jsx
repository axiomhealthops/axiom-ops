import { useState, useMemo } from 'react';
import { useOpsData } from '../hooks/useOpsData';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#FBF7F6', card:'#fff',
  green:'#2E7D32', yellow:'#D97706', danger:'#DC2626', blue:'#1565C0',
};

export default function VisitSchedule() {
  const { visitSchedule, hasVisits, loading } = useOpsData();
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('table');

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>
      Loading visit schedule...
    </div>
  );

  // Derive summary stats from Supabase rows
  const totalScheduled = visitSchedule.length;
  const totalCompleted = visitSchedule.filter(v => (v.status||'').toLowerCase().startsWith('completed')).length;
  const totalMissed    = visitSchedule.filter(v => { const s=(v.status||'').toLowerCase(); return s.includes('missed')||s.includes('cancel')||s.includes('no show'); }).length;
  const completionPct  = totalScheduled > 0 ? Math.round(totalCompleted/totalScheduled*100) : 0;

  // Build region data from rows
  const regionData = useMemo(() => {
    const map = {};
    visitSchedule.forEach(v => {
      const r = v.region || 'Unknown';
      if (!map[r]) map[r] = { scheduled:0, completed:0, clinicians:new Set(), patients:new Set(), clinicianMap:{} };
      map[r].scheduled++;
      if ((v.status||'').toLowerCase().startsWith('completed')) map[r].completed++;
      if (v.coordinator) {
        map[r].clinicians.add(v.coordinator);
        if (!map[r].clinicianMap[v.coordinator]) map[r].clinicianMap[v.coordinator] = { scheduled:0, completed:0 };
        map[r].clinicianMap[v.coordinator].scheduled++;
        if ((v.status||'').toLowerCase().startsWith('completed')) map[r].clinicianMap[v.coordinator].completed++;
      }
      if (v.patient_name) map[r].patients.add(v.patient_name);
    });
    const result = {};
    for (const [region, data] of Object.entries(map)) {
      result[region] = {
        scheduled: data.scheduled,
        completed: data.completed,
        clinicians: data.clinicians.size,
        patients: data.patients.size,
        clinicianList: Object.entries(data.clinicianMap).map(([name,d]) => ({ name, scheduled:d.scheduled, completed:d.completed })),
      };
    }
    return result;
  }, [visitSchedule]);

  const regions = Object.keys(regionData).sort();

  // Daily trend from rows
  const dailyTrend = useMemo(() => {
    const map = {};
    visitSchedule.forEach(v => {
      if (!v.visit_date) return;
      const day = v.visit_date.slice(0,10);
      if (!map[day]) map[day] = { scheduled:0, completed:0 };
      map[day].scheduled++;
      if ((v.status||'').toLowerCase().startsWith('completed')) map[day].completed++;
    });
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).slice(-7).map(([date,data]) => ({
      day: new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'}),
      visits: data.completed,
      scheduled: data.scheduled,
    }));
  }, [visitSchedule]);

  // Filtered visit rows
  const filteredVisits = visitSchedule
    .filter(v => filterRegion === 'all' || v.region === filterRegion)
    .filter(v => {
      if (filterStatus === 'all') return true;
      const s = (v.status||'').toLowerCase();
      if (filterStatus === 'completed') return s.startsWith('completed');
      if (filterStatus === 'missed') return s.includes('missed')||s.includes('cancel')||s.includes('no show');
      if (filterStatus === 'scheduled') return s.includes('scheduled');
      return true;
    })
    .filter(v => !search || (v.patient_name||'').toLowerCase().includes(search.toLowerCase()) || (v.coordinator||'').toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>📅 Visit Schedule</h1>
          <p style={{ fontSize:13, color:B.gray, margin:0 }}>
            {hasVisits ? `${totalScheduled} visits · Live data — updates when director uploads` : 'No visit schedule loaded'}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {['table','clinician','region'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding:'7px 14px', borderRadius:8, border:`1px solid ${view===v?B.red:B.border}`,
              background:view===v?'#FFF5F2':'transparent', color:view===v?B.red:B.gray,
              fontSize:12, fontWeight:view===v?700:400, cursor:'pointer', fontFamily:'inherit',
            }}>{v==='table'?'📋 Schedule':v==='clinician'?'👤 By Clinician':'🗺️ By Region'}</button>
          ))}
        </div>
      </div>

      {!hasVisits ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📅</div>
          <div style={{ fontSize:16, fontWeight:700, color:B.black, marginBottom:8 }}>No visit schedule loaded</div>
          <div style={{ fontSize:13, color:B.gray }}>Your director will upload the Pariox visit schedule — it will appear here automatically</div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:24 }}>
            {[
              { label:'Scheduled', value:totalScheduled, color:B.blue, bg:'#EFF6FF', border:'#BFDBFE' },
              { label:'Completed', value:totalCompleted, color:B.green, bg:'#F0FDF4', border:'#BBF7D0' },
              { label:'Remaining', value:Math.max(0,totalScheduled-totalCompleted), color:B.orange, bg:'#FFF7ED', border:'#FED7AA' },
              { label:'Missed', value:totalMissed, color:B.danger, bg:'#FEF2F2', border:'#FECACA' },
              { label:'Completion %', value:`${completionPct}%`, color:completionPct>=90?B.green:completionPct>=70?B.yellow:B.danger, bg:'#F9FAFB', border:'#E5E7EB' },
            ].map(m => (
              <div key={m.label} style={{ background:m.bg, border:`1px solid ${m.border}`, borderRadius:12, padding:'16px', textAlign:'center' }}>
                <div style={{ fontSize:28, fontWeight:800, color:m.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{m.value}</div>
                <div style={{ fontSize:10, color:m.color, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:6 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Daily trend */}
          {dailyTrend.length > 0 && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'20px 24px', marginBottom:20, boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:16 }}>Daily Breakdown</div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:100 }}>
                {dailyTrend.map((d,i) => {
                  const maxVal=Math.max(...dailyTrend.map(x=>x.scheduled||0),1);
                  const schedH=Math.round((d.scheduled||0)/maxVal*90);
                  const compH=Math.round((d.visits||0)/maxVal*90);
                  return (
                    <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{ fontSize:10, color:B.lightGray }}>{d.visits||0}/{d.scheduled||0}</div>
                      <div style={{ width:'100%', position:'relative', height:90, display:'flex', alignItems:'flex-end', justifyContent:'center', gap:2 }}>
                        <div style={{ width:'45%', height:schedH, background:'#F5EDEB', borderRadius:'3px 3px 0 0', minHeight:2 }} />
                        <div style={{ width:'45%', height:compH, background:`linear-gradient(180deg,${B.red},${B.darkRed})`, borderRadius:'3px 3px 0 0', minHeight:2 }} />
                      </div>
                      <div style={{ fontSize:9, color:B.lightGray, textAlign:'center', lineHeight:1.3 }}>{d.day}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display:'flex', gap:16, marginTop:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}><div style={{ width:12, height:12, background:'#F5EDEB', borderRadius:2 }} /><span style={{ fontSize:11, color:B.lightGray }}>Scheduled</span></div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}><div style={{ width:12, height:12, background:B.red, borderRadius:2 }} /><span style={{ fontSize:11, color:B.lightGray }}>Completed</span></div>
              </div>
            </div>
          )}

          {/* Region filter */}
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:11, color:B.lightGray }}>Region:</span>
            {['all',...regions].map(r => (
              <button key={r} onClick={() => setFilterRegion(r)} style={{
                padding:'5px 10px', borderRadius:6, border:`1px solid ${filterRegion===r?B.red:B.border}`,
                background:filterRegion===r?'#FFF5F2':'transparent', color:filterRegion===r?B.red:B.gray,
                fontSize:11, fontWeight:filterRegion===r?700:400, cursor:'pointer', fontFamily:'inherit',
              }}>{r==='all'?'All':r}</button>
            ))}
          </div>

          {/* By Region */}
          {view==='region' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
              {Object.entries(regionData).filter(([r])=>filterRegion==='all'||r===filterRegion).sort(([,a],[,b])=>b.scheduled-a.scheduled).map(([region,data]) => {
                const compPct=data.scheduled>0?Math.round(data.completed/data.scheduled*100):0;
                const color=compPct>=90?B.green:compPct>=70?B.yellow:B.danger;
                return (
                  <div key={region} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ fontSize:18, fontWeight:800, color:B.red, fontFamily:"'DM Mono',monospace" }}>Region {region}</div>
                      <div style={{ fontSize:22, fontWeight:800, color, fontFamily:"'DM Mono',monospace" }}>{compPct}%</div>
                    </div>
                    <div style={{ height:4, background:'#F5EDEB', borderRadius:2, marginBottom:12 }}><div style={{ height:'100%', width:`${compPct}%`, background:color, borderRadius:2 }} /></div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, fontSize:12 }}>
                      {[{label:'Scheduled',value:data.scheduled,color:B.blue},{label:'Completed',value:data.completed,color:B.green},{label:'Clinicians',value:data.clinicians,color:B.gray}].map(m=>(
                        <div key={m.label} style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color:m.color, fontFamily:'monospace' }}>{m.value}</div>
                          <div style={{ color:B.lightGray, fontSize:10 }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* By Clinician */}
          {view==='clinician' && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'200px 80px 100px 100px 1fr', padding:'9px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Clinician','Region','Scheduled','Completed','Completion'].map(h=>(
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
                ))}
              </div>
              {(() => {
                const clinMap = {};
                visitSchedule.filter(v=>filterRegion==='all'||v.region===filterRegion).forEach(v => {
                  const name = v.coordinator || 'Unknown';
                  if (!clinMap[name]) clinMap[name] = { scheduled:0, completed:0, region:v.region };
                  clinMap[name].scheduled++;
                  if ((v.status||'').toLowerCase().startsWith('completed')) clinMap[name].completed++;
                });
                return Object.entries(clinMap).sort(([,a],[,b])=>b.scheduled-a.scheduled).map(([name,s]) => {
                  const pct=s.scheduled>0?Math.round(s.completed/s.scheduled*100):0;
                  const color=pct>=90?B.green:pct>=50?B.yellow:B.danger;
                  return (
                    <div key={name} style={{ display:'grid', gridTemplateColumns:'200px 80px 100px 100px 1fr', padding:'10px 18px', borderBottom:`1px solid #FAF4F2`, alignItems:'center' }}>
                      <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{name}</div>
                      <div style={{ fontSize:11, color:B.gray }}>{s.region}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:B.blue, fontFamily:'monospace' }}>{s.scheduled}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:B.green, fontFamily:'monospace' }}>{s.completed}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1, height:6, background:'#F5EDEB', borderRadius:3, maxWidth:120 }}><div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3 }} /></div>
                        <span style={{ fontSize:12, fontWeight:700, color, minWidth:35 }}>{pct}%</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Table */}
          {view==='table' && (
            <>
              <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient or clinician..."
                  style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:220 }} />
                <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
                  style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="missed">Missed</option>
                </select>
                <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{filteredVisits.length} visits</span>
              </div>
              <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'220px 100px 80px 150px 1fr', padding:'9px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                  {['Patient','Date','Region','Clinician','Status'].map(h=>(
                    <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
                  ))}
                </div>
                {filteredVisits.slice(0,100).map((v,i) => {
                  const s=(v.status||'').toLowerCase();
                  const isComplete=s.startsWith('completed');
                  const isMissed=s.includes('missed')||s.includes('cancel');
                  const statusColor=isComplete?B.green:isMissed?B.danger:B.blue;
                  const statusBg=isComplete?'#F0FDF4':isMissed?'#FEF2F2':'#EFF6FF';
                  const statusBorder=isComplete?'#BBF7D0':isMissed?'#FECACA':'#BFDBFE';
                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'220px 100px 80px 150px 1fr', padding:'9px 18px', borderBottom:`1px solid #FAF4F2`, alignItems:'center' }}>
                      <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{v.patient_name||'—'}</div>
                      <div style={{ fontSize:11, color:B.gray }}>{v.visit_date?new Date(v.visit_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'}</div>
                      <div style={{ fontSize:11, color:B.gray }}>{v.region||'—'}</div>
                      <div style={{ fontSize:11, color:B.gray }}>{v.coordinator||'—'}</div>
                      <span style={{ background:statusBg, color:statusColor, border:`1px solid ${statusBorder}`, borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{v.status||'—'}</span>
                    </div>
                  );
                })}
                {filteredVisits.length>100&&<div style={{ padding:'12px 18px', fontSize:12, color:B.lightGray, textAlign:'center', borderTop:`1px solid ${B.border}` }}>Showing 100 of {filteredVisits.length} — use filters to narrow</div>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#FBF7F6', card:'#fff',
  green:'#2E7D32', yellow:'#D97706', danger:'#DC2626', blue:'#1565C0',
};

function statusColor(s) {
  const lower = (s||'').toLowerCase();
  if (lower.startsWith('completed')) return { color:B.green, bg:'#F0FDF4', border:'#BBF7D0' };
  if (lower.includes('active')) return { color:B.blue, bg:'#EFF6FF', border:'#BFDBFE' };
  if (lower.includes('missed')||lower.includes('cancel')) return { color:B.danger, bg:'#FEF2F2', border:'#FECACA' };
  return { color:B.gray, bg:'#F9FAFB', border:'#E5E7EB' };
}

export default function VisitSchedule({ csvData, hasPariox }) {
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDisc, setFilterDisc] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('asc');
  const [view, setView] = useState('table'); // 'table' | 'clinician' | 'region'

  // Parse raw visits from csvData — we stored regionData but need raw rows
  // Use staffStats + regionData to derive the data we need
  const rawVisits = useMemo(() => {
    if (!hasPariox || !csvData?.regionData) return [];
    const visits = [];
    Object.entries(csvData.regionData).forEach(([region, data]) => {
      (data.clinicianList||[]).forEach(clinician => {
        for (let i = 0; i < clinician.scheduled; i++) {
          visits.push({
            patient: `Patient (${region})`,
            region,
            staff: clinician.name,
            scheduled: clinician.scheduled,
            completed: clinician.completed,
            patients: clinician.patients,
          });
        }
      });
    });
    return visits;
  }, [csvData, hasPariox]);

  // Regions and dates for filters
  const regions = hasPariox ? Object.keys(csvData?.regionData||{}).sort() : [];
  const dates = ['Mon Mar 23','Tue Mar 24','Wed Mar 25','Thu Mar 26','Fri Mar 27','Sat Mar 28'];

  // Summary stats
  const totalScheduled = csvData?.dedupedCount || 0;
  const totalCompleted = csvData?.completedVisits || 0;
  const totalMissed = csvData?.missedVisits || 0;
  const completionPct = totalScheduled > 0 ? Math.round(totalCompleted/totalScheduled*100) : 0;

  // Daily breakdown from dailyTrend
  const dailyTrend = csvData?.dailyTrend || [];

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>📅 Visit Schedule</h1>
          <p style={{ fontSize:13, color:B.gray, margin:0 }}>
            Week of Mar 23–28 · {hasPariox ? `${csvData?.rowCount||0} records from Pariox` : 'No Pariox data loaded'}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {['table','clinician','region'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding:'7px 14px', borderRadius:8, border:`1px solid ${view===v ? B.red : B.border}`,
              background: view===v ? '#FFF5F2' : 'transparent',
              color: view===v ? B.red : B.gray,
              fontSize:12, fontWeight: view===v ? 700 : 400, cursor:'pointer', fontFamily:'inherit',
            }}>{v === 'table' ? '📋 Schedule' : v === 'clinician' ? '👤 By Clinician' : '🗺️ By Region'}</button>
          ))}
        </div>
      </div>

      {!hasPariox ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📅</div>
          <div style={{ fontSize:16, fontWeight:700, color:B.black, marginBottom:8 }}>No visit schedule loaded</div>
          <div style={{ fontSize:13, color:B.gray }}>Go to <strong>Data Uploads</strong> and upload your weekly Pariox visit report</div>
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
                <div style={{ fontSize:28, fontWeight:800, color:m.color, fontFamily:"'DM Mono', monospace", lineHeight:1 }}>{m.value}</div>
                <div style={{ fontSize:10, color:m.color, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:6 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Daily breakdown chart */}
          {dailyTrend.length > 0 && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'20px 24px', marginBottom:20, boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:16 }}>Daily Breakdown</div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:100 }}>
                {dailyTrend.map((d, i) => {
                  const maxVal = Math.max(...dailyTrend.map(x => x.scheduled||0), 1);
                  const schedH = Math.round((d.scheduled||0)/maxVal*90);
                  const compH = Math.round((d.visits||0)/maxVal*90);
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
            {['all', ...regions].map(r => (
              <button key={r} onClick={() => setFilterRegion(r)} style={{
                padding:'5px 10px', borderRadius:6, border:`1px solid ${filterRegion===r ? B.red : B.border}`,
                background: filterRegion===r ? '#FFF5F2' : 'transparent',
                color: filterRegion===r ? B.red : B.gray,
                fontSize:11, fontWeight: filterRegion===r ? 700 : 400, cursor:'pointer', fontFamily:'inherit',
              }}>{r === 'all' ? 'All' : r}</button>
            ))}
          </div>

          {/* By Region view */}
          {view === 'region' && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
              {Object.entries(csvData.regionData||{})
                .filter(([r]) => filterRegion === 'all' || r === filterRegion)
                .sort(([,a],[,b]) => b.scheduled - a.scheduled)
                .map(([region, data]) => {
                  const compPct = data.scheduled > 0 ? Math.round(data.completed/data.scheduled*100) : 0;
                  const color = compPct >= 90 ? B.green : compPct >= 70 ? B.yellow : B.danger;
                  return (
                    <div key={region} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:B.red, fontFamily:"'DM Mono', monospace" }}>Region {region}</div>
                        <div style={{ fontSize:22, fontWeight:800, color, fontFamily:"'DM Mono', monospace" }}>{compPct}%</div>
                      </div>
                      <div style={{ height:4, background:'#F5EDEB', borderRadius:2, marginBottom:12 }}>
                        <div style={{ height:'100%', width:`${compPct}%`, background:color, borderRadius:2 }} />
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, fontSize:12 }}>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color:B.blue, fontFamily:'monospace' }}>{data.scheduled}</div>
                          <div style={{ color:B.lightGray, fontSize:10 }}>Scheduled</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color:B.green, fontFamily:'monospace' }}>{data.completed}</div>
                          <div style={{ color:B.lightGray, fontSize:10 }}>Completed</div>
                        </div>
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontWeight:700, color:B.gray, fontFamily:'monospace' }}>{data.clinicians}</div>
                          <div style={{ color:B.lightGray, fontSize:10 }}>Clinicians</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* By Clinician view */}
          {view === 'clinician' && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'200px 80px 100px 100px 80px 1fr', padding:'9px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Clinician','Region','Scheduled','Completed','Patients','Completion'].map(h => (
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
                ))}
              </div>
              {csvData.staffStats && Object.values(csvData.staffStats)
                .filter(s => filterRegion === 'all' || (s.regions||[]).includes(filterRegion))
                .sort((a,b) => b.totalVisits - a.totalVisits)
                .map((s, i) => {
                  const compPct = s.totalVisits > 0 ? Math.round((s.completedVisits||0)/s.totalVisits*100) : 0;
                  const color = compPct >= 90 ? B.green : compPct >= 50 ? B.yellow : B.danger;
                  return (
                    <div key={s.name} style={{ display:'grid', gridTemplateColumns:'200px 80px 100px 100px 80px 1fr', padding:'10px 18px', borderBottom:`1px solid #FAF4F2`, alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{s.name}</div>
                        <div style={{ fontSize:10, color:B.lightGray }}>{s.discipline}</div>
                      </div>
                      <div style={{ fontSize:11, color:B.gray }}>{Array.isArray(s.regions) ? s.regions.join(', ') : s.regions}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:B.blue, fontFamily:'monospace' }}>{s.totalVisits||0}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:B.green, fontFamily:'monospace' }}>{s.completedVisits||0}</div>
                      <div style={{ fontSize:12, color:B.gray }}>{s.uniquePatients||0}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1, height:6, background:'#F5EDEB', borderRadius:3, maxWidth:120 }}>
                          <div style={{ height:'100%', width:`${compPct}%`, background:color, borderRadius:3 }} />
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color, minWidth:35 }}>{compPct}%</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Schedule table view */}
          {view === 'table' && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ padding:'14px 18px', borderBottom:`1px solid ${B.border}`, display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient or clinician..."
                  style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:220 }} />
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
                  <option value="all">All Statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="missed">Missed</option>
                </select>
                <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>
                  Showing regional summary · {Object.keys(csvData.regionData||{}).length} regions · {totalScheduled} visits
                </span>
              </div>

              {/* Regional summary table */}
              <div style={{ display:'grid', gridTemplateColumns:'100px 1fr 100px 100px 100px 100px 100px', padding:'9px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Region','Clinicians','Scheduled','Completed','Patients','% Done','Trend'].map(h => (
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
                ))}
              </div>
              {Object.entries(csvData.regionData||{})
                .filter(([r]) => filterRegion === 'all' || r === filterRegion)
                .sort(([,a],[,b]) => b.scheduled - a.scheduled)
                .map(([region, data]) => {
                  const compPct = data.scheduled > 0 ? Math.round(data.completed/data.scheduled*100) : 0;
                  const color = compPct >= 90 ? B.green : compPct >= 50 ? B.yellow : B.danger;
                  return (
                    <div key={region} style={{ display:'grid', gridTemplateColumns:'100px 1fr 100px 100px 100px 100px 100px', padding:'12px 18px', borderBottom:`1px solid #FAF4F2`, alignItems:'center' }}>
                      <div style={{ fontSize:14, fontWeight:800, color:B.red, fontFamily:"'DM Mono', monospace" }}>Region {region}</div>
                      <div style={{ fontSize:11, color:B.gray, overflow:'hidden' }}>
                        {(data.clinicianList||[]).slice(0,3).map(c => c.name.split(',')[0]).join(', ')}
                        {(data.clinicianList||[]).length > 3 ? ` +${data.clinicianList.length-3}` : ''}
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:B.blue, fontFamily:'monospace' }}>{data.scheduled}</div>
                      <div style={{ fontSize:14, fontWeight:700, color:B.green, fontFamily:'monospace' }}>{data.completed}</div>
                      <div style={{ fontSize:14, color:B.gray, fontFamily:'monospace' }}>{data.patients}</div>
                      <div style={{ fontSize:14, fontWeight:700, color, fontFamily:'monospace' }}>{compPct}%</div>
                      <div style={{ height:6, background:'#F5EDEB', borderRadius:3 }}>
                        <div style={{ height:'100%', width:`${compPct}%`, background:color, borderRadius:3 }} />
                      </div>
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

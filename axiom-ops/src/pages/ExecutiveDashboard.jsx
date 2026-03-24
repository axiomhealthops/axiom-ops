import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#F0E4E0', bg:'#F8F5F4', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
  purple:'#7C3AED',
};

function KPICard({ icon, label, value, sub, color=B.red, trend, trendLabel }) {
  return (
    <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16,
      padding:'22px 24px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:color }} />
      <div style={{ fontSize:11, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize:36, fontWeight:800, color, fontFamily:"'DM Mono', monospace", lineHeight:1, marginBottom:6 }}>
        {value}
      </div>
      <div style={{ fontSize:12, color:B.gray }}>{sub}</div>
      {trend != null && (
        <div style={{ marginTop:8, fontSize:12, fontWeight:600,
          color: trend > 0 ? B.green : trend < 0 ? B.danger : B.gray }}>
          {trend > 0 ? '▲' : trend < 0 ? '▼' : '→'} {Math.abs(trend)} {trendLabel}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom:20, paddingBottom:12, borderBottom:`2px solid ${B.border}` }}>
      <div style={{ fontSize:16, fontWeight:800, color:B.black }}>{title}</div>
      {sub && <div style={{ fontSize:12, color:B.gray, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign:'right' }}>
      <div style={{ fontSize:14, fontWeight:700, color:B.red, fontFamily:"'DM Mono', monospace" }}>
        {time.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
      </div>
      <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        {time.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}
      </div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const { profile, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState('overview');

  // Load shared data from localStorage
  const [csvData]    = useState(() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} });
  const [censusData] = useState(() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} });
  const [snapshots]  = useState(() => { try { const s=localStorage.getItem('axiom_weekly_snapshots'); return s?JSON.parse(s):[]; } catch{return [];} });
  const [settings]   = useState(() => { try { const s=localStorage.getItem('axiom_settings'); return s?JSON.parse(s):null; } catch{return null;} });

  const hasPariox = !!(csvData?.scheduledVisits > 0);
  const hasCensus = !!(censusData?.counts);
  const CFG = settings || { visitTarget:800, revenueTarget:200000, avgReimbursement:90 };

  // Key metrics
  const activeCensus    = hasCensus ? censusData.activeCensus : null;
  const totalCensus     = hasCensus ? censusData.total : null;
  const onHold          = hasCensus ? (censusData.counts.on_hold||0)+(censusData.counts.on_hold_facility||0)+(censusData.counts.on_hold_pt||0)+(censusData.counts.on_hold_md||0) : null;
  const authPending     = hasCensus ? (censusData.counts.auth_pending||0)+(censusData.counts.active_auth_pending||0) : null;
  const socPending      = hasCensus ? (censusData.counts.soc_pending||0) : null;
  const scheduledVisits = hasPariox ? (csvData.dedupedCount || csvData.scheduledVisits || 0) : null;
  const completedVisits = hasPariox ? (csvData.completedVisits || 0) : null;
  const estWeeklyRev    = scheduledVisits != null ? scheduledVisits * CFG.avgReimbursement : null;
  const visitGap        = scheduledVisits != null ? CFG.visitTarget - scheduledVisits : null;
  const visitPct        = scheduledVisits != null ? Math.round(scheduledVisits/CFG.visitTarget*100) : null;

  // Payer mix from census
  const payerMix = hasCensus ? censusData.patients.reduce((acc, p) => {
    const r = (p.ref||'').toUpperCase();
    let payer = 'Other';
    if (r.startsWith('HU')) payer = 'Humana';
    else if (r.startsWith('CP')) payer = 'CarePlus';
    else if (r.startsWith('MED')||r.startsWith('DH')) payer = 'Medicare/Devoted';
    else if (r.startsWith('FHC')) payer = 'FL Health Care Plans';
    else if (r.startsWith('AM')||r.startsWith('AC')) payer = 'Aetna';
    else if (r.startsWith('CIG')||r.startsWith('HCIG')) payer = 'Cigna';
    else if (r.startsWith('HF')) payer = 'HealthFirst';
    acc[payer] = (acc[payer]||0) + 1;
    return acc;
  }, {}) : {};
  const totalPayers = Object.values(payerMix).reduce((s,v)=>s+v,0);

  // Regional performance
  const regions = hasPariox ? Object.entries(csvData.regionData||{}).sort(([a],[b])=>a.localeCompare(b)) : [];

  // Growth trend
  const lastSnap = snapshots[snapshots.length-1];
  const prevSnap = snapshots[snapshots.length-2];
  const censusTrend = lastSnap && prevSnap && lastSnap.activeCensus != null && prevSnap.activeCensus != null
    ? lastSnap.activeCensus - prevSnap.activeCensus : null;
  const visitTrend = lastSnap && prevSnap
    ? (lastSnap.scheduledVisits||0) - (prevSnap.scheduledVisits||0) : null;

  const fmt = (n) => n != null ? (n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n}`) : '—';

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:B.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Header */}
        <div style={{ background:B.card, borderBottom:`1px solid ${B.border}`, padding:'16px 32px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:B.black }}>Executive Dashboard</div>
            <div style={{ fontSize:12, color:B.gray }}>AxiomHealth Management · Read-only view</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <Clock />
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:`${B.purple}20`,
                border:`2px solid ${B.purple}40`, display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:14, fontWeight:700, color:B.purple }}>
                {(profile?.name||'D')[0]}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:B.black }}>{profile?.name}</div>
                <div style={{ fontSize:10, color:B.purple, fontWeight:600 }}>CEO</div>
              </div>
            </div>
            <button onClick={signOut} style={{ background:'none', border:`1px solid ${B.border}`,
              borderRadius:8, color:B.lightGray, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>
              Sign Out
            </button>
          </div>
        </div>

        <div style={{ flex:1, padding:'32px', overflowY:'auto', maxWidth:1400, margin:'0 auto', width:'100%' }}>

          {/* Data freshness banner */}
          {(hasPariox || hasCensus) && (
            <div style={{ background:`linear-gradient(135deg, ${B.darkRed}, ${B.red})`, borderRadius:14,
              padding:'14px 24px', marginBottom:28, display:'flex', justifyContent:'space-between', alignItems:'center',
              boxShadow:'0 4px 16px rgba(139,26,16,0.2)' }}>
              <div style={{ color:'#fff', fontSize:13 }}>
                <span style={{ fontWeight:700 }}>Data current as of:</span>{' '}
                {hasCensus && censusData.lastUpdated}
                {hasPariox && ` · ${csvData.rowCount} visit records`}
              </div>
              <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>
                Week of Mar 23–27, 2026
              </div>
            </div>
          )}

          {/* ── SECTION 1: OPERATIONS SUMMARY ── */}
          <SectionHeader title="📊 Operations Summary" sub="Weekly performance at a glance" />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:32 }}>
            <KPICard icon="📅" label="Scheduled Visits" value={scheduledVisits ?? '—'}
              sub={`Target: ${CFG.visitTarget}/week · ${visitPct != null ? visitPct+'% of target' : ''}`}
              color={visitPct >= 100 ? B.green : visitPct >= 80 ? B.orange : B.red}
              trend={visitTrend} trendLabel="vs last week" />
            <KPICard icon="✅" label="Completed This Week" value={completedVisits ?? '—'}
              sub={`${completedVisits != null && scheduledVisits ? Math.round(completedVisits/scheduledVisits*100)+'% completion rate' : 'No data'}`}
              color={B.green} />
            <KPICard icon="💰" label="Est. Weekly Revenue" value={estWeeklyRev != null ? fmt(estWeeklyRev) : '—'}
              sub={`Target: ${fmt(CFG.revenueTarget)}/week · ${estWeeklyRev != null ? Math.round(estWeeklyRev/CFG.revenueTarget*100)+'% of target' : ''}`}
              color={estWeeklyRev >= CFG.revenueTarget ? B.green : B.red} />
            <KPICard icon="🗺️" label="Active Regions" value={regions.length || '—'}
              sub={`${hasPariox ? csvData.staffStats ? Object.keys(csvData.staffStats).length : '—' : '—'} clinicians scheduled`}
              color={B.blue} />
          </div>

          {/* ── SECTION 2: PATIENT CENSUS ── */}
          <SectionHeader title="👥 Patient Census" sub="Current patient population status" />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:32 }}>
            <KPICard icon="✅" label="Active Census" value={activeCensus ?? '—'}
              sub="Active + Active-Auth Pending patients"
              color={B.green} trend={censusTrend} trendLabel="vs last snapshot" />
            <KPICard icon="⏸️" label="On Hold" value={onHold ?? '—'}
              sub={`~${onHold != null ? fmt(onHold*3*CFG.avgReimbursement) : '—'}/wk paused revenue`}
              color={onHold > 100 ? B.danger : B.yellow} />
            <KPICard icon="🔒" label="Auth Pending" value={authPending ?? '—'}
              sub={`~${authPending != null ? fmt(authPending*3*CFG.avgReimbursement) : '—'}/wk blocked`}
              color={authPending > 20 ? B.danger : B.yellow} />
            <KPICard icon="📅" label="SOC Pending" value={socPending ?? '—'}
              sub="Evaluated — awaiting start of care"
              color={B.blue} />
          </div>

          {/* ── SECTION 3: REVENUE & GROWTH ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginBottom:32 }}>
            {/* Revenue opportunity */}
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
              <SectionHeader title="💰 Revenue Opportunity" sub="Potential weekly uplift if actioned" />
              {[
                { label:'Resolve auth blocks', count:authPending||0, color:B.yellow },
                { label:'Activate SOC pending', count:socPending||0, color:B.blue },
                { label:'Return on-hold patients', count:onHold||0, color:B.gray },
                { label:'Convert waitlist', count:hasCensus?(censusData.counts.waitlist||0):0, color:B.purple },
              ].map(r => {
                const upside = fmt(r.count * 3 * CFG.avgReimbursement);
                return (
                  <div key={r.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'10px 0', borderBottom:`1px solid ${B.border}` }}>
                    <span style={{ fontSize:13, color:B.black }}>{r.label} ({r.count} patients)</span>
                    <span style={{ fontSize:14, fontWeight:800, color:B.green, fontFamily:"'DM Mono', monospace" }}>+{upside}/wk</span>
                  </div>
                );
              })}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:12, marginTop:4 }}>
                <span style={{ fontSize:14, fontWeight:700, color:B.black }}>Total potential uplift</span>
                <span style={{ fontSize:18, fontWeight:800, color:B.green, fontFamily:"'DM Mono', monospace" }}>
                  +{fmt(((authPending||0)+(socPending||0)+(onHold||0)+(hasCensus?censusData.counts.waitlist||0:0))*3*CFG.avgReimbursement)}/wk
                </span>
              </div>
            </div>

            {/* Payer mix */}
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
              <SectionHeader title="🏥 Payer Mix" sub="Active census by insurance" />
              {Object.keys(payerMix).length > 0 ? (
                Object.entries(payerMix).sort(([,a],[,b])=>b-a).map(([payer, count]) => {
                  const pct = Math.round(count/totalPayers*100);
                  const payerColors = { 'Humana':'#0066CC', 'CarePlus':'#009B77', 'Medicare/Devoted':'#1565C0',
                    'FL Health Care Plans':'#2E7D32', 'Aetna':'#7B1FA2', 'Cigna':'#E65100', 'HealthFirst':'#00838F' };
                  const color = payerColors[payer] || B.gray;
                  return (
                    <div key={payer} style={{ marginBottom:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:13, color:B.black }}>{payer}</span>
                        <span style={{ fontSize:13, fontWeight:700, color, fontFamily:'monospace' }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ height:5, background:'#F5EDEB', borderRadius:3 }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3 }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign:'center', color:B.lightGray, padding:'24px', fontSize:13 }}>Upload census data to see payer mix</div>
              )}
            </div>
          </div>

          {/* ── SECTION 4: REGIONAL PERFORMANCE ── */}
          <SectionHeader title="🗺️ Regional Performance" sub="Visit completion by region this week" />
          {regions.length > 0 ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:32 }}>
              {regions.map(([region, data]) => {
                const pct = data.scheduled > 0 ? Math.round(data.completed/data.scheduled*100) : 0;
                const color = pct >= 90 ? B.green : pct >= 60 ? B.orange : B.red;
                return (
                  <div key={region} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:12,
                    padding:'16px', textAlign:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize:11, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>Region {region}</div>
                    <div style={{ fontSize:28, fontWeight:800, color, fontFamily:"'DM Mono', monospace", lineHeight:1 }}>{pct}%</div>
                    <div style={{ fontSize:11, color:B.gray, marginTop:4 }}>{data.completed}/{data.scheduled} visits</div>
                    <div style={{ marginTop:8, height:4, background:'#F5EDEB', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2 }} />
                    </div>
                    <div style={{ fontSize:10, color:B.lightGray, marginTop:4 }}>{data.clinicians} clinicians · {data.patients} patients</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'32px',
              textAlign:'center', color:B.lightGray, marginBottom:32 }}>
              Upload Pariox visit data to see regional breakdown
            </div>
          )}

          {/* ── SECTION 5: EXPANSION ── */}
          <SectionHeader title="🚀 Expansion Status" sub="Multi-state growth tracker" />
          {(() => {
            const expansion = (() => { try { return JSON.parse(localStorage.getItem('axiom_expansion')||'{}'); } catch{return {};} })();
            const states = expansion.GA ? expansion : {
              GA:{state:'Georgia',credentialing:60,staffHired:2,staffNeeded:4,firstPatientDate:'2026-05-01',status:'In Progress'},
              TX:{state:'Texas',credentialing:20,staffHired:0,staffNeeded:6,firstPatientDate:'2026-07-01',status:'Planning'},
              NC:{state:'North Carolina',credentialing:10,staffHired:0,staffNeeded:3,firstPatientDate:'2026-08-01',status:'Planning'},
            };
            return (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:32 }}>
                {Object.entries(states).map(([key, s]) => {
                  const colors = {GA:'#2E7D32', TX:'#1565C0', NC:'#7C3AED'};
                  const color = colors[key] || B.red;
                  return (
                    <div key={key} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14,
                      overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                      <div style={{ background:color, padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{s.state}</div>
                          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>{s.status}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:26, fontWeight:800, color:'#fff', fontFamily:"'DM Mono', monospace" }}>{s.credentialing}%</div>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.7)' }}>credentialed</div>
                        </div>
                      </div>
                      <div style={{ padding:'14px 20px' }}>
                        {[
                          {label:'Staff Hired', value:`${s.staffHired||0} / ${s.staffNeeded||0}`},
                          {label:'First Patient Target', value:s.firstPatientDate||'TBD'},
                        ].map(f => (
                          <div key={f.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:`1px solid ${B.border}`, fontSize:12 }}>
                            <span style={{ color:B.gray }}>{f.label}</span>
                            <span style={{ fontWeight:600, color:B.black }}>{f.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── SECTION 6: GROWTH TREND ── */}
          {snapshots.length > 0 && (
            <>
              <SectionHeader title="📈 Growth Trend" sub={`${snapshots.length} weekly snapshots recorded`} />
              <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', marginBottom:32, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:120, marginBottom:12 }}>
                  {snapshots.slice(-10).map((s,i) => {
                    const maxV = Math.max(...snapshots.slice(-10).map(x=>x.scheduledVisits||0), CFG.visitTarget);
                    const h = Math.round((s.scheduledVisits||0)/maxV*110);
                    const targetH = Math.round(CFG.visitTarget/maxV*110);
                    const isLatest = i === Math.min(snapshots.length,10)-1;
                    return (
                      <div key={s.id} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                        <div style={{ fontSize:10, fontWeight: isLatest?700:400, color: isLatest?B.red:B.lightGray }}>{s.scheduledVisits}</div>
                        <div style={{ width:'100%', position:'relative', height:110, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
                          <div style={{ position:'absolute', bottom:targetH, left:0, right:0, borderTop:'2px dashed #FDDDD5', zIndex:1 }} />
                          <div style={{ width:'75%', height:h, background: isLatest ? `linear-gradient(180deg,${B.red},${B.darkRed})` : '#E8D5D0', borderRadius:'3px 3px 0 0', zIndex:2, minHeight:3 }} />
                        </div>
                        <div style={{ fontSize:9, color:B.lightGray, textAlign:'center' }}>{s.weekLabel?.split('–')[0]?.trim()}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display:'flex', gap:16, fontSize:11, color:B.lightGray }}>
                  <span>■ Scheduled visits</span>
                  <span style={{ color:'#FDDDD5' }}>- - Target ({CFG.visitTarget})</span>
                  {censusTrend != null && <span style={{ marginLeft:'auto', color: censusTrend>=0?B.green:B.danger, fontWeight:600 }}>Active census: {censusTrend>=0?'+':''}{censusTrend} week-over-week</span>}
                </div>
              </div>
            </>
          )}

          {/* No data state */}
          {!hasPariox && !hasCensus && (
            <div style={{ background:B.card, border:`2px dashed ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
              <div style={{ fontSize:18, fontWeight:700, color:B.black, marginBottom:8 }}>Dashboard data not yet loaded</div>
              <div style={{ fontSize:14, color:B.gray, maxWidth:400, margin:'0 auto' }}>
                The operations team uploads weekly Pariox data and patient census reports. Once uploaded, this dashboard updates automatically.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

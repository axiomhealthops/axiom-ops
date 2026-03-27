import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
function KPI({ label, value, sub, color, icon, format='number' }) {
  return (
    <div style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:14, padding:'18px 20px', position:'relative', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${color},transparent)` }} />
      <div style={{ fontSize:20, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:28, fontWeight:800, color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:12, fontWeight:600, color:B.gray, marginTop:6 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:B.lightGray, marginTop:3 }}>{sub}</div>}
    </div>
  );
}
 
export default function RevenueDashboard() {
  const csvData    = (() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} })();
  const censusData = (() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} })();
  const settings   = (() => { try { const s=localStorage.getItem('axiom_settings'); return s?JSON.parse(s):null; } catch{return null;} })();
  const CFG = settings || { visitTarget:800, revenueTarget:200000, avgReimbursement:90, activeCensusTarget:500, authRiskVisitsPerWeek:3 };
 
  const completedVisits = csvData?.completedVisits || 0;
  const scheduledVisits = csvData?.scheduledVisits || 0;
  const activeCensus    = censusData?.activeCensus || 0;
  const authPending     = (censusData?.counts?.auth_pending||0) + (censusData?.counts?.active_auth_pending||0);
  const onHold          = Object.entries(censusData?.counts||{}).filter(([k])=>k.startsWith('on_hold')).reduce((s,[,v])=>s+v,0);
 
  const weeklyRevenue     = completedVisits * CFG.avgReimbursement;
  const projectedMonthly  = weeklyRevenue * 4.33;
  const projectedAnnual   = weeklyRevenue * 52;
  const revenueTarget     = CFG.revenueTarget;
  const gap               = revenueTarget - weeklyRevenue;
  const revenueAtRisk     = authPending * CFG.authRiskVisitsPerWeek * CFG.avgReimbursement;
  const onHoldRevenue     = onHold * CFG.authRiskVisitsPerWeek * CFG.avgReimbursement;
  const completionRate    = scheduledVisits > 0 ? Math.round(completedVisits/scheduledVisits*100) : 0;
  const potentialWeekly   = scheduledVisits * CFG.avgReimbursement;
 
  const fmt$ = n => n >= 1000000 ? `$${(n/1000000).toFixed(2)}M` : n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${Math.round(n).toLocaleString()}`;
 
  // Revenue by region from Pariox
  const regionData = csvData?.regionData || {};
  const regionRows = Object.entries(regionData).map(([region, d]) => ({
    region,
    completed: d.completed || 0,
    scheduled: d.scheduled || 0,
    revenue: (d.completed||0) * CFG.avgReimbursement,
    rate: d.scheduled>0?Math.round((d.completed/d.scheduled)*100):0,
  })).sort((a,b)=>b.revenue-a.revenue);
 
  const noData = !csvData && !censusData;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>💰 Revenue Dashboard</div>
        <div style={{ fontSize:13, color:B.gray }}>
          {csvData ? `Based on Pariox data · ${csvData.rowCount} records · ${completedVisits} completed visits @ $${CFG.avgReimbursement}/visit` : 'Upload Pariox data in Data Uploads to see revenue projections'}
        </div>
      </div>
 
      {noData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>💰</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>No data loaded yet</div>
          <div style={{ fontSize:13, color:B.gray }}>Upload your Pariox visit export and patient census to see revenue projections.</div>
        </div>
      ) : (
        <>
          {/* Hero banner */}
          <div style={{ background:`linear-gradient(135deg,${B.darkRed},${B.red},${B.orange})`, borderRadius:16, padding:'22px 28px', marginBottom:20, display:'flex', gap:32, flexWrap:'wrap', alignItems:'center', boxShadow:'0 4px 16px rgba(139,26,16,0.2)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', inset:0, opacity:0.05, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
            <div style={{ position:'relative', flex:1, minWidth:200 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>Weekly Revenue (Completed Visits)</div>
              <div style={{ fontSize:46, fontWeight:800, color:'#fff', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{fmt$(weeklyRevenue)}</div>
              <div style={{ marginTop:10 }}>
                <div style={{ height:5, background:'rgba(255,255,255,0.2)', borderRadius:3, marginBottom:5 }}>
                  <div style={{ height:'100%', width:`${Math.min(weeklyRevenue/revenueTarget*100,100)}%`, background:'#fff', borderRadius:3 }} />
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>
                  {weeklyRevenue>=revenueTarget ? `✓ Above ${fmt$(revenueTarget)} target` : `${fmt$(gap)} below ${fmt$(revenueTarget)} weekly target`}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:24, position:'relative' }}>
              {[
                { label:'Monthly Proj.', value:fmt$(projectedMonthly) },
                { label:'Annual Proj.',  value:fmt$(projectedAnnual) },
                { label:'Completion',    value:`${completionRate}%` },
              ].map((s,i)=>(
                <div key={s.label} style={{ textAlign:'center', paddingLeft:i>0?20:0, borderLeft:i>0?'1px solid rgba(255,255,255,0.2)':'none' }}>
                  <div style={{ fontSize:22, fontWeight:800, color:'#fff', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
 
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            <KPI label="Weekly Potential" value={fmt$(potentialWeekly)} sub={`${scheduledVisits} scheduled × $${CFG.avgReimbursement}`} color={B.blue} icon="📅" />
            <KPI label="Revenue at Risk" value={fmt$(revenueAtRisk)} sub={`${authPending} patients w/ auth issues`} color={revenueAtRisk>5000?B.danger:B.yellow} icon="⚠️" />
            <KPI label="On-Hold Revenue" value={fmt$(onHoldRevenue)} sub={`${onHold} patients on hold`} color={B.orange} icon="⏸️" />
            <KPI label="Avg Per Visit" value={`$${CFG.avgReimbursement}`} sub="Configured reimbursement rate" color={B.green} icon="💵" />
          </div>
 
          {/* Revenue by region */}
          {regionRows.length > 0 && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)', marginBottom:20 }}>
              <div style={{ padding:'14px 18px', borderBottom:`1px solid ${B.border}`, fontSize:14, fontWeight:700 }}>📍 Revenue by Region</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px 80px', padding:'8px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Region','Completed','Scheduled','Revenue','Rate'].map(h=>(
                  <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                ))}
              </div>
              {regionRows.map(r=>(
                <div key={r.region} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px 80px', padding:'10px 18px', borderBottom:'1px solid #FAF4F2', alignItems:'center' }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{r.region}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:B.green, fontFamily:'monospace' }}>{r.completed}</div>
                  <div style={{ fontSize:13, color:B.gray, fontFamily:'monospace' }}>{r.scheduled}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:B.red, fontFamily:"'DM Mono',monospace" }}>{fmt$(r.revenue)}</div>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ flex:1, height:5, background:'rgba(0,0,0,0.08)', borderRadius:3 }}>
                        <div style={{ height:'100%', width:`${r.rate}%`, background:r.rate>=85?B.green:r.rate>=70?B.yellow:B.red, borderRadius:3 }} />
                      </div>
                      <span style={{ fontSize:11, color:B.gray, minWidth:28 }}>{r.rate}%</span>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 100px 80px', padding:'10px 18px', background:'#FBF7F6', borderTop:`1px solid ${B.border}`, alignItems:'center' }}>
                <div style={{ fontSize:12, fontWeight:700, color:B.gray }}>TOTAL</div>
                <div style={{ fontSize:13, fontWeight:800, color:B.green, fontFamily:'monospace' }}>{regionRows.reduce((s,r)=>s+r.completed,0)}</div>
                <div style={{ fontSize:13, fontWeight:700, color:B.gray, fontFamily:'monospace' }}>{regionRows.reduce((s,r)=>s+r.scheduled,0)}</div>
                <div style={{ fontSize:14, fontWeight:800, color:B.red, fontFamily:"'DM Mono',monospace" }}>{fmt$(regionRows.reduce((s,r)=>s+r.revenue,0))}</div>
                <div style={{ fontSize:12, fontWeight:700, color:B.gray }}>{completionRate}%</div>
              </div>
            </div>
          )}
 
          {/* Revenue scenarios */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>📊 Revenue Scenarios</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {[
                { label:'Current Pace', visits:completedVisits, color:weeklyRevenue>=revenueTarget?B.green:B.red },
                { label:'If All Scheduled', visits:scheduledVisits, color:B.blue },
                { label:'At Census Target', visits:CFG.activeCensusTarget*CFG.authRiskVisitsPerWeek, color:B.green },
              ].map(s=>(
                <div key={s.label} style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:10, padding:'14px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:11, color:B.lightGray, textTransform:'uppercase', marginBottom:6 }}>{s.label}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace" }}>{fmt$(s.visits*CFG.avgReimbursement)}</div>
                  <div style={{ fontSize:10, color:B.lightGray, marginTop:4 }}>{s.visits} visits/wk</div>
                  <div style={{ fontSize:11, color:B.gray, marginTop:2 }}>{fmt$(s.visits*CFG.avgReimbursement*52)}/yr</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
 

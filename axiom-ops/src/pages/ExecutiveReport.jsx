import { useState, useMemo, useRef } from 'react';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
function fmt$(n) {
  if (!n && n !== 0) return '—';
  return n >= 1000000 ? `$${(n/1000000).toFixed(2)}M`
    : n >= 1000 ? `$${(n/1000).toFixed(1)}K`
    : `$${Math.round(n).toLocaleString()}`;
}
 
function pct(a, b) {
  return b > 0 ? Math.round(a/b*100) : 0;
}
 
function StatusBadge({ value, target, unit='', inverse=false, format }) {
  const ratio = target > 0 ? (inverse ? target/Math.max(value,0.01) : value/target) : 0;
  const color = ratio >= 0.9 ? B.green : ratio >= 0.7 ? B.yellow : B.danger;
  const display = format === '$' ? fmt$(value) : `${Math.round(value).toLocaleString()}${unit}`;
  return (
    <span style={{ fontWeight:800, color, fontFamily:"'DM Mono',monospace", fontSize:13 }}>{display}</span>
  );
}
 
function Section({ title, children }) {
  return (
    <div style={{ marginBottom:24, breakInside:'avoid' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, paddingBottom:8, borderBottom:`2px solid ${B.border}` }}>
        <div style={{ width:4, height:18, background:B.red, borderRadius:2 }} />
        <div style={{ fontSize:13, fontWeight:800, color:B.black, textTransform:'uppercase', letterSpacing:'0.08em' }}>{title}</div>
      </div>
      {children}
    </div>
  );
}
 
function MetricRow({ label, value, target, unit, format, inverse, note }) {
  const ratio = target > 0 ? (inverse ? target/Math.max(value||0.01,0.01) : (value||0)/target) : null;
  const color = ratio === null ? B.black : ratio >= 0.9 ? B.green : ratio >= 0.7 ? B.yellow : B.danger;
  const display = format === '$' ? fmt$(value) : `${Math.round(value||0).toLocaleString()}${unit||''}`;
  const targetDisplay = format === '$' ? fmt$(target) : `${Math.round(target).toLocaleString()}${unit||''}`;
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:12, padding:'7px 0', borderBottom:`1px solid #F5F5F5`, alignItems:'center' }}>
      <div style={{ fontSize:12, color:B.gray }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:800, color, fontFamily:"'DM Mono',monospace", textAlign:'right', minWidth:70 }}>{display}</div>
      {target ? <div style={{ fontSize:11, color:B.lightGray, textAlign:'right', minWidth:60 }}>/ {targetDisplay}</div> : <div />}
      {ratio !== null ? (
        <div style={{ width:50 }}>
          <div style={{ height:4, background:'rgba(0,0,0,0.08)', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${Math.min(ratio*100,100)}%`, background:color, borderRadius:2 }} />
          </div>
        </div>
      ) : <div />}
      {note && <div style={{ gridColumn:'1/-1', fontSize:10, color:B.lightGray, paddingLeft:4, marginTop:-4 }}>{note}</div>}
    </div>
  );
}
 
export default function ExecutiveReport() {
  const reportRef = useRef(null);
 
  const csvData    = useMemo(() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} }, []);
  const censusData = useMemo(() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} }, []);
  const snapshots  = useMemo(() => { try { const s=localStorage.getItem('axiom_weekly_snapshots'); return s?JSON.parse(s):[]; } catch{return [];} }, []);
  const settings   = useMemo(() => { try { const s=localStorage.getItem('axiom_settings'); return s?JSON.parse(s):null; } catch{return null;} }, []);
  const CFG = settings || { visitTarget:800, revenueTarget:200000, avgReimbursement:90, activeCensusTarget:500, authRiskVisitsPerWeek:3 };
 
  // Visit metrics
  const completedVisits  = csvData?.completedVisits  || 0;
  const scheduledVisits  = csvData?.scheduledVisits  || 0;
  const missedVisits     = csvData?.missedVisits     || 0;
  const totalClinicians  = csvData?.uniqueClinicians || 0;
  const completionRate   = pct(completedVisits, scheduledVisits);
 
  // Census metrics
  const counts       = censusData?.counts || {};
  const activeCensus = censusData?.activeCensus || 0;
  const totalCensus  = censusData?.total || 0;
  const onHold       = ['on_hold','on_hold_facility','on_hold_pt','on_hold_md'].reduce((s,k)=>s+(counts[k]||0),0);
  const authRisk     = (counts.auth_pending||0) + (counts.active_auth_pending||0);
  const socPending   = counts.soc_pending || 0;
  const evalPending  = counts.eval_pending || 0;
  const hospitalized = counts.hospitalized || 0;
  const discharged   = counts.discharge || 0;
  const unscheduled  = Math.max(0, activeCensus - scheduledVisits);
 
  // Revenue
  const weeklyRevenue    = completedVisits * CFG.avgReimbursement;
  const potentialRevenue = scheduledVisits * CFG.avgReimbursement;
  const monthlyRevenue   = weeklyRevenue * 4.33;
  const annualRevenue    = weeklyRevenue * 52;
  const revenueAtRisk    = authRisk * CFG.authRiskVisitsPerWeek * CFG.avgReimbursement;
  const onHoldRevenue    = onHold * CFG.authRiskVisitsPerWeek * CFG.avgReimbursement;
 
  // Week-over-week
  const prevSnap = snapshots.length >= 2 ? snapshots[snapshots.length-2] : null;
  const currSnap = snapshots.length >= 1 ? snapshots[snapshots.length-1] : null;
  const censusGrowth = prevSnap && currSnap ? currSnap.activeCensus - prevSnap.activeCensus : null;
 
  // Region data
  const regionData = useMemo(() => {
    if (!csvData?.regionData) return [];
    return Object.entries(csvData.regionData)
      .map(([region, rd]) => ({
        region,
        scheduled: rd.scheduled || 0,
        completed: rd.completed || 0,
        missed:    Math.max(0,(rd.scheduled||0)-(rd.completed||0)),
        rate:      pct(rd.completed||0, rd.scheduled||0),
        clinicians: rd.clinicians || 0,
        revenue:   (rd.completed||0) * CFG.avgReimbursement,
      }))
      .sort((a,b) => b.completed - a.completed);
  }, [csvData, CFG]);
 
  // Top issues
  const issues = useMemo(() => {
    const list = [];
    if (completionRate < 85) list.push({ level:'danger', text:`Visit completion at ${completionRate}% — ${missedVisits} missed visits this week need rescheduling` });
    if (unscheduled > 0) list.push({ level:'danger', text:`${unscheduled} active patients not scheduled this week — est. ${fmt$(unscheduled * CFG.avgReimbursement * CFG.authRiskVisitsPerWeek)} revenue gap` });
    if (authRisk > 0) list.push({ level:'warning', text:`${authRisk} patients have authorization issues — ${fmt$(revenueAtRisk)}/wk at risk` });
    if (onHold > 20) list.push({ level:'warning', text:`${onHold} patients on hold — ${fmt$(onHoldRevenue)}/wk paused revenue` });
    if (activeCensus < CFG.activeCensusTarget * 0.8) list.push({ level:'warning', text:`Active census ${activeCensus} is below 80% of ${CFG.activeCensusTarget} target — growth action needed` });
    if (socPending + evalPending > 10) list.push({ level:'info', text:`${socPending + evalPending} patients pending SOC/Eval — pipeline converting to active census` });
    if (weeklyRevenue >= CFG.revenueTarget) list.push({ level:'good', text:`Weekly revenue ${fmt$(weeklyRevenue)} meets target of ${fmt$(CFG.revenueTarget)}` });
    if (list.length === 0) list.push({ level:'good', text:'No critical issues this week' });
    return list;
  }, [completionRate, missedVisits, unscheduled, authRisk, onHold, activeCensus, socPending, evalPending, weeklyRevenue, CFG]);
 
  const noData = !csvData && !censusData;
  const reportDate = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const weekLabel = csvData?.lastUpdated || censusData?.lastUpdated || reportDate;
 
  const handlePrint = () => window.print();
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #exec-report, #exec-report * { visibility: visible; }
          #exec-report { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 1.5cm; size: A4; }
        }
      `}</style>
 
      {/* Toolbar */}
      <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, marginBottom:2 }}>📊 Executive Report</div>
          <div style={{ fontSize:13, color:B.gray }}>Weekly operations summary for leadership · {reportDate}</div>
        </div>
        <button onClick={handlePrint}
          style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:10, color:'#fff', padding:'10px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(139,26,16,0.2)' }}>
          🖨️ Print / Save PDF
        </button>
      </div>
 
      {noData && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📊</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>No data loaded</div>
          <div style={{ fontSize:13, color:B.gray }}>Upload Pariox visit data and patient census to generate the executive report.</div>
        </div>
      )}
 
      {!noData && (
        <div id="exec-report" ref={reportRef} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'32px', maxWidth:820, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
 
          {/* Report header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, paddingBottom:20, borderBottom:`2px solid ${B.red}` }}>
            <div>
              <div style={{ fontSize:22, fontWeight:800, color:B.black, marginBottom:2 }}>AxiomHealth Management</div>
              <div style={{ fontSize:14, fontWeight:600, color:B.gray }}>Weekly Operations Report</div>
              <div style={{ fontSize:12, color:B.lightGray, marginTop:2 }}>{reportDate}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:11, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>Data as of</div>
              <div style={{ fontSize:12, fontWeight:600, color:B.black }}>{weekLabel}</div>
              <div style={{ fontSize:11, color:B.lightGray, marginTop:2 }}>{csvData?.rowCount ? `${csvData.rowCount} Pariox records` : ''}</div>
            </div>
          </div>
 
          {/* Top-line scorecard */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28 }}>
            {[
              { label:'Weekly Revenue',    value:fmt$(weeklyRevenue),    sub:`of ${fmt$(CFG.revenueTarget)} target`, color:weeklyRevenue>=CFG.revenueTarget?B.green:B.danger },
              { label:'Visits Completed',  value:completedVisits,        sub:`${completionRate}% of ${scheduledVisits} scheduled`, color:completionRate>=85?B.green:completionRate>=70?B.yellow:B.danger },
              { label:'Active Census',     value:activeCensus,           sub:`of ${CFG.activeCensusTarget} target`, color:activeCensus>=CFG.activeCensusTarget?B.green:B.orange },
              { label:'Annual Projection', value:fmt$(annualRevenue),    sub:'at current pace', color:B.blue },
            ].map(k=>(
              <div key={k.label} style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:22, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:10, color:B.lightGray, marginTop:4 }}>{k.sub}</div>
              </div>
            ))}
          </div>
 
          {/* Two-column layout */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
 
            {/* LEFT COLUMN */}
            <div>
              {/* Visit Performance */}
              <Section title="Visit Performance">
                <MetricRow label="Visits Completed" value={completedVisits} target={CFG.visitTarget} unit=" visits" />
                <MetricRow label="Visits Scheduled" value={scheduledVisits} target={CFG.visitTarget} unit=" visits" />
                <MetricRow label="Missed / Cancelled" value={missedVisits} target={5} unit=" visits" inverse />
                <MetricRow label="Completion Rate" value={completionRate} target={90} unit="%" />
                <MetricRow label="Active Clinicians" value={totalClinicians} unit=" clinicians" />
                <MetricRow label="Unscheduled Active Patients" value={unscheduled} target={0} unit=" patients" inverse
                  note={unscheduled>0?`Est. ${fmt$(unscheduled*CFG.avgReimbursement*CFG.authRiskVisitsPerWeek)}/wk gap`:''}/>
              </Section>
 
              {/* Revenue */}
              <Section title="Revenue">
                <MetricRow label="Weekly Revenue (Completed)" value={weeklyRevenue} target={CFG.revenueTarget} format="$" />
                <MetricRow label="Weekly Potential (Scheduled)" value={potentialRevenue} format="$" />
                <MetricRow label="Monthly Projection" value={monthlyRevenue} format="$" />
                <MetricRow label="Annual Projection" value={annualRevenue} format="$" />
                <MetricRow label="Revenue at Risk (Auth)" value={revenueAtRisk} format="$" inverse
                  note={revenueAtRisk>0?`${authRisk} patients with auth issues`:''}/>
                <MetricRow label="On-Hold Revenue Paused" value={onHoldRevenue} format="$" inverse
                  note={onHold>0?`${onHold} patients on hold`:''}/>
              </Section>
 
              {/* Week-over-week */}
              {(prevSnap || currSnap) && (
                <Section title="Week-over-Week">
                  {currSnap && <MetricRow label="Current Active Census" value={currSnap.activeCensus} unit=" patients" />}
                  {prevSnap && <MetricRow label="Prior Week Census" value={prevSnap.activeCensus} unit=" patients" />}
                  {censusGrowth !== null && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid #F5F5F5' }}>
                      <div style={{ fontSize:12, color:B.gray }}>Census Change</div>
                      <div style={{ fontSize:13, fontWeight:800, color:censusGrowth>=0?B.green:B.danger, fontFamily:"'DM Mono',monospace" }}>
                        {censusGrowth>=0?'+':''}{censusGrowth} patients
                      </div>
                    </div>
                  )}
                  {snapshots.length < 2 && (
                    <div style={{ fontSize:11, color:B.lightGray, padding:'6px 0' }}>Save weekly snapshots in Growth Tracker to enable week-over-week comparison</div>
                  )}
                </Section>
              )}
            </div>
 
            {/* RIGHT COLUMN */}
            <div>
              {/* Census Snapshot */}
              <Section title="Census Snapshot">
                <MetricRow label="Active Census" value={activeCensus} target={CFG.activeCensusTarget} unit=" patients" />
                <MetricRow label="Total in System" value={totalCensus} unit=" patients" />
                <MetricRow label="On Hold (all types)" value={onHold} unit=" patients" inverse />
                <MetricRow label="SOC Pending" value={socPending} unit=" patients" />
                <MetricRow label="Eval Pending" value={evalPending} unit=" patients" />
                <MetricRow label="Auth Risk Patients" value={authRisk} unit=" patients" inverse />
                <MetricRow label="Hospitalized" value={hospitalized} unit=" patients" />
                <MetricRow label="Discharged" value={discharged} unit=" patients" />
              </Section>
 
              {/* Auth Pipeline */}
              <Section title="Authorization Pipeline">
                <MetricRow label="Active – Auth Pending" value={counts.active_auth_pending||0} unit=" patients"
                  note="Currently treating, auth at risk" />
                <MetricRow label="Auth Pending (blocked)" value={counts.auth_pending||0} unit=" patients"
                  note="Cannot start treatment without auth" />
                <MetricRow label="Total Auth Issues" value={authRisk} unit=" patients" inverse />
                <MetricRow label="Weekly Revenue at Risk" value={revenueAtRisk} format="$" inverse />
              </Section>
 
              {/* Region Performance */}
              {regionData.length > 0 && (
                <Section title="Region Performance">
                  <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 50px 50px 45px', gap:4, padding:'4px 0 6px', borderBottom:`1px solid ${B.border}` }}>
                    {['Rgn','','Done','Miss','Rate'].map(h=>(
                      <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase' }}>{h}</div>
                    ))}
                  </div>
                  {regionData.map(r=>(
                    <div key={r.region} style={{ display:'grid', gridTemplateColumns:'40px 1fr 50px 50px 45px', gap:4, padding:'5px 0', borderBottom:'1px solid #F5F5F5', alignItems:'center' }}>
                      <div style={{ fontSize:11, fontWeight:700, color:B.black }}>{r.region}</div>
                      <div style={{ height:4, background:'rgba(0,0,0,0.07)', borderRadius:2 }}>
                        <div style={{ height:'100%', width:`${Math.min(r.rate,100)}%`, background:r.rate>=85?B.green:r.rate>=70?B.yellow:B.danger, borderRadius:2 }} />
                      </div>
                      <div style={{ fontSize:11, fontWeight:700, color:B.green, fontFamily:'monospace', textAlign:'right' }}>{r.completed}</div>
                      <div style={{ fontSize:11, fontWeight:r.missed>0?700:400, color:r.missed>0?B.danger:B.lightGray, fontFamily:'monospace', textAlign:'right' }}>{r.missed}</div>
                      <div style={{ fontSize:10, fontWeight:700, color:r.rate>=85?B.green:r.rate>=70?B.yellow:B.danger, textAlign:'right' }}>{r.rate}%</div>
                    </div>
                  ))}
                </Section>
              )}
            </div>
          </div>
 
          {/* Issues & Highlights — full width */}
          <Section title="Issues & Highlights">
            {issues.map((issue,i)=>{
              const color = issue.level==='danger'?B.danger:issue.level==='warning'?B.orange:issue.level==='good'?B.green:B.blue;
              const bg    = issue.level==='danger'?'#FEF2F2':issue.level==='warning'?'#FFF7ED':issue.level==='good'?'#F0FDF4':'#EFF6FF';
              const icon  = issue.level==='danger'?'🚨':issue.level==='warning'?'⚠️':issue.level==='good'?'✅':'ℹ️';
              return (
                <div key={i} style={{ display:'flex', gap:10, padding:'8px 12px', background:bg, borderRadius:8, marginBottom:6, alignItems:'flex-start' }}>
                  <span style={{ fontSize:13, flexShrink:0 }}>{icon}</span>
                  <div style={{ fontSize:12, color, lineHeight:1.5 }}>{issue.text}</div>
                </div>
              );
            })}
          </Section>
 
          {/* Footer */}
          <div style={{ marginTop:20, paddingTop:16, borderTop:`1px solid ${B.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:10, color:B.lightGray }}>AxiomHealth Management · Operations Platform · axiom-ops-rho.vercel.app</div>
            <div style={{ fontSize:10, color:B.lightGray }}>Generated {reportDate}</div>
          </div>
        </div>
      )}
    </div>
  );
}
 

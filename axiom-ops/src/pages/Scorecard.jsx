import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
function grade(pct) {
  if (pct >= 95) return { letter:'A+', color:B.green };
  if (pct >= 85) return { letter:'A',  color:B.green };
  if (pct >= 75) return { letter:'B',  color:'#65A30D' };
  if (pct >= 65) return { letter:'C',  color:B.yellow };
  if (pct >= 50) return { letter:'D',  color:B.orange };
  return { letter:'F', color:B.danger };
}
 
function ScoreRow({ label, actual, target, unit='', inverse=false, format }) {
  const pct = target > 0 ? Math.min(Math.round((inverse ? (target/Math.max(actual,0.01)) : (actual/target))*100), 120) : 0;
  const g   = grade(pct);
  const fmt = v => format === '$' ? `$${Math.round(v).toLocaleString()}` : format === '%' ? `${v}%` : `${Math.round(v).toLocaleString()}${unit}`;
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 120px 50px', padding:'11px 18px', borderBottom:'1px solid #FAF4F2', alignItems:'center' }}>
      <div style={{ fontSize:13, fontWeight:500, color:B.black }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:700, color:B.black, fontFamily:"'DM Mono',monospace" }}>{fmt(actual)}</div>
      <div style={{ fontSize:13, color:B.lightGray, fontFamily:"'DM Mono',monospace" }}>{fmt(target)}</div>
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, height:6, background:'rgba(0,0,0,0.07)', borderRadius:3 }}>
            <div style={{ height:'100%', width:`${Math.min(pct,100)}%`, background:g.color, borderRadius:3 }} />
          </div>
          <span style={{ fontSize:11, color:g.color, fontWeight:700, minWidth:32 }}>{pct}%</span>
        </div>
      </div>
      <div style={{ textAlign:'center' }}>
        <span style={{ fontSize:13, fontWeight:800, color:g.color }}>{g.letter}</span>
      </div>
    </div>
  );
}
 
export default function Scorecard() {
  const csvData    = (() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} })();
  const censusData = (() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} })();
  const settings   = (() => { try { const s=localStorage.getItem('axiom_settings'); return s?JSON.parse(s):null; } catch{return null;} })();
  const CFG = settings || { visitTarget:800, revenueTarget:200000, avgReimbursement:90, activeCensusTarget:500, coordinatorCap:80 };
 
  const [morningReports, setMorningReports] = useState([]);
  const [coordinators, setCoordinators]     = useState([]);
 
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      supabase.from('daily_reports').select('*').eq('report_date', today).eq('report_type','morning'),
      supabase.from('coordinators').select('*').neq('role','director').neq('role','super_admin'),
    ]).then(([rpt, coord]) => {
      setMorningReports(rpt.data||[]);
      setCoordinators(coord.data||[]);
    });
  }, []);
 
  const completedVisits  = csvData?.completedVisits || 0;
  const scheduledVisits  = csvData?.scheduledVisits || 0;
  const missedVisits     = csvData?.missedVisits || 0;
  const activeCensus     = censusData?.activeCensus || 0;
  const totalAuthPending = (censusData?.counts?.auth_pending||0)+(censusData?.counts?.active_auth_pending||0);
  const completionRate   = scheduledVisits>0 ? Math.round(completedVisits/scheduledVisits*100) : 0;
  const weeklyRevenue    = completedVisits * CFG.avgReimbursement;
  const reportsIn        = morningReports.length;
  const reportRate       = coordinators.length > 0 ? Math.round(reportsIn/coordinators.length*100) : 0;
  const noAuthPct        = activeCensus > 0 ? Math.round(totalAuthPending/activeCensus*100) : 0;
 
  // Overall grade
  const scores = [
    completedVisits/CFG.visitTarget*100,
    completionRate,
    weeklyRevenue/CFG.revenueTarget*100,
    activeCensus/CFG.activeCensusTarget*100,
    reportRate,
  ].filter(s => s > 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((s,v)=>s+v,0)/scores.length) : 0;
  const overallGrade = grade(avgScore);
 
  const noData = !csvData && !censusData;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>🎯 Operations Scorecard</div>
          <div style={{ fontSize:13, color:B.gray }}>Weekly performance vs targets · {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
        </div>
        {!noData && (
          <div style={{ background:B.card, border:`2px solid ${overallGrade.color}`, borderRadius:14, padding:'14px 20px', textAlign:'center', boxShadow:`0 4px 12px ${overallGrade.color}20` }}>
            <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', marginBottom:4 }}>Overall Grade</div>
            <div style={{ fontSize:36, fontWeight:800, color:overallGrade.color }}>{overallGrade.letter}</div>
            <div style={{ fontSize:11, color:B.lightGray, marginTop:2 }}>{avgScore}% avg</div>
          </div>
        )}
      </div>
 
      {noData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🎯</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>No data loaded yet</div>
          <div style={{ fontSize:13, color:B.gray }}>Upload Pariox data and census to generate your scorecard.</div>
        </div>
      ) : (
        <>
          {/* Scorecard table */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', marginBottom:20 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 120px 50px', padding:'10px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {['KPI','Actual','Target','Progress','Grade'].map(h=>(
                <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
              ))}
            </div>
 
            <ScoreRow label="Weekly Visits Completed"  actual={completedVisits}  target={CFG.visitTarget}        unit=" visits" />
            <ScoreRow label="Visit Completion Rate"    actual={completionRate}   target={90}                    format="%" />
            <ScoreRow label="Weekly Revenue"           actual={weeklyRevenue}    target={CFG.revenueTarget}      format="$" />
            <ScoreRow label="Active Census"            actual={activeCensus}     target={CFG.activeCensusTarget} unit=" patients" />
            <ScoreRow label="Morning Report Submission" actual={reportRate}      target={100}                   format="%" />
            <ScoreRow label="Missed Visits"            actual={missedVisits}     target={5}                     inverse={true} unit=" visits" />
            <ScoreRow label="Auth Risk Patients"       actual={noAuthPct}        target={10}                    inverse={true} format="%" />
          </div>
 
          {/* Target config note */}
          <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:10, padding:'12px 16px', fontSize:12, color:B.blue }}>
            <span style={{ fontWeight:700 }}>ℹ️ Targets</span> — configured in Settings. Current: {CFG.visitTarget} visits/wk · ${CFG.revenueTarget.toLocaleString()} revenue · {CFG.activeCensusTarget} active census.
          </div>
        </>
      )}
    </div>
  );
}
 

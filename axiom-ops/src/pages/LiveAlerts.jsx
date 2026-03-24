import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#FBF7F6', card:'#fff',
  green:'#2E7D32', yellow:'#D97706', danger:'#DC2626', blue:'#1565C0',
};

const SEVERITY = {
  critical: { color: B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨', label:'Critical' },
  warning:  { color: B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'⚠️', label:'Warning'  },
  info:     { color: B.blue,    bg:'#EFF6FF', border:'#BFDBFE', icon:'ℹ️', label:'Info'     },
  good:     { color: B.green,   bg:'#F0FDF4', border:'#BBF7D0', icon:'✅', label:'Good'     },
};

function AlertCard({ severity='warning', title, body, action, time }) {
  const s = SEVERITY[severity];
  return (
    <div style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12,
      padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
      <span style={{ fontSize:18, flexShrink:0 }}>{s.icon}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:700, color:B.black, marginBottom:3 }}>{title}</div>
        {body && <div style={{ fontSize:12, color:B.gray, lineHeight:1.5 }}>{body}</div>}
        {action && <div style={{ fontSize:11, color:s.color, marginTop:6, fontWeight:600 }}>{action}</div>}
      </div>
      {time && <div style={{ fontSize:10, color:B.lightGray, flexShrink:0, whiteSpace:'nowrap' }}>{time}</div>}
    </div>
  );
}

export default function LiveAlerts({ censusData, csvData, hasCensus, hasPariox, CFG }) {
  const [coordinators, setCoordinators] = useState([]);
  const [morningReports, setMorningReports] = useState([]);
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  useEffect(() => {
    supabase.from('coordinators').select('*').neq('role','director').neq('role','super_admin').neq('role','ceo').order('name')
      .then(({data}) => setCoordinators(data||[]));
    supabase.from('daily_reports').select('*').eq('report_date',today).eq('report_type','morning')
      .then(({data}) => setMorningReports(data||[]));
  }, [today]);

  // Build alerts from all data sources
  const alerts = [];
  const visitTarget = CFG?.visitTarget || 800;
  const avgRate = CFG?.avgReimbursement || 90;

  // ── Coordinator alerts ──────────────────────────────────────
  const missingReports = coordinators.filter(c => !morningReports.find(r => r.coordinator_id === c.id));
  const reportDeadlinePassed = now.getHours() >= 9;
  missingReports.forEach(c => {
    alerts.push({
      id: `report-${c.id}`, severity: reportDeadlinePassed ? 'critical' : 'warning',
      category: 'Reports',
      title: `${c.name} — Morning report not submitted`,
      body: `Region ${c.region || 'unknown'} · Due by 9:00 AM`,
      action: 'Follow up with coordinator',
      time: `Due 9AM`,
    });
  });

  // ── Visit volume alerts ─────────────────────────────────────
  if (hasPariox && csvData) {
    const scheduled = csvData.dedupedCount || csvData.scheduledVisits || 0;
    const gap = visitTarget - scheduled;
    if (gap > 150) {
      alerts.push({
        id: 'visit-critical', severity: 'critical', category: 'Visits',
        title: `${gap} visits below the ${visitTarget}-visit sustainability threshold`,
        body: `Currently at ${scheduled} scheduled visits. Immediate action needed to increase visit volume.`,
        action: 'Review coordinator caseloads and activate on-hold patients',
      });
    } else if (gap > 50) {
      alerts.push({
        id: 'visit-warning', severity: 'warning', category: 'Visits',
        title: `${gap} visits below weekly target`,
        body: `Currently at ${scheduled} of ${visitTarget} target visits this week.`,
        action: 'Activate SOC pending and waitlist patients',
      });
    }

    // Missed visits
    const missed = csvData.missedVisits || 0;
    if (missed > 5) {
      alerts.push({
        id: 'missed', severity: 'critical', category: 'Visits',
        title: `${missed} missed/cancelled visits this week`,
        body: 'Above the 5-visit threshold. Each missed visit requires same-day reschedule documentation.',
        action: 'Verify coordinators have rescheduled all missed visits',
      });
    }

    // Clinician productivity
    if (csvData.staffStats) {
      Object.values(csvData.staffStats)
        .filter(s => (s.totalVisits||0) > 5 && (s.completedVisits||0) === 0)
        .slice(0,3)
        .forEach(s => alerts.push({
          id: `clinician-${s.name}`, severity: 'warning', category: 'Clinicians',
          title: `${s.name} — ${s.totalVisits} scheduled, 0 completions`,
          body: `${s.discipline} · Regions: ${Array.isArray(s.regions) ? s.regions.join(', ') : s.regions}`,
          action: 'Verify visit note submissions in Pariox',
        }));
    }
  }

  // ── Census alerts ───────────────────────────────────────────
  if (hasCensus && censusData) {
    const activeCensus = censusData.activeCensus || 0;
    const activeNotSeen = hasPariox ? Math.max(0, activeCensus - (csvData?.uniquePatients||0)) : null;

    if (activeNotSeen != null && activeNotSeen > 20) {
      const revAtRisk = (activeNotSeen * (CFG?.authRiskVisitsPerWeek||3) * avgRate / 1000).toFixed(1);
      alerts.push({
        id: 'active-not-seen', severity: activeNotSeen > 50 ? 'critical' : 'warning',
        category: 'Census',
        title: `${activeNotSeen} active patients not scheduled this week`,
        body: `These patients are Active in your census but have no visits on the Pariox schedule. Region A has the highest concentration.`,
        action: `Estimated revenue at risk: ~$${revAtRisk}K/week — assign coordinators to review immediately`,
      });
    }

    const authRisk = (censusData.counts?.auth_pending||0) + (censusData.counts?.active_auth_pending||0);
    if (authRisk > 10) {
      const revBlocked = (authRisk * (CFG?.authRiskVisitsPerWeek||3) * avgRate / 1000).toFixed(1);
      alerts.push({
        id: 'auth-risk', severity: 'critical', category: 'Authorizations',
        title: `${authRisk} patients with authorization issues`,
        body: `Auth Pending: ${censusData.counts?.auth_pending||0} · Active-Auth Pending: ${censusData.counts?.active_auth_pending||0}`,
        action: `~$${revBlocked}K/week in revenue blocked — submit/follow up on authorizations today`,
      });
    }

    const onHold = (censusData.counts?.on_hold||0) + (censusData.counts?.on_hold_facility||0) +
                   (censusData.counts?.on_hold_pt||0) + (censusData.counts?.on_hold_md||0);
    if (onHold > 80) {
      alerts.push({
        id: 'on-hold', severity: 'warning', category: 'Census',
        title: `${onHold} patients on hold — significant paused revenue`,
        body: `On Hold: ${censusData.counts?.on_hold||0} · Facility: ${censusData.counts?.on_hold_facility||0} · Patient Request: ${censusData.counts?.on_hold_pt||0} · MD Request: ${censusData.counts?.on_hold_md||0}`,
        action: 'Review On-Hold Recovery tracker — target returning 10+ patients/week',
      });
    }

    const hospitalized = censusData.counts?.hospitalized || 0;
    if (hospitalized > 0) {
      alerts.push({
        id: 'hospitalized', severity: 'warning', category: 'Census',
        title: `${hospitalized} patients currently hospitalized`,
        body: 'Monitor for readmission risk and ensure hold status is current.',
        action: 'Verify hold documentation is complete for all hospitalized patients',
      });
    }

    const socPending = censusData.counts?.soc_pending || 0;
    if (socPending > 20) {
      alerts.push({
        id: 'soc', severity: 'info', category: 'Pipeline',
        title: `${socPending} patients with SOC Pending — ready to activate`,
        body: 'These patients have been evaluated and are awaiting start of care scheduling.',
        action: 'Assign coordinators to schedule SOC visits this week',
      });
    }
  }

  // ── No alerts ───────────────────────────────────────────────
  if (alerts.length === 0) {
    alerts.push({
      id: 'all-clear', severity: 'good', category: 'System',
      title: 'No critical alerts — operations within thresholds',
      body: 'All monitored metrics are within acceptable ranges.',
    });
  }

  const categories = [...new Set(alerts.map(a => a.category))];
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const [filterCat, setFilterCat] = useState('All');

  const filtered = filterCat === 'All' ? alerts : alerts.filter(a => a.category === filterCat);

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", maxWidth:900 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>🔔 Live Alerts</h1>
          {criticalCount > 0 && (
            <span style={{ background:B.danger, color:'#fff', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:700 }}>
              {criticalCount} Critical
            </span>
          )}
          {warningCount > 0 && (
            <span style={{ background:B.yellow, color:'#fff', borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:700 }}>
              {warningCount} Warning
            </span>
          )}
        </div>
        <p style={{ fontSize:13, color:B.gray, margin:0 }}>
          {alerts.length} active alert{alerts.length !== 1 ? 's' : ''} · Last checked {new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
        </p>
      </div>

      {/* Summary row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Critical', count:criticalCount, ...SEVERITY.critical },
          { label:'Warnings', count:warningCount, ...SEVERITY.warning },
          { label:'Info', count:alerts.filter(a=>a.severity==='info').length, ...SEVERITY.info },
          { label:'All Clear', count:alerts.filter(a=>a.severity==='good').length, ...SEVERITY.good },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
            <div style={{ fontSize:28, fontWeight:800, color:s.color, fontFamily:'monospace' }}>{s.count}</div>
            <div style={{ fontSize:11, color:s.color, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.icon} {s.label}</div>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {['All', ...categories].map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} style={{
            padding:'6px 12px', borderRadius:8, border:`1px solid ${filterCat===cat ? B.red : B.border}`,
            background: filterCat===cat ? '#FFF5F2' : 'transparent',
            color: filterCat===cat ? B.red : B.gray,
            fontSize:12, fontWeight: filterCat===cat ? 700 : 400, cursor:'pointer', fontFamily:'inherit',
          }}>{cat}</button>
        ))}
      </div>

      {/* Alert list */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.map(a => (
          <AlertCard key={a.id} severity={a.severity} title={a.title} body={a.body} action={a.action} time={a.time} />
        ))}
      </div>

      {!hasPariox && !hasCensus && (
        <div style={{ marginTop:20, padding:'16px 20px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, fontSize:13, color:B.blue }}>
          ℹ️ Upload your Pariox visit report and patient census in <strong>Data Uploads</strong> to see data-driven alerts.
        </div>
      )}
    </div>
  );
}

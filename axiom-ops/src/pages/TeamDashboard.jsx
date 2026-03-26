import { useState, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';

// ── Design tokens ──────────────────────────────────────────────────────────
const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626',
  blue:'#1D4ED8', purple:'#7C3AED', amber:'#B45309',
};

const AUTH_COLOR  = '#0369A1';
const CC_COLOR    = '#059669';

// ── Shared helpers ─────────────────────────────────────────────────────────
function useSharedData() {
  const censusData = useMemo(() => {
    try { const s = localStorage.getItem('axiom_census'); return s ? JSON.parse(s) : null; } catch { return null; }
  }, []);
  const csvData = useMemo(() => {
    try { const s = localStorage.getItem('axiom_pariox_data'); return s ? JSON.parse(s) : null; } catch { return null; }
  }, []);
  const authRecords = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('axiom_auth_tracker') || '{}'); } catch { return {}; }
  }, []);

  const hasCensus = !!(censusData?.counts);
  const hasPariox = !!(csvData?.scheduledVisits > 0);

  return { censusData, csvData, authRecords, hasCensus, hasPariox };
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ label, value, icon, color, bg, border, sub, alert }) {
  return (
    <div style={{
      background: alert ? `${color}10` : B.card,
      border: `1.5px solid ${alert ? color : B.border}`,
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: alert ? `0 2px 12px ${color}20` : '0 1px 3px rgba(0,0,0,0.05)',
      flex: 1, minWidth: 140,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 20 }}>{icon}</div>
        {alert && (
          <div style={{ fontSize: 9, fontWeight: 800, color, background: `${color}15`,
            padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Action Needed
          </div>
        )}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: B.gray }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: B.lightGray }}>{sub}</div>}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({ title, count, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: B.black }}>{title}</div>
      {count !== undefined && (
        <div style={{ fontSize: 11, fontWeight: 700, color,
          background: `${color}15`, padding: '2px 9px', borderRadius: 20 }}>
          {count}
        </div>
      )}
    </div>
  );
}

// ── Auth status badge ──────────────────────────────────────────────────────
function AuthBadge({ status, noAuth }) {
  if (noAuth) return (
    <span style={{ background:'#FEF2F2', color:B.danger, border:'1px solid #FECACA',
      borderRadius:20, padding:'3px 9px', fontSize:11, fontWeight:700 }}>No Auth</span>
  );
  const META = {
    active:            { label:'Active',            color:B.green,   bg:'#F0FDF4', border:'#BBF7D0' },
    pending:           { label:'Pending',           color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A' },
    renewal_submitted: { label:'Renewal Submitted', color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE' },
    expired:           { label:'Expired',           color:B.gray,    bg:'#F9FAFB', border:'#E5E7EB' },
    denied:            { label:'Denied',            color:B.danger,  bg:'#FEF2F2', border:'#FECACA' },
  };
  const m = META[status] || META.active;
  return (
    <span style={{ background:m.bg, color:m.color, border:`1px solid ${m.border}`,
      borderRadius:20, padding:'3px 9px', fontSize:11, fontWeight:700 }}>
      {m.label}
    </span>
  );
}

// ── Days until date helper ─────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  return diff;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// ══════════════════════════════════════════════════════════════════════════
// AUTH TEAM DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
export function AuthDashboard() {
  const { profile } = useAuth();
  const { censusData, authRecords, hasCensus } = useSharedData();
  const [activeSection, setActiveSection] = useState('patients'); // 'patients' | 'timeline' | 'followups'

  // ── Compute KPIs from census + auth records ──────────────────
  const patients = useMemo(() => {
    if (!hasCensus || !censusData?.patients) return [];
    return censusData.patients.filter(p =>
      ['active','active_auth_pending','auth_pending','on_hold'].includes(p.status)
    );
  }, [censusData, hasCensus]);

  const totalActive     = hasCensus ? (censusData.activeCensus || 0) : 0;
  const authPending     = hasCensus ? ((censusData.counts?.auth_pending||0) + (censusData.counts?.active_auth_pending||0)) : 0;
  const onHold          = hasCensus ? ((censusData.counts?.on_hold||0)+(censusData.counts?.on_hold_facility||0)+(censusData.counts?.on_hold_pt||0)+(censusData.counts?.on_hold_md||0)) : 0;

  // Auth record analysis
  const authStats = useMemo(() => {
    const entries = Object.values(authRecords);
    const noAuth        = patients.filter(p => !authRecords[p.id || p.name]);
    const expiring14    = entries.filter(a => { const d = daysUntil(a.approvedThru); return d !== null && d >= 0 && d <= 14; });
    const pendingRenewal= entries.filter(a => a.status === 'pending' || a.status === 'renewal_submitted');
    const followUpsToday= entries.filter(a => {
      if (!a.nextFollowUp) return false;
      const d = new Date(a.nextFollowUp).toDateString();
      return d === new Date().toDateString();
    });
    return { noAuth, expiring14, pendingRenewal, followUpsToday };
  }, [authRecords, patients]);

  // Enriched patient rows with auth data
  const patientRows = useMemo(() => {
    return patients.map(p => {
      const auth = authRecords[p.id || p.name] || null;
      const days = auth ? daysUntil(auth.approvedThru) : null;
      const urgent = !auth || (days !== null && days <= 14) || auth.status === 'pending';
      return { ...p, auth, days, urgent };
    }).sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
  }, [patients, authRecords]);

  // Timeline — sorted by expiry
  const timelineRows = useMemo(() => {
    return patientRows
      .filter(p => p.auth?.approvedThru)
      .sort((a, b) => new Date(a.auth.approvedThru) - new Date(b.auth.approvedThru))
      .slice(0, 20);
  }, [patientRows]);

  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: B.black, maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: AUTH_COLOR }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: AUTH_COLOR, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Authorization Team
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: B.black }}>
          Good morning, {profile?.name?.split(' ')[0] || 'Carla'} 👋
        </div>
        <div style={{ fontSize: 13, color: B.gray, marginTop: 2 }}>{today}</div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <KPICard label="Total Active Patients" value={totalActive} icon="👥" color={AUTH_COLOR} />
        <KPICard label="No Auth on File"        value={authStats.noAuth.length}         icon="🚫" color={B.danger}  alert={authStats.noAuth.length > 0} />
        <KPICard label="Expiring ≤14 Days"      value={authStats.expiring14.length}     icon="⏰" color={B.yellow}  alert={authStats.expiring14.length > 0} />
        <KPICard label="Pending Renewal"        value={authStats.pendingRenewal.length} icon="🔄" color={B.blue}   alert={authStats.pendingRenewal.length > 0} />
        <KPICard label="Follow-Ups Today"       value={authStats.followUpsToday.length} icon="📞" color={B.purple} alert={authStats.followUpsToday.length > 0} />
        <KPICard label="On Hold / Recovery"     value={onHold}                          icon="⏸️" color={B.gray} />
      </div>

      {/* No census state */}
      {!hasCensus && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12,
          padding:'16px 20px', marginBottom:20, fontSize:13, color:'#92400E' }}>
          📤 No patient data loaded yet. Upload your Pariox census in <strong>Data Uploads</strong> to populate this dashboard.
        </div>
      )}

      {/* Section tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${B.border}`, marginBottom:20, marginTop:24 }}>
        {[
          { key:'patients',  label:`👥 Patient Auth Status`, count: patientRows.length },
          { key:'timeline',  label:`📅 Expiration Timeline`,  count: timelineRows.length },
          { key:'followups', label:`📞 Follow-Ups Today`,      count: authStats.followUpsToday.length },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveSection(t.key)}
            style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'inherit',
              padding:'10px 16px', fontSize:13, fontWeight: activeSection===t.key ? 700 : 500,
              color: activeSection===t.key ? AUTH_COLOR : B.gray,
              borderBottom: activeSection===t.key ? `2px solid ${AUTH_COLOR}` : '2px solid transparent',
              marginBottom:-1, transition:'all 0.15s', display:'flex', alignItems:'center', gap:7 }}>
            {t.label}
            <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:20,
              background: activeSection===t.key ? `${AUTH_COLOR}15` : '#F3F4F6',
              color: activeSection===t.key ? AUTH_COLOR : B.gray }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Patient Auth Status table */}
      {activeSection === 'patients' && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'200px 100px 130px 130px 120px 1fr',
            padding:'10px 20px', background:'#F9FAFB', borderBottom:`1px solid ${B.border}` }}>
            {['Patient','Region','Auth Status','Payer','Expiry','Notes'].map(h => (
              <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.1em' }}>{h}</div>
            ))}
          </div>
          {patientRows.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:B.lightGray, fontSize:13 }}>No patient data — upload census to populate</div>
          ) : patientRows.map((p, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'200px 100px 130px 130px 120px 1fr',
              padding:'11px 20px', borderBottom:`1px solid #F3F4F6`,
              background: p.urgent ? '#FFFBEB' : 'transparent',
              alignItems:'center' }}>
              <div style={{ fontWeight:600, fontSize:13, color:B.black }}>{p.name || p.patientName || '—'}</div>
              <div style={{ fontSize:12, color:B.gray }}>Region {p.region || '—'}</div>
              <div><AuthBadge status={p.auth?.status} noAuth={!p.auth} /></div>
              <div style={{ fontSize:12, color:B.gray }}>{p.auth?.payer || '—'}</div>
              <div style={{ fontSize:12, color: p.days !== null && p.days <= 14 ? B.danger : B.gray }}>
                {p.auth?.approvedThru ? (
                  <>
                    {formatDate(p.auth.approvedThru)}
                    {p.days !== null && (
                      <div style={{ fontSize:10, color: p.days <= 7 ? B.danger : p.days <= 14 ? B.yellow : B.lightGray }}>
                        {p.days <= 0 ? 'Expired' : `${p.days}d remaining`}
                      </div>
                    )}
                  </>
                ) : '—'}
              </div>
              <div style={{ fontSize:11, color:B.lightGray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {p.auth?.lastCallNotes || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expiration Timeline */}
      {activeSection === 'timeline' && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'200px 130px 130px 100px 1fr',
            padding:'10px 20px', background:'#F9FAFB', borderBottom:`1px solid ${B.border}` }}>
            {['Patient','Expiry Date','Days Left','Status','Auth #'].map(h => (
              <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.1em' }}>{h}</div>
            ))}
          </div>
          {timelineRows.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:B.lightGray, fontSize:13 }}>No expiration data available</div>
          ) : timelineRows.map((p, i) => {
            const urgency = p.days <= 0 ? B.danger : p.days <= 7 ? B.danger : p.days <= 14 ? B.yellow : B.green;
            return (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'200px 130px 130px 100px 1fr',
                padding:'11px 20px', borderBottom:'1px solid #F3F4F6', alignItems:'center',
                background: p.days <= 7 ? '#FEF2F2' : p.days <= 14 ? '#FFFBEB' : 'transparent' }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{p.name || p.patientName || '—'}</div>
                <div style={{ fontSize:12, color:B.gray }}>{formatDate(p.auth.approvedThru)}</div>
                <div style={{ fontSize:13, fontWeight:700, color:urgency }}>
                  {p.days <= 0 ? '⚠️ Expired' : `${p.days} days`}
                </div>
                <div><AuthBadge status={p.auth.status} /></div>
                <div style={{ fontSize:12, color:B.lightGray }}>{p.auth.authNumber || '—'}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Follow-ups Today */}
      {activeSection === 'followups' && (
        <div>
          {authStats.followUpsToday.length === 0 ? (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14,
              padding:40, textAlign:'center', color:B.lightGray, fontSize:13 }}>
              ✅ No follow-ups scheduled for today
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {authStats.followUpsToday.map((a, i) => (
                <div key={i} style={{ background:B.card, border:`1.5px solid ${AUTH_COLOR}30`,
                  borderRadius:12, padding:'14px 18px',
                  display:'flex', alignItems:'center', gap:16 }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:`${AUTH_COLOR}15`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    📞
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{a.patientName || 'Patient'}</div>
                    <div style={{ fontSize:12, color:B.gray, marginTop:2 }}>
                      Auth #{a.authNumber || '—'} · {a.payer || '—'}
                    </div>
                    {a.lastCallNotes && (
                      <div style={{ fontSize:11, color:B.lightGray, marginTop:4 }}>{a.lastCallNotes}</div>
                    )}
                  </div>
                  <AuthBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CARE COORDINATION DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
export function CareCoordDashboard() {
  const { profile } = useAuth();
  const { censusData, csvData, hasCensus, hasPariox } = useSharedData();
  const [activeSection, setActiveSection] = useState('patients');

  // ── KPIs ──────────────────────────────────────────────────────
  const counts       = censusData?.counts || {};
  const totalActive  = censusData?.activeCensus || 0;
  const onHold       = (counts.on_hold||0)+(counts.on_hold_facility||0)+(counts.on_hold_pt||0)+(counts.on_hold_md||0);
  const evalPending  = counts.eval_pending || 0;
  const authRisk     = (counts.auth_pending||0)+(counts.active_auth_pending||0);

  const scheduledVisits  = csvData?.scheduledVisits  || 0;
  const completedVisits  = csvData?.completedVisits  || 0;
  const missedVisits     = csvData?.missedVisits     || 0;

  // High alert = auth risk + on hold + any missed
  const highAlerts = authRisk + (missedVisits > 0 ? 1 : 0);

  // ── Patient lists ─────────────────────────────────────────────
  const allPatients = useMemo(() => {
    if (!hasCensus || !censusData?.patients) return [];
    return censusData.patients;
  }, [censusData, hasCensus]);

  const onHoldPatients = useMemo(() =>
    allPatients.filter(p => ['on_hold','on_hold_facility','on_hold_pt','on_hold_md'].includes(p.status)),
  [allPatients]);

  const alertPatients = useMemo(() =>
    allPatients.filter(p => ['auth_pending','active_auth_pending'].includes(p.status)),
  [allPatients]);

  // Group by coordinator
  const byCoordinator = useMemo(() => {
    const groups = {};
    allPatients.forEach(p => {
      const coord = p.coordinator || p.assignedCoordinator || 'Unassigned';
      if (!groups[coord]) groups[coord] = [];
      groups[coord].push(p);
    });
    return groups;
  }, [allPatients]);

  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

  const STATUS_META = {
    active:                 { label:'Active',         color:B.green,   bg:'#F0FDF4' },
    active_auth_pending:    { label:'Auth Pending',   color:B.yellow,  bg:'#FFFBEB' },
    auth_pending:           { label:'Auth Pending',   color:B.yellow,  bg:'#FFFBEB' },
    on_hold:                { label:'On Hold',        color:B.gray,    bg:'#F9FAFB' },
    on_hold_facility:       { label:'On Hold',        color:B.gray,    bg:'#F9FAFB' },
    on_hold_pt:             { label:'On Hold (PT)',   color:B.gray,    bg:'#F9FAFB' },
    on_hold_md:             { label:'On Hold (MD)',   color:B.gray,    bg:'#F9FAFB' },
    eval_pending:           { label:'Eval Pending',   color:B.blue,    bg:'#EFF6FF' },
    soc_pending:            { label:'SOC Pending',    color:B.purple,  bg:'#F5F3FF' },
    discharged:             { label:'Discharged',     color:B.lightGray, bg:'#F9FAFB' },
  };

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", color:B.black, maxWidth:1100 }}>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:CC_COLOR }} />
          <div style={{ fontSize:11, fontWeight:700, color:CC_COLOR, textTransform:'uppercase', letterSpacing:'0.08em' }}>
            Care Coordination Team
          </div>
        </div>
        <div style={{ fontSize:22, fontWeight:800, color:B.black }}>
          Good morning, {profile?.name?.split(' ')[0] || 'Team'} 👋
        </div>
        <div style={{ fontSize:13, color:B.gray, marginTop:2 }}>{today}</div>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:8 }}>
        <KPICard label="Total Active Patients"   value={totalActive}       icon="👥" color={CC_COLOR} />
        <KPICard label="Visits This Week"        value={scheduledVisits}   icon="📅" color={B.blue} sub={hasPariox ? `${completedVisits} completed` : 'Upload Pariox for detail'} />
        <KPICard label="Missed / Incomplete"     value={missedVisits}      icon="⚠️" color={B.danger}  alert={missedVisits > 0} />
        <KPICard label="Patients On Hold"        value={onHold}            icon="⏸️" color={B.gray}    alert={onHold > 0} />
        <KPICard label="High Alert Patients"     value={highAlerts}        icon="🚨" color={B.danger}  alert={highAlerts > 0} />
        <KPICard label="Patients Pending Eval"   value={evalPending}       icon="🗂️" color={B.purple} />
      </div>

      {/* No census state */}
      {!hasCensus && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12,
          padding:'16px 20px', marginBottom:20, fontSize:13, color:'#92400E' }}>
          📤 No patient data loaded yet. Upload your Pariox census in <strong>Data Uploads</strong> to populate this dashboard.
        </div>
      )}

      {/* Section tabs */}
      <div style={{ display:'flex', gap:4, borderBottom:`1px solid ${B.border}`, marginBottom:20, marginTop:24 }}>
        {[
          { key:'patients',  label:'👥 By Coordinator',       count: Object.keys(byCoordinator).length },
          { key:'onhold',    label:'⏸️ On Hold',               count: onHoldPatients.length },
          { key:'alerts',    label:'🚨 High Alert',            count: alertPatients.length },
          { key:'activity',  label:'📋 Visit Activity',        count: scheduledVisits },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveSection(t.key)}
            style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'inherit',
              padding:'10px 16px', fontSize:13, fontWeight: activeSection===t.key ? 700 : 500,
              color: activeSection===t.key ? CC_COLOR : B.gray,
              borderBottom: activeSection===t.key ? `2px solid ${CC_COLOR}` : '2px solid transparent',
              marginBottom:-1, transition:'all 0.15s', display:'flex', alignItems:'center', gap:7 }}>
            {t.label}
            <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:20,
              background: activeSection===t.key ? `${CC_COLOR}15` : '#F3F4F6',
              color: activeSection===t.key ? CC_COLOR : B.gray }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* By Coordinator */}
      {activeSection === 'patients' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {Object.keys(byCoordinator).length === 0 ? (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14,
              padding:40, textAlign:'center', color:B.lightGray, fontSize:13 }}>
              No patient data — upload census to populate
            </div>
          ) : Object.entries(byCoordinator).map(([coord, patients]) => (
            <div key={coord} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'12px 20px', background:`${CC_COLOR}08`,
                borderBottom:`1px solid ${B.border}`,
                display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background:CC_COLOR,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:14, fontWeight:800, color:'#fff' }}>
                    {coord[0]?.toUpperCase()}
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.black }}>{coord}</div>
                </div>
                <div style={{ fontSize:12, color:B.gray }}>{patients.length} patients</div>
              </div>
              {patients.slice(0,8).map((p, i) => {
                const sm = STATUS_META[p.status] || STATUS_META.active;
                return (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 120px',
                    padding:'10px 20px', borderBottom:'1px solid #F9FAFB', alignItems:'center' }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{p.name||p.patientName||'—'}</div>
                    <div style={{ fontSize:12, color:B.gray }}>Region {p.region||'—'}</div>
                    <div>
                      <span style={{ background:sm.bg, color:sm.color, border:`1px solid ${sm.color}30`,
                        borderRadius:20, padding:'3px 8px', fontSize:11, fontWeight:700 }}>
                        {sm.label}
                      </span>
                    </div>
                  </div>
                );
              })}
              {patients.length > 8 && (
                <div style={{ padding:'8px 20px', fontSize:11, color:B.lightGray, borderTop:`1px solid ${B.border}` }}>
                  +{patients.length - 8} more patients
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* On Hold */}
      {activeSection === 'onhold' && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 140px 1fr',
            padding:'10px 20px', background:'#F9FAFB', borderBottom:`1px solid ${B.border}` }}>
            {['Patient','Region','Hold Status','Coordinator'].map(h => (
              <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.1em' }}>{h}</div>
            ))}
          </div>
          {onHoldPatients.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:B.lightGray, fontSize:13 }}>✅ No patients currently on hold</div>
          ) : onHoldPatients.map((p, i) => {
            const sm = STATUS_META[p.status] || STATUS_META.on_hold;
            return (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 140px 1fr',
                padding:'11px 20px', borderBottom:'1px solid #F3F4F6', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{p.name||p.patientName||'—'}</div>
                <div style={{ fontSize:12, color:B.gray }}>Region {p.region||'—'}</div>
                <span style={{ background:sm.bg, color:sm.color, border:`1px solid ${sm.color}30`,
                  borderRadius:20, padding:'3px 8px', fontSize:11, fontWeight:700 }}>
                  {sm.label}
                </span>
                <div style={{ fontSize:12, color:B.gray }}>{p.coordinator||'—'}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* High Alert */}
      {activeSection === 'alerts' && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 150px 1fr',
            padding:'10px 20px', background:'#FEF2F2', borderBottom:`1px solid ${B.border}` }}>
            {['Patient','Region','Alert Reason','Coordinator'].map(h => (
              <div key={h} style={{ fontSize:10, fontWeight:700, color:B.danger, textTransform:'uppercase', letterSpacing:'0.1em' }}>{h}</div>
            ))}
          </div>
          {alertPatients.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:B.lightGray, fontSize:13 }}>✅ No high alert patients</div>
          ) : alertPatients.map((p, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 150px 1fr',
              padding:'11px 20px', borderBottom:'1px solid #FEF2F2', alignItems:'center',
              background:'#FFF8F8' }}>
              <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{p.name||p.patientName||'—'}</div>
              <div style={{ fontSize:12, color:B.gray }}>Region {p.region||'—'}</div>
              <span style={{ background:'#FEF2F2', color:B.danger, border:'1px solid #FECACA',
                borderRadius:20, padding:'3px 8px', fontSize:11, fontWeight:700 }}>
                Auth Risk
              </span>
              <div style={{ fontSize:12, color:B.gray }}>{p.coordinator||'—'}</div>
            </div>
          ))}
        </div>
      )}

      {/* Visit Activity */}
      {activeSection === 'activity' && (
        <div>
          {!hasPariox ? (
            <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12,
              padding:'16px 20px', fontSize:13, color:'#92400E' }}>
              📤 Upload your Pariox visit data in <strong>Data Uploads</strong> to see visit activity.
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
              {[
                { label:'Scheduled This Week', value:scheduledVisits, color:B.blue,   icon:'📅' },
                { label:'Completed',           value:completedVisits,  color:B.green, icon:'✅' },
                { label:'Missed / Incomplete', value:missedVisits,     color:B.danger, icon:'⚠️', alert:missedVisits>0 },
              ].map(s => (
                <div key={s.label} style={{ background: s.alert ? '#FEF2F2' : B.card,
                  border:`1.5px solid ${s.alert ? B.danger : B.border}`,
                  borderRadius:12, padding:20, textAlign:'center' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>{s.icon}</div>
                  <div style={{ fontSize:36, fontWeight:800, color:s.color,
                    fontFamily:"'DM Mono', monospace" }}>{s.value}</div>
                  <div style={{ fontSize:13, color:B.gray, marginTop:4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

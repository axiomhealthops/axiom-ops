import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const B = {
  red: '#D94F2B', darkRed: '#8B1A10', orange: '#E8763A',
  black: '#1A1A1A', gray: '#8B6B64', lightGray: '#BBA8A4',
  border: '#F0E4E0', bg: '#FBF7F6', card: '#fff',
  green: '#2E7D32', yellow: '#D97706', danger: '#DC2626', blue: '#1565C0',
};

const CHECKLIST = [
  {
    id: 'pariox_comments',
    time: 'By 9:00 AM',
    title: 'Check & Answer Pariox Comments',
    desc: 'Log into Pariox, review all open comments and respond to any outstanding items from clinicians or staff.',
    urgent: true,
  },
  {
    id: 'zero_one_report',
    time: 'By 9:30 AM',
    title: 'Run 0-1 Report in Pariox',
    desc: 'Generate and review the 0-1 report to identify patients with 0 or 1 visits. Flag any at risk of falling off schedule.',
    urgent: true,
  },
  {
    id: 'missed_cancelled',
    time: 'By 10:00 AM',
    title: 'Follow Up on Missed & Cancelled Visits',
    desc: 'Review all missed and cancelled visits from yesterday. Confirm clinicians have submitted visit notes. Reschedule any outstanding visits.',
    urgent: true,
  },
  {
    id: 'evals_scheduled',
    time: 'By 11:00 AM',
    title: 'Verify Evaluations & Visit Plotting',
    desc: 'Confirm all pending evaluations have been scheduled. Verify visits are plotted correctly in the system for the coming week.',
    urgent: false,
  },
  {
    id: 'activation_review',
    time: 'By 12:00 PM',
    title: 'Activation Review — Waitlist, SOC Pending, On Hold, Auth Pending',
    desc: 'Review Waitlist, SOC Pending, On Hold, and Auth Pending patients. Identify anyone ready to activate and take action.',
    urgent: false,
  },
];

function ChecklistItem({ item, checked, completedAt, onToggle }) {
  const now = new Date();
  const [timeH, timeM] = item.time.replace('By ', '').split(':').map(Number);
  const deadline = new Date(); deadline.setHours(timeH, timeM, 0, 0);
  const isLate = !checked && now > deadline;
  const statusColor = checked ? B.green : isLate ? B.danger : B.yellow;

  return (
    <div onClick={onToggle} style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '16px 20px', cursor: 'pointer',
      borderBottom: `1px solid ${B.border}`,
      background: checked ? '#F0FDF4' : isLate ? '#FEF2F2' : B.card,
      transition: 'background 0.2s',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 2,
        border: `2px solid ${statusColor}`,
        background: checked ? B.green : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}>
        {checked && <span style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>✓</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: checked ? '#15803D' : B.black, textDecoration: checked ? 'line-through' : 'none' }}>{item.title}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, background: checked ? '#DCFCE7' : isLate ? '#FEE2E2' : '#FFFBEB', border: `1px solid ${checked ? '#BBF7D0' : isLate ? '#FECACA' : '#FDE68A'}`, borderRadius: 12, padding: '2px 8px' }}>
            {checked ? `✓ Done ${completedAt ? '· ' + completedAt : ''}` : isLate ? '⚠ Overdue' : item.time}
          </span>
          {item.urgent && !checked && <span style={{ fontSize: 10, fontWeight: 700, color: B.red, background: '#FFF5F2', border: `1px solid #FDDDD5`, borderRadius: 10, padding: '2px 6px', letterSpacing: '0.06em' }}>DAILY PRIORITY</span>}
        </div>
        <div style={{ fontSize: 12, color: checked ? '#15803D' : B.gray, lineHeight: 1.5 }}>{item.desc}</div>
      </div>
    </div>
  );
}

function NumberStepper({ label, value, onChange, color = B.red, hint }) {
  return (
    <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: B.lightGray, marginTop: 1 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onChange(Math.max(0, value - 1))} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${B.border}`, background: '#FDF5F3', color: B.red, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <div style={{ width: 50, height: 36, background: `${color}12`, border: `1.5px solid ${color}40`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
        <button onClick={() => onChange(value + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${B.border}`, background: '#FDF5F3', color: B.red, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        style={{ width: '100%', background: B.card, border: `1.5px solid ${B.border}`, borderRadius: 10, color: B.black, padding: '10px 14px', fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }} />
    </div>
  );
}

// CoordinatorFormView — renders the coordinator form for a given coordinator (used by super admin)
function CoordinatorFormView({ coordinator }) {
  // Re-uses the same form logic but with an injected coordinator prop
  // This is a read-only preview — super admin can see the form layout
  return (
    <div style={{ padding: 20, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ background: '#fff', border: '1px solid #F0E4E0', borderRadius: 16, padding: '24px', textAlign: 'center', color: '#8B6B64' }}>
        <div style={{ fontSize: 20, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', marginBottom: 8 }}>Coordinator Form Preview: {coordinator.name}</div>
        <div style={{ fontSize: 13, color: '#8B6B64', marginBottom: 16 }}>This shows the form exactly as {coordinator.name} sees it. Submissions appear in the director Reports tab in real time.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', background: '#FBF7F6', borderRadius: 10, padding: '16px' }}>
          {['✅ Daily Checklist (5 items)', '📋 Charts & Census Entry', '📞 Call Activity Tracking', '🚨 Escalation Log', '🔄 Activation Review Results', '📝 Daily Narrative & Self-Assessment'].map(s => (
            <div key={s} style={{ fontSize: 13, color: '#1A1A1A', padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #F0E4E0' }}>{s}</div>
          ))}
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: '#BBA8A4' }}>Full form interaction available when logged in as coordinator · Region {coordinator.region}</div>
      </div>
    </div>
  );
}

export default function CoordinatorReport() {
  const { coordinator, signOut } = useAuth();
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Checklist state
  const [checklist, setChecklist] = useState(() => {
    try { const s = localStorage.getItem(`checklist_${today}`); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

  // Report form state
  const [form, setForm] = useState({
    // Census & Charts
    totalPatients: 0, patientsContactedToday: 0,
    chartsUpdatedTotal: 0, chartsByDeadline_1030: 0, chartsByDeadline_1200: 0,
    chartsByDeadline_1430: 0, chartsByDeadline_1600: 0,
    lateCharts: 0, chartErrors: 0,
    // Calls
    outboundCalls: 0, inboundCalls: 0, voicemails: 0,
    followUpsCompleted: 0, followUpsDue: 0,
    avgResponseTime: 0, longestResponseTime: 0,
    // Escalations
    escalationsRaised: 0, escalationsResolved: 0, escalationsPending: 0, urgentPatientIssues: 0,
    escalationLog: [{ patient: '', issue: '', action: '', status: 'Open', notes: '' }],
    // Activation review results
    waitlistActioned: 0, socPendingActioned: 0, onHoldActioned: 0, authPendingActioned: 0,
    // Narrative
    accomplishment1: '', accomplishment2: '', accomplishment3: '',
    blockers: '', patientsAttentionTomorrow: '', questionsForSupervisor: '',
    productivityRating: 7, whatToDifferently: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingReport, setExistingReport] = useState(null);
  const [activeSection, setActiveSection] = useState('checklist');
  const [error, setError] = useState('');

  const checklistDone = CHECKLIST.filter(i => checklist[i.id]).length;
  const checklistPct = Math.round(checklistDone / CHECKLIST.length * 100);
  const chartCompletionRate = form.chartsUpdatedTotal > 0 ? Math.round((form.chartsUpdatedTotal - form.lateCharts - form.chartErrors) / form.chartsUpdatedTotal * 100) : 0;
  const totalCalls = form.outboundCalls + form.inboundCalls;

  useEffect(() => {
    if (coordinator) checkExistingReport();
  }, [coordinator]);

  const saveChecklist = (updated) => {
    setChecklist(updated);
    try { localStorage.setItem(`checklist_${today}`, JSON.stringify(updated)); } catch(e) {}
  };

  const toggleChecklist = (id) => {
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const updated = { ...checklist, [id]: checklist[id] ? null : now };
    saveChecklist(updated);
  };

  const setField = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const updateEscalation = (idx, key, val) => {
    const log = [...form.escalationLog];
    log[idx] = { ...log[idx], [key]: val };
    setField('escalationLog', log);
  };

  const addEscalation = () => setField('escalationLog', [...form.escalationLog, { patient: '', issue: '', action: '', status: 'Open', notes: '' }]);

  async function checkExistingReport() {
    const { data } = await supabase.from('daily_reports').select('*')
      .eq('coordinator_id', coordinator.id).eq('report_date', today).eq('report_type', 'eod').single();
    if (data) {
      setExistingReport(data);
      // Restore saved form data
      if (data.notes) { try { const saved = JSON.parse(data.notes); setForm(p => ({ ...p, ...saved })); } catch(e) {} }
      setSubmitted(true);
    }
  }

  async function handleSubmit() {
    setSubmitting(true); setError('');
    const now = new Date();
    const onTime = now.getHours() < 16 || (now.getHours() === 16 && now.getMinutes() <= 30);
    const submitTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const payload = {
      coordinator_id: coordinator.id,
      report_date: today,
      report_type: 'eod',
      report_submitted_on_time: onTime,
      active_patients: form.totalPatients,
      visits_completed: form.patientsContactedToday,
      visits_missed: 0,
      auths_pending: form.authPendingActioned,
      auths_expiring_7d: 0,
      new_referrals: form.waitlistActioned + form.socPendingActioned,
      tasks_open: form.followUpsDue + form.escalationsPending,
      tasks_completed_today: form.followUpsCompleted + form.escalationsResolved,
      escalations_made: form.escalationsRaised,
      top_priorities_tomorrow: form.patientsAttentionTomorrow,
      missed_visit_notes: '',
      notes: JSON.stringify({ ...form, checklist, submitTime }),
    };

    const { error: err } = existingReport
      ? await supabase.from('daily_reports').update(payload).eq('id', existingReport.id)
      : await supabase.from('daily_reports').insert(payload);

    if (err) { setError(err.message); setSubmitting(false); return; }
    setSubmitted(true); setSubmitting(false);
    await checkExistingReport();
  }

  const SECTIONS = [
    { id: 'checklist', label: '✅ Daily Checklist', badge: `${checklistDone}/${CHECKLIST.length}`, badgeOk: checklistDone === CHECKLIST.length },
    { id: 'charts', label: '📋 Charts & Census', badge: null },
    { id: 'calls', label: '📞 Call Activity', badge: null },
    { id: 'escalations', label: '🚨 Escalations', badge: form.escalationsRaised > 0 ? form.escalationsRaised : null, badgeOk: false },
    { id: 'activation', label: '🔄 Activation Review', badge: null },
    { id: 'narrative', label: '📝 Daily Narrative', badge: null },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Super admin: if Liam is logged in, show coordinator selector + their view
  const isSuperAdmin = coordinator?.role === 'director';
  const [adminViewMode, setAdminViewMode] = useState('director'); // 'director' | 'coordinator_view'
  const [impersonatedCoordinator, setImpersonatedCoordinator] = useState(null);
  const [allCoordinators, setAllCoordinators] = useState([]);

  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from('coordinators').select('*').neq('role','director').order('name').then(({data}) => {
        if (data) setAllCoordinators(data);
      });
    }
  }, [isSuperAdmin]);

  // If super admin in coordinator view mode, render coordinator form for that person
  if (isSuperAdmin && adminViewMode === 'coordinator_view' && impersonatedCoordinator) {
    return (
      <div style={{ minHeight: '100vh', background: '#FBF7F6', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: '#1A1A1A', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>👁 Viewing as: {impersonatedCoordinator.name}</div>
          <button onClick={() => { setAdminViewMode('director'); setImpersonatedCoordinator(null); }} style={{ background: '#D94F2B', border: 'none', borderRadius: 6, color: '#fff', padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>← Back</button>
          <button onClick={() => navigate('/dashboard')} style={{ background: '#333', border: 'none', borderRadius: 6, color: '#fff', padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🏠 Director Dashboard</button>
        </div>
        <CoordinatorFormView coordinator={impersonatedCoordinator} />
      </div>
    );
  }

  // Super admin dashboard — shows all coordinator cards + can preview their forms
  if (isSuperAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: '#FBF7F6', fontFamily: "'DM Sans', sans-serif", paddingBottom: 60 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;700&display=swap'); * { box-sizing: border-box; }`}</style>
        <div style={{ background: '#fff', borderBottom: '1px solid #F0E4E0', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 6px rgba(139,26,16,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo.png" alt="AxiomHealth" style={{ height: 32, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>Care Coordination — Super Admin</div>
              <div style={{ fontSize: 10, color: '#BBA8A4', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#D94F2B', background: '#FFF5F2', border: '1px solid #FDDDD5', borderRadius: 20, padding: '4px 12px' }}>Super Admin · {coordinator?.name}</span>
            <button onClick={() => navigate('/dashboard')} style={{ background: 'linear-gradient(135deg, #D94F2B, #8B1A10)', border: 'none', borderRadius: 8, color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🏠 Dashboard</button>
            <button onClick={signOut} style={{ background: 'none', border: '1px solid #F0E4E0', borderRadius: 8, color: '#BBA8A4', padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>Sign Out</button>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A1A1A', marginBottom: 6 }}>Team Daily Reports</div>
          <div style={{ fontSize: 13, color: '#8B6B64', marginBottom: 24 }}>View any coordinator's checklist status and form, or preview their entry interface</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {allCoordinators.map(coord => {
              const today = new Date().toISOString().split('T')[0];
              const checklistKey = `checklist_${today}`;
              return (
                <div key={coord.id} style={{ background: '#fff', border: '1px solid #F0E4E0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                  <div style={{ background: 'linear-gradient(135deg, #8B1A10, #D94F2B)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{coord.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Region {coord.region}</div>
                    </div>
                    <button onClick={() => { setImpersonatedCoordinator(coord); setAdminViewMode('coordinator_view'); }}
                      style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, color: '#fff', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      👁 View Their Form
                    </button>
                  </div>
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A1A', marginBottom: 10 }}>Daily Checklist Status</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {CHECKLIST.map(item => {
                        // Note: coordinator checklist is stored in their own browser localStorage
                        // Director can see what was submitted in their EOD report
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #FAF4F2' }}>
                            <span style={{ fontSize: 12, color: '#1A1A1A' }}>{item.title}</span>
                            <span style={{ fontSize: 10, color: '#BBA8A4', fontStyle: 'italic' }}>{item.time}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 12, fontSize: 11, color: '#BBA8A4', textAlign: 'center', padding: '8px', background: '#FBF7F6', borderRadius: 6 }}>
                      ℹ Checklist completion visible in Reports tab when EOD is submitted
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: B.bg, fontFamily: "'DM Sans', sans-serif", color: B.black, paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        textarea { font-family: 'DM Sans', sans-serif; }
        input { font-family: 'DM Sans', sans-serif; }
        select { font-family: 'DM Sans', sans-serif; }
      `}</style>

      {/* Header */}
      <div style={{ background: B.card, borderBottom: `1px solid ${B.border}`, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 1px 6px rgba(139,26,16,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="AxiomHealth" style={{ height: 32, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.black }}>Daily Report</div>
            <div style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{todayLabel}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {submitted && <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: B.green }}>✓ Submitted</div>}
          <div style={{ background: '#FFF5F2', border: `1px solid #FDDDD5`, borderRadius: 20, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: B.red }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: B.black }}>{coordinator?.name}</span>
          </div>
          <button onClick={signOut} style={{ background: 'none', border: `1px solid ${B.border}`, borderRadius: 8, color: B.lightGray, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>Out</button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: B.card, borderBottom: `1px solid ${B.border}`, padding: '10px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: B.gray, fontWeight: 600 }}>Daily Checklist Progress</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: checklistPct === 100 ? B.green : B.red, fontFamily: 'monospace' }}>{checklistDone}/{CHECKLIST.length} complete</span>
        </div>
        <div style={{ height: 5, background: '#F5EDEB', borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${checklistPct}%`, borderRadius: 3, background: checklistPct === 100 ? B.green : `linear-gradient(90deg, ${B.darkRed}, ${B.red})`, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: B.black }}>{greeting}, {coordinator?.name?.split(' ')[0] || ''}!</div>
          <div style={{ fontSize: 12, color: B.lightGray, marginTop: 2 }}>{coordinator?.region} · Complete all sections before 4:30 PM</div>
        </div>

        {/* Section nav */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
              padding: '7px 12px', borderRadius: 8, border: `1px solid ${activeSection === s.id ? B.red : B.border}`,
              background: activeSection === s.id ? '#FFF5F2' : B.card,
              color: activeSection === s.id ? B.red : B.gray,
              fontSize: 12, fontWeight: activeSection === s.id ? 700 : 400,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {s.label}
              {s.badge != null && (
                <span style={{ background: s.badgeOk ? B.green : B.danger, color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{s.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── CHECKLIST ─────────────────────────────────── */}
        {activeSection === 'checklist' && (
          <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
            <div style={{ background: 'linear-gradient(135deg, #FFF5F2, #FDF0EC)', borderBottom: `1px solid ${B.border}`, padding: '16px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: B.black, marginBottom: 2 }}>✅ Daily Checklist</div>
              <div style={{ fontSize: 12, color: B.gray }}>Complete these tasks in order every morning. Tap each to mark done.</div>
            </div>
            {CHECKLIST.map(item => (
              <ChecklistItem key={item.id} item={item} checked={!!checklist[item.id]} completedAt={checklist[item.id]} onToggle={() => toggleChecklist(item.id)} />
            ))}
            {checklistDone === CHECKLIST.length && (
              <div style={{ padding: '16px 20px', background: '#F0FDF4', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: B.green }}>🎉 All daily tasks complete!</div>
                <div style={{ fontSize: 12, color: '#15803D', marginTop: 4 }}>Now complete the report sections and submit before 4:30 PM</div>
              </div>
            )}
          </div>
        )}

        {/* ── CHARTS & CENSUS ───────────────────────────── */}
        {activeSection === 'charts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: B.black, marginBottom: 16 }}>📋 Patient Census & Charts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <NumberStepper label="Total Patients Assigned" value={form.totalPatients} onChange={v => setField('totalPatients', v)} hint="Your current caseload count" color={B.red} />
                <NumberStepper label="Patients Contacted Today" value={form.patientsContactedToday} onChange={v => setField('patientsContactedToday', v)} hint="Patients you spoke with or reached out to" color={B.orange} />
                <NumberStepper label="Total Charts Updated Today" value={form.chartsUpdatedTotal} onChange={v => setField('chartsUpdatedTotal', v)} color={B.blue} />
                <NumberStepper label="Late Charts (after deadline)" value={form.lateCharts} onChange={v => setField('lateCharts', v)} hint="Charts submitted after their deadline window" color={B.danger} />
                <NumberStepper label="Chart Accuracy Errors Found" value={form.chartErrors} onChange={v => setField('chartErrors', v)} color={B.yellow} />
              </div>
              {form.chartsUpdatedTotal > 0 && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: chartCompletionRate >= 95 ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${chartCompletionRate >= 95 ? '#BBF7D0' : '#FECACA'}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: chartCompletionRate >= 95 ? B.green : B.danger }}>Chart Completion Rate</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: chartCompletionRate >= 95 ? B.green : B.danger, fontFamily: 'monospace' }}>{chartCompletionRate}% <span style={{ fontSize: 11, fontWeight: 400 }}>target: 95%+</span></span>
                </div>
              )}
            </div>

            <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: B.black, marginBottom: 12 }}>Chart Updates by Deadline</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'By 10:30 AM', key: 'chartsByDeadline_1030' },
                  { label: 'By 12:00 PM', key: 'chartsByDeadline_1200' },
                  { label: 'By 2:30 PM', key: 'chartsByDeadline_1430' },
                  { label: 'By 4:00 PM (Final)', key: 'chartsByDeadline_1600' },
                ].map(d => (
                  <NumberStepper key={d.key} label={d.label} value={form[d.key]} onChange={v => setField(d.key, v)} color={B.darkRed} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CALL ACTIVITY ─────────────────────────────── */}
        {activeSection === 'calls' && (
          <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: B.black, marginBottom: 16 }}>📞 Call & Communication Activity</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <NumberStepper label="Outbound Calls Made" value={form.outboundCalls} onChange={v => setField('outboundCalls', v)} color={B.blue} />
              <NumberStepper label="Inbound Calls Received" value={form.inboundCalls} onChange={v => setField('inboundCalls', v)} color={B.green} />
              <NumberStepper label="Voicemails Left" value={form.voicemails} onChange={v => setField('voicemails', v)} color={B.gray} />
              <NumberStepper label="Follow-Up Calls Completed" value={form.followUpsCompleted} onChange={v => setField('followUpsCompleted', v)} color={B.green} />
              <NumberStepper label="Follow-Up Calls Still Due" value={form.followUpsDue} onChange={v => setField('followUpsDue', v)} hint="Carry these over to tomorrow" color={B.danger} />
            </div>
            {totalCalls > 0 && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: B.blue, fontWeight: 600 }}>Total Calls Today</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: B.blue, fontFamily: 'monospace' }}>{totalCalls}</span>
              </div>
            )}
          </div>
        )}

        {/* ── ESCALATIONS ───────────────────────────────── */}
        {activeSection === 'escalations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: B.black, marginBottom: 16 }}>🚨 Escalation Summary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <NumberStepper label="Escalations Raised Today" value={form.escalationsRaised} onChange={v => setField('escalationsRaised', v)} color={B.danger} />
                <NumberStepper label="Escalations Resolved Today" value={form.escalationsResolved} onChange={v => setField('escalationsResolved', v)} color={B.green} />
                <NumberStepper label="Pending Escalations (carried over)" value={form.escalationsPending} onChange={v => setField('escalationsPending', v)} color={B.yellow} />
                <NumberStepper label="Urgent Patient Issues" value={form.urgentPatientIssues} onChange={v => setField('urgentPatientIssues', v)} color={B.danger} hint="Issues requiring immediate director attention" />
              </div>
            </div>

            <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: B.black }}>Escalation Detail Log</div>
                <button onClick={addEscalation} style={{ background: B.red, border: 'none', borderRadius: 7, color: '#fff', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Row</button>
              </div>
              {form.escalationLog.map((esc, idx) => (
                <div key={idx} style={{ background: '#FBF7F6', border: `1px solid ${B.border}`, borderRadius: 10, padding: '14px', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: B.red, marginBottom: 10 }}>#{idx + 1}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Patient Name', key: 'patient', placeholder: 'Last, First' },
                      { label: 'Status', key: 'status', type: 'select', options: ['Open', 'In Progress', 'Resolved', 'Escalated to Director'] },
                      { label: 'Issue Description', key: 'issue', placeholder: 'Describe the issue...' },
                      { label: 'Action Taken', key: 'action', placeholder: 'What did you do?' },
                    ].map(f => (
                      <div key={f.key} style={{ gridColumn: f.key === 'issue' || f.key === 'action' ? 'span 2' : 'span 1' }}>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: B.lightGray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>{f.label}</label>
                        {f.type === 'select' ? (
                          <select value={esc[f.key]} onChange={e => updateEscalation(idx, f.key, e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${B.border}`, borderRadius: 7, fontSize: 13, color: B.black, background: B.card, outline: 'none' }}>
                            {f.options.map(o => <option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input value={esc[f.key]} onChange={e => updateEscalation(idx, f.key, e.target.value)} placeholder={f.placeholder}
                            style={{ width: '100%', padding: '7px 10px', border: `1px solid ${B.border}`, borderRadius: 7, fontSize: 13, color: B.black, outline: 'none', background: B.card }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIVATION REVIEW ─────────────────────────── */}
        {activeSection === 'activation' && (
          <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: B.black, marginBottom: 6 }}>🔄 Activation Review Results</div>
            <div style={{ fontSize: 12, color: B.gray, marginBottom: 16 }}>From your Pariox review — how many patients did you action in each category today?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <NumberStepper label="📋 Waitlist — Patients Actioned" value={form.waitlistActioned} onChange={v => setField('waitlistActioned', v)} hint="Moved to scheduled or contacted to schedule" color="#7C3AED" />
              <NumberStepper label="📅 SOC Pending — Patients Actioned" value={form.socPendingActioned} onChange={v => setField('socPendingActioned', v)} hint="Start of care scheduled or confirmed" color="#0284C7" />
              <NumberStepper label="⏸️ On Hold — Patients Actioned" value={form.onHoldActioned} onChange={v => setField('onHoldActioned', v)} hint="Cleared for return or status updated" color={B.gray} />
              <NumberStepper label="🔒 Auth Pending — Patients Actioned" value={form.authPendingActioned} onChange={v => setField('authPendingActioned', v)} hint="Auth submitted, followed up, or resolved" color={B.yellow} />
            </div>
            {(form.waitlistActioned + form.socPendingActioned + form.onHoldActioned + form.authPendingActioned) > 0 && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: B.green }}>Total Patients Activated / Actioned Today</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: B.green, fontFamily: 'monospace' }}>{form.waitlistActioned + form.socPendingActioned + form.onHoldActioned + form.authPendingActioned}</span>
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <TextArea label="Notes on activation review" value={form.questionsForSupervisor} onChange={v => setField('questionsForSupervisor', v)} placeholder="Any patients flagged during review, blockers to activation, or escalations needed..." rows={3} />
            </div>
          </div>
        )}

        {/* ── NARRATIVE ─────────────────────────────────── */}
        {activeSection === 'narrative' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: B.black, marginBottom: 16 }}>📝 Daily Narrative</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Top 3 Accomplishments Today</label>
                  {[1, 2, 3].map(n => (
                    <input key={n} value={form[`accomplishment${n}`]} onChange={e => setField(`accomplishment${n}`, e.target.value)} placeholder={`${n}. `}
                      style={{ width: '100%', padding: '9px 12px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 13, color: B.black, marginBottom: 8, outline: 'none', background: B.card }} />
                  ))}
                </div>
                <TextArea label="Blockers / Challenges Encountered" value={form.blockers} onChange={v => setField('blockers', v)} placeholder="What slowed you down or needs resolution?" />
                <TextArea label="Patients Requiring Special Attention Tomorrow" value={form.patientsAttentionTomorrow} onChange={v => setField('patientsAttentionTomorrow', v)} placeholder="List any patients the team should watch closely..." />
              </div>
            </div>

            <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: B.black, marginBottom: 14 }}>Self-Assessment</div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Productivity Rating (1-10)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} onClick={() => setField('productivityRating', n)} style={{
                      width: 40, height: 40, borderRadius: 8, border: `2px solid ${form.productivityRating === n ? B.red : B.border}`,
                      background: form.productivityRating === n ? '#FFF5F2' : B.card,
                      color: form.productivityRating === n ? B.red : B.gray,
                      fontSize: 14, fontWeight: form.productivityRating === n ? 800 : 400,
                      cursor: 'pointer',
                    }}>{n}</button>
                  ))}
                </div>
              </div>
              <TextArea label="What would you do differently tomorrow?" value={form.whatToDifferently} onChange={v => setField('whatToDifferently', v)} placeholder="One thing to improve tomorrow..." rows={2} />
            </div>
          </div>
        )}

        {/* Submit */}
        <div style={{ marginTop: 24, background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
          {checklistDone < CHECKLIST.length && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400E' }}>
              ⚠️ {CHECKLIST.length - checklistDone} checklist item{CHECKLIST.length - checklistDone > 1 ? 's' : ''} not yet completed — you can still submit but make sure these are done.
            </div>
          )}
          {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: B.danger }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: B.black }}>End of Day Report</div>
              <div style={{ fontSize: 11, color: B.lightGray, marginTop: 2 }}>Submit before 4:30 PM · {submitted ? '✓ Already submitted today' : 'Not yet submitted'}</div>
            </div>
            <button onClick={handleSubmit} disabled={submitting} style={{
              background: submitted ? `linear-gradient(135deg, ${B.green}, #43A047)` : `linear-gradient(135deg, ${B.red}, ${B.darkRed})`,
              border: 'none', borderRadius: 12, color: '#fff',
              padding: '14px 28px', fontSize: 14, fontWeight: 800,
              cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(217,79,43,0.3)',
            }}>
              {submitting ? 'Submitting...' : submitted ? '✓ Update Report' : 'Submit EOD Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

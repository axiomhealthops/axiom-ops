import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const FIELD = (label, key, color = '#00D4FF', hint = '') => ({ label, key, color, hint });

const MORNING_FIELDS = [
  FIELD('Active Patients', 'active_patients', '#00D4FF', 'Total patients in your caseload'),
  FIELD('Visits Scheduled Today', 'visits_scheduled', '#00FF9C', 'How many visits are on the schedule today'),
  FIELD('Visits Confirmed', 'visits_completed', '#00FF9C', 'Visits confirmed as of this morning'),
  FIELD('Auths Pending', 'auths_pending', '#FFB800', 'Total authorizations awaiting approval'),
  FIELD('Auths Expiring ≤7 Days', 'auths_expiring_7d', '#FF4444', 'Auths expiring within 7 days — URGENT'),
  FIELD('New Referrals (Last 24h)', 'new_referrals', '#B388FF', 'Referrals received since yesterday'),
  FIELD('Open Tasks', 'tasks_open', '#FF6B35', 'Tasks not yet completed'),
];

const EOD_FIELDS = [
  FIELD('Visits Completed', 'visits_completed', '#00FF9C', 'Total visits completed today'),
  FIELD('Visits Missed', 'visits_missed', '#FF4444', 'Visits that did not occur'),
  FIELD('Auths Denied Today', 'auths_denied', '#FF4444', 'Denial decisions received today'),
  FIELD('Escalations Made', 'escalations_made', '#FFB800', 'Patient issues escalated to clinical lead'),
  FIELD('Tasks Completed Today', 'tasks_completed_today', '#00FF9C', 'Tasks you closed out today'),
  FIELD('Tasks Still Open', 'tasks_open', '#FF6B35', 'Tasks carrying over to tomorrow'),
];

function NumberInput({ field, value, onChange }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      transition: 'border-color 0.2s'
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{field.label}</div>
        {field.hint && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{field.hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onChange(Math.max(0, value - 1))} style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit'
        }}>−</button>
        <div style={{
          width: 56, height: 40, background: `${field.color}15`, border: `1px solid ${field.color}40`,
          borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800, color: field.color, fontFamily: "'DM Mono', monospace"
        }}>{value}</div>
        <button onClick={() => onChange(value + 1)} style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit'
        }}>+</button>
      </div>
    </div>
  );
}

export default function CoordinatorReport() {
  const { coordinator } = useAuth();
  const [reportType, setReportType] = useState('morning');
  const [values, setValues] = useState({
    active_patients: 0, visits_scheduled: 0, visits_completed: 0,
    visits_missed: 0, auths_pending: 0, auths_expiring_7d: 0,
    auths_denied: 0, new_referrals: 0, tasks_open: 0,
    tasks_completed_today: 0, escalations_made: 0,
    missed_visit_notes: '', top_priorities_tomorrow: '', notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [existingReport, setExistingReport] = useState(null);
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const fields = reportType === 'morning' ? MORNING_FIELDS : EOD_FIELDS;

  useEffect(() => {
    if (coordinator) checkExistingReport();
  }, [coordinator, reportType]);

  async function checkExistingReport() {
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('coordinator_id', coordinator.id)
      .eq('report_date', today)
      .eq('report_type', reportType)
      .single();

    if (data) {
      setExistingReport(data);
      setValues(prev => ({ ...prev, ...data }));
      setSubmitted(true);
    } else {
      setExistingReport(null);
      setSubmitted(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');

    const now = new Date();
    const hour = now.getHours();
    const onTime = reportType === 'morning' ? hour < 9 : hour < 17;

    const payload = {
      coordinator_id: coordinator.id,
      report_date: today,
      report_type: reportType,
      report_submitted_on_time: onTime,
      ...values
    };

    const { error: err } = existingReport
      ? await supabase.from('daily_reports').update(payload).eq('id', existingReport.id)
      : await supabase.from('daily_reports').insert(payload);

    if (err) { setError(err.message); setSubmitting(false); return; }

    setSubmitted(true);
    setSubmitting(false);
    await checkExistingReport();
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{
      minHeight: '100vh', background: '#070B12',
      fontFamily: "'DM Sans', sans-serif", color: '#fff',
      padding: '0 0 60px'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        textarea.ax-textarea {
          width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: #fff; padding: 12px 16px; font-size: 13px;
          font-family: 'DM Sans', sans-serif; outline: none; resize: vertical; min-height: 80px;
          transition: border-color 0.2s;
        }
        textarea.ax-textarea:focus { border-color: rgba(0,212,255,0.4); }
        textarea.ax-textarea::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>

      {/* Header */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #0066FF, #00D4FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800
          }}>A</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>AxiomHealth</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Daily Report</div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: coordinator?.color ? `${coordinator.color}15` : 'rgba(255,255,255,0.06)',
          border: `1px solid ${coordinator?.color || 'rgba(255,255,255,0.1)'}40`,
          borderRadius: 20, padding: '6px 14px'
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: coordinator?.color || '#00D4FF' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{coordinator?.name || 'Loading...'}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{coordinator?.region}</span>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '28px 20px' }}>
        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            {greeting}, {coordinator?.name?.split(' ')[0] || ''}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Report Type Toggle */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28,
          background: 'rgba(255,255,255,0.03)', padding: 6, borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.07)'
        }}>
          {['morning', 'eod'].map(type => (
            <button key={type} onClick={() => setReportType(type)} style={{
              padding: '12px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              transition: 'all 0.2s',
              background: reportType === type ? (type === 'morning' ? '#00D4FF' : '#B388FF') : 'transparent',
              color: reportType === type ? '#080C14' : 'rgba(255,255,255,0.4)',
              boxShadow: reportType === type ? '0 2px 12px rgba(0,180,255,0.3)' : 'none'
            }}>
              {type === 'morning' ? '☀️ Morning Report' : '🌙 EOD Report'}
            </button>
          ))}
        </div>

        {/* Due time reminder */}
        <div style={{
          background: reportType === 'morning' ? 'rgba(0,212,255,0.06)' : 'rgba(179,136,255,0.06)',
          border: `1px solid ${reportType === 'morning' ? 'rgba(0,212,255,0.2)' : 'rgba(179,136,255,0.2)'}`,
          borderRadius: 10, padding: '10px 16px', marginBottom: 24,
          fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span>⏰</span>
          <span>{reportType === 'morning' ? 'Morning reports due by 9:00 AM' : 'EOD reports due by 4:30 PM'}</span>
          {submitted && <span style={{ marginLeft: 'auto', color: '#00FF9C', fontWeight: 700 }}>✓ Submitted</span>}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {fields.map(field => (
            <NumberInput
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={val => setValues(prev => ({ ...prev, [field.key]: val }))}
            />
          ))}
        </div>

        {/* Text fields */}
        {reportType === 'morning' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Patients / Issues to Flag
            </label>
            <textarea className="ax-textarea" value={values.notes}
              onChange={e => setValues(p => ({ ...p, notes: e.target.value }))}
              placeholder="Any patients at risk, scheduling issues, or concerns for today..." />
          </div>
        )}

        {reportType === 'eod' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Missed Visit Notes
              </label>
              <textarea className="ax-textarea" value={values.missed_visit_notes}
                onChange={e => setValues(p => ({ ...p, missed_visit_notes: e.target.value }))}
                placeholder="For each missed visit: patient, reason, and rescheduled date..." />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Top 3 Priorities Tomorrow
              </label>
              <textarea className="ax-textarea" value={values.top_priorities_tomorrow}
                onChange={e => setValues(p => ({ ...p, top_priorities_tomorrow: e.target.value }))}
                placeholder="1. &#10;2. &#10;3. " />
            </div>
          </>
        )}

        {error && (
          <div style={{
            background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: 13, color: '#FF6B6B'
          }}>{error}</div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting} style={{
          width: '100%', padding: '16px', border: 'none', borderRadius: 12,
          background: submitted
            ? 'linear-gradient(135deg, #00C853, #00FF9C)'
            : reportType === 'morning'
            ? 'linear-gradient(135deg, #0066FF, #00D4FF)'
            : 'linear-gradient(135deg, #6600FF, #B388FF)',
          color: submitted ? '#070B12' : '#fff',
          fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1,
          boxShadow: '0 4px 20px rgba(0,100,255,0.25)',
          transition: 'all 0.2s'
        }}>
          {submitting ? 'Submitting...' : submitted ? '✓ Report Submitted — Update' : `Submit ${reportType === 'morning' ? 'Morning' : 'EOD'} Report`}
        </button>

        {submitted && (
          <div style={{
            marginTop: 16, textAlign: 'center',
            fontSize: 13, color: '#00FF9C'
          }}>
            Report received ✓ — Your director has been notified
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell
} from 'recharts';

const VISIT_TARGET = 800;
const COORDINATOR_CAP = 80;

const COORD_COLORS = {
  'Gypsy': '#00D4FF',
  'Mary': '#00FF9C',
  'Audrey': '#FF6B35',
  'April': '#B388FF',
};

function StatCard({ label, value, sub, color = '#00D4FF', alert, icon, size = 'normal' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${alert ? 'rgba(255,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 14, padding: size === 'large' ? '22px 24px' : '18px 20px',
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'monospace' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: size === 'large' ? 38 : 28, fontWeight: 800, color, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>{sub}</div>}
      {alert && <div style={{ fontSize: 11, color: '#FF6B6B', marginTop: 5, fontWeight: 600 }}>{alert}</div>}
    </div>
  );
}

function CoordRow({ report, coordinator }) {
  const color = COORD_COLORS[coordinator?.name] || '#00D4FF';
  const caseload = report?.active_patients || 0;
  const caseloadColor = caseload > 150 ? '#FF4444' : caseload > 80 ? '#FFB800' : caseload < 50 ? '#B388FF' : '#00FF9C';
  const completionRate = report?.visits_scheduled > 0
    ? Math.round((report.visits_completed / report.visits_scheduled) * 100) : 0;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '180px 80px 80px 80px 80px 80px 80px 80px 1fr',
      gap: 0, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
      alignItems: 'center', transition: 'background 0.15s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 3, height: 32, background: color, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{coordinator?.name}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{coordinator?.region}</div>
        </div>
      </div>

      {[
        { val: caseload, color: caseloadColor },
        { val: report?.visits_scheduled || 0, color: '#fff' },
        { val: report?.visits_completed || 0, color: '#00FF9C' },
        { val: report?.visits_missed || 0, color: (report?.visits_missed || 0) > 3 ? '#FF4444' : '#FFB800' },
        { val: report?.auths_expiring_7d || 0, color: (report?.auths_expiring_7d || 0) > 2 ? '#FF4444' : '#FFB800' },
        { val: report?.new_referrals || 0, color: '#B388FF' },
        { val: report?.tasks_open || 0, color: (report?.tasks_open || 0) > 8 ? '#FF4444' : '#FF6B35' },
      ].map((cell, i) => (
        <div key={i} style={{
          textAlign: 'center', fontSize: 15, fontWeight: 700,
          fontFamily: "'DM Mono', monospace", color: cell.color
        }}>{cell.val}</div>
      ))}

      <div style={{ paddingLeft: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{
              height: '100%', width: `${completionRate}%`, borderRadius: 2,
              background: completionRate > 85 ? '#00FF9C' : completionRate > 70 ? '#FFB800' : '#FF4444'
            }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', width: 30 }}>{completionRate}%</span>
          {!report && (
            <span style={{
              fontSize: 10, color: '#FF4444', background: 'rgba(255,68,68,0.1)',
              border: '1px solid rgba(255,68,68,0.3)', borderRadius: 4, padding: '2px 6px',
              letterSpacing: '0.06em', fontWeight: 700
            }}>NO REPORT</span>
          )}
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#0F1520', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10, padding: '10px 14px', fontSize: 12
      }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, fontFamily: 'monospace', fontWeight: 700 }}>
            {p.name}: {p.value}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function DirectorDashboard() {
  const { coordinator: dirCoord, signOut } = useAuth();
  const [coordinators, setCoordinators] = useState([]);
  const [morningReports, setMorningReports] = useState([]);
  const [eodReports, setEodReports] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date());
  const [manualVisits, setManualVisits] = useState(650);

  useEffect(() => {
    loadData();
    const t = setInterval(() => setTime(new Date()), 1000);
    // Real-time subscription
    const sub = supabase
      .channel('reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, loadData)
      .subscribe();
    return () => { clearInterval(t); sub.unsubscribe(); };
  }, []);

  const loadData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const [coordRes, morningRes, eodRes] = await Promise.all([
      supabase.from('coordinators').select('*').neq('role', 'director').order('name'),
      supabase.from('daily_reports').select('*').eq('report_date', today).eq('report_type', 'morning'),
      supabase.from('daily_reports').select('*').eq('report_date', today).eq('report_type', 'eod'),
    ]);

    // Build last 7 days for trend
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const { data: trendData } = await supabase
      .from('daily_reports')
      .select('report_date, visits_completed')
      .in('report_date', days)
      .eq('report_type', 'eod');

    const grouped = days.map(day => {
      const dayReports = (trendData || []).filter(r => r.report_date === day);
      const total = dayReports.reduce((s, r) => s + (r.visits_completed || 0), 0);
      return {
        day: new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
        visits: total, target: Math.round(VISIT_TARGET / 5)
      };
    });

    setCoordinators(coordRes.data || []);
    setMorningReports(morningRes.data || []);
    setEodReports(eodRes.data || []);
    setWeeklyData(grouped);
    setLoading(false);
  }, []);

  // Aggregate from morning reports
  const getReport = (coordId, reports) => reports.find(r => r.coordinator_id === coordId);
  const sum = (key, reports) => reports.reduce((s, r) => s + (r[key] || 0), 0);

  const totalPatients = sum('active_patients', morningReports);
  const totalScheduled = sum('visits_scheduled', morningReports);
  const totalCompleted = sum('visits_completed', eodReports.length > 0 ? eodReports : morningReports);
  const totalMissed = sum('visits_missed', eodReports);
  const totalAuthsPending = sum('auths_pending', morningReports);
  const totalAuthsExpiring = sum('auths_expiring_7d', morningReports);
  const totalReferrals = sum('new_referrals', morningReports);
  const totalOpenTasks = sum('tasks_open', morningReports);
  const reportsIn = morningReports.length;
  const visitPct = Math.round((manualVisits / VISIT_TARGET) * 100);
  const visitGap = VISIT_TARGET - manualVisits;

  const tabs = ['overview', 'team', 'trends', 'reports'];

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#070B12', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
        <div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading command center...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#070B12', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        .tab-btn { background: none; border: none; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; }
        .visits-input { background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.3); border-radius: 8px; color: #00D4FF; padding: 4px 10px; font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 800; width: 100px; text-align: center; outline: none; }
      `}</style>

      {/* Top Nav */}
      <div style={{
        background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(20px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #0066FF, #00D4FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15
          }}>A</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>AxiomHealth Command</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Care Coordination</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(tab => (
            <button key={tab} className="tab-btn" onClick={() => setActiveTab(tab)} style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: activeTab === tab ? '#080C14' : 'rgba(255,255,255,0.4)',
              background: activeTab === tab ? '#00D4FF' : 'transparent',
              border: activeTab === tab ? 'none' : '1px solid rgba(255,255,255,0.08)',
            }}>{tab}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#00D4FF' }}>
              {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
          <button onClick={signOut} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, color: 'rgba(255,255,255,0.5)', padding: '7px 12px',
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
          }}>Sign out</button>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <>
            {/* Weekly Target Banner */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,102,255,0.08), rgba(0,212,255,0.05))',
              border: '1px solid rgba(0,212,255,0.15)', borderRadius: 18,
              padding: '24px 32px', marginBottom: 24,
              display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Weekly Visit Target</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                  <input
                    className="visits-input"
                    type="number"
                    value={manualVisits}
                    onChange={e => setManualVisits(parseInt(e.target.value) || 0)}
                    title="Update weekly visit count"
                  />
                  <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)' }}>/ {VISIT_TARGET} visits/wk</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }}>
                  <div style={{
                    height: '100%', width: `${Math.min(visitPct, 100)}%`, borderRadius: 4,
                    background: visitPct >= 100 ? '#00FF9C' : visitPct >= 80 ? '#FFB800' : 'linear-gradient(90deg, #0066FF, #00D4FF)',
                    boxShadow: '0 0 12px rgba(0,180,255,0.4)', transition: 'width 0.5s ease'
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                  {visitPct}% of target — {visitGap > 0 ? `${visitGap} visits to reach sustainability` : '🎯 Target reached!'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[
                  { label: 'Reports In', value: `${reportsIn}/${coordinators.length}`, color: reportsIn < coordinators.length ? '#FF4444' : '#00FF9C' },
                  { label: 'Gap to 800', value: visitGap > 0 ? visitGap : '✓', color: visitGap > 0 ? '#FFB800' : '#00FF9C' },
                  { label: 'Auths Expiring', value: totalAuthsExpiring, color: totalAuthsExpiring > 5 ? '#FF4444' : '#FFB800' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 24 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: s.color, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Metric Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
              <StatCard icon="👥" label="Patient Census" value={totalPatients || '—'} sub="Total active patients" color="#00D4FF" />
              <StatCard icon="✅" label="Visits Today" value={totalCompleted || '—'} sub={`of ${totalScheduled || '—'} scheduled`} color="#00FF9C" />
              <StatCard icon="⚠️" label="Missed Visits" value={totalMissed || 0} sub="Require same-day reschedule" color={totalMissed > 5 ? '#FF4444' : '#FFB800'} alert={totalMissed > 5 ? 'Above threshold' : null} />
              <StatCard icon="📋" label="New Referrals" value={totalReferrals || 0} sub="Received today" color="#B388FF" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
              <StatCard icon="🔒" label="Auths Pending" value={totalAuthsPending || 0} sub="Awaiting approval" color="#FFB800" />
              <StatCard icon="⏰" label="Auths Expiring" value={totalAuthsExpiring || 0} sub="Within 7 days" color={totalAuthsExpiring > 3 ? '#FF4444' : '#FFB800'} alert={totalAuthsExpiring > 3 ? 'Action required today' : null} />
              <StatCard icon="📌" label="Open Tasks" value={totalOpenTasks || 0} sub="Team total" color="#FF6B35" />
              <StatCard icon="📊" label="Morning Reports" value={`${reportsIn}/${coordinators.length}`} sub="Submitted by 9 AM" color={reportsIn < coordinators.length ? '#FF4444' : '#00FF9C'} alert={reportsIn < coordinators.length ? `${coordinators.length - reportsIn} missing` : null} />
            </div>

            {/* Alerts */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>Live Alerts</div>
              {coordinators.filter(c => !morningReports.find(r => r.coordinator_id === c.id)).map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(255,68,68,0.06)', borderLeft: '3px solid #FF4444', borderRadius: '0 8px 8px 0', marginBottom: 8 }}>
                  <span>🔴</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{c.name} — Morning report not submitted</span>
                </div>
              ))}
              {totalAuthsExpiring > 3 && (
                <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(255,68,68,0.06)', borderLeft: '3px solid #FF4444', borderRadius: '0 8px 8px 0', marginBottom: 8 }}>
                  <span>🔴</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{totalAuthsExpiring} authorizations expiring within 7 days — action required today</span>
                </div>
              )}
              {visitGap > 100 && (
                <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(255,184,0,0.06)', borderLeft: '3px solid #FFB800', borderRadius: '0 8px 8px 0', marginBottom: 8 }}>
                  <span>🟡</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Weekly visit pace is {visitGap} below the 800-visit sustainability threshold</span>
                </div>
              )}
              {totalMissed > 5 && (
                <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(255,184,0,0.06)', borderLeft: '3px solid #FFB800', borderRadius: '0 8px 8px 0', marginBottom: 8 }}>
                  <span>🟡</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{totalMissed} missed visits today — verify same-day reschedule documentation</span>
                </div>
              )}
              {coordinators.filter(c => {
                const r = morningReports.find(rep => rep.coordinator_id === c.id);
                return r && r.active_patients > 150;
              }).map(c => {
                const r = morningReports.find(rep => rep.coordinator_id === c.id);
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(255,68,68,0.06)', borderLeft: '3px solid #FF4444', borderRadius: '0 8px 8px 0', marginBottom: 8 }}>
                    <span>🔴</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{c.name} — Caseload critical at {r.active_patients} patients. Redistribution required.</span>
                  </div>
                );
              })}
              {reportsIn === coordinators.length && totalAuthsExpiring <= 3 && totalMissed <= 5 && visitGap <= 100 && coordinators.length > 0 && (
                <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(0,255,156,0.06)', borderLeft: '3px solid #00FF9C', borderRadius: '0 8px 8px 0' }}>
                  <span>✅</span><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>No critical alerts — team is operating within thresholds</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Team Performance</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Today's metrics from morning reports — updates in real time as coordinators submit</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '180px 80px 80px 80px 80px 80px 80px 80px 1fr',
                padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)'
              }}>
                {['Coordinator', 'Patients', 'Sched', 'Done', 'Missed', 'Auth ⚠', 'Referrals', 'Tasks', 'Completion'].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: i > 0 && i < 8 ? 'center' : 'left' }}>{h}</div>
                ))}
              </div>

              {coordinators.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                  No coordinator data yet. Add coordinators in Supabase to get started.
                </div>
              ) : (
                coordinators.map(c => (
                  <CoordRow key={c.id} coordinator={c} report={morningReports.find(r => r.coordinator_id === c.id)} />
                ))
              )}
            </div>

            {/* Caseload warning */}
            {morningReports.some(r => r.active_patients > COORDINATOR_CAP) && (
              <div style={{
                marginTop: 16, background: 'rgba(255,68,68,0.07)', border: '1px solid rgba(255,68,68,0.2)',
                borderRadius: 12, padding: '16px 20px'
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#FF4444', marginBottom: 8 }}>⚠ Caseload Redistribution Required</div>
                {morningReports.filter(r => r.active_patients > COORDINATOR_CAP).map(r => {
                  const c = coordinators.find(c => c.id === r.coordinator_id);
                  return (
                    <div key={r.id} style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                      {c?.name} is at {r.active_patients} patients — {r.active_patients - COORDINATOR_CAP} above the {COORDINATOR_CAP}-patient standard
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TRENDS TAB */}
        {activeTab === 'trends' && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Visit Trend</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Daily completed visits vs daily target (160/day → 800/week)</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px', marginBottom: 20 }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={weeklyData} barSize={32}>
                  <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <ReferenceLine y={160} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" label={{ value: 'Daily Target', fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} />
                  <Bar dataKey="visits" name="Visits Completed" radius={[4, 4, 0, 0]}>
                    {weeklyData.map((entry, i) => (
                      <Cell key={i} fill={entry.visits >= 150 ? '#00FF9C' : entry.visits >= 120 ? '#FFB800' : '#FF4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <StatCard label="7-Day Total" value={weeklyData.reduce((s, d) => s + d.visits, 0)} sub="Completed visits this week" color="#00D4FF" />
              <StatCard label="Daily Average" value={weeklyData.length > 0 ? Math.round(weeklyData.reduce((s, d) => s + d.visits, 0) / weeklyData.filter(d => d.visits > 0).length) || 0 : 0} sub="Per day (active days)" color="#00FF9C" />
              <StatCard label="Days On Target" value={weeklyData.filter(d => d.visits >= 150).length} sub={`of ${weeklyData.filter(d => d.visits > 0).length} reported days`} color="#B388FF" />
            </div>
          </div>
        )}

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Today's Reports</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Full report details submitted by coordinators</div>
            </div>

            {coordinators.map(c => {
              const morning = morningReports.find(r => r.coordinator_id === c.id);
              const eod = eodReports.find(r => r.coordinator_id === c.id);
              const color = COORD_COLORS[c.name] || '#00D4FF';

              return (
                <div key={c.id} style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 16, padding: '22px 24px', marginBottom: 16, position: 'relative', overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 3, height: 36, background: color, borderRadius: 2 }} />
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "'DM Mono', monospace" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{c.region}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { label: 'Morning', data: morning },
                        { label: 'EOD', data: eod }
                      ].map(({ label, data }) => (
                        <div key={label} style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                          background: data ? 'rgba(0,255,156,0.1)' : 'rgba(255,68,68,0.1)',
                          border: `1px solid ${data ? 'rgba(0,255,156,0.3)' : 'rgba(255,68,68,0.3)'}`,
                          color: data ? '#00FF9C' : '#FF6B6B'
                        }}>{label}: {data ? '✓' : 'Missing'}</div>
                      ))}
                    </div>
                  </div>

                  {morning ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: eod ? 16 : 0 }}>
                      {[
                        { label: 'Patients', value: morning.active_patients, color: '#00D4FF' },
                        { label: 'Visits Scheduled', value: morning.visits_scheduled, color: '#fff' },
                        { label: 'Auths Pending', value: morning.auths_pending, color: '#FFB800' },
                        { label: 'Auths Expiring', value: morning.auths_expiring_7d, color: morning.auths_expiring_7d > 2 ? '#FF4444' : '#FFB800' },
                        { label: 'New Referrals', value: morning.new_referrals, color: '#B388FF' },
                        { label: 'Open Tasks', value: morning.tasks_open, color: '#FF6B35' },
                        { label: 'Submitted On Time', value: morning.report_submitted_on_time ? 'Yes' : 'Late', color: morning.report_submitted_on_time ? '#00FF9C' : '#FF4444' },
                      ].map(m => (
                        <div key={m.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '16px', background: 'rgba(255,68,68,0.07)', borderRadius: 10, fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                      Morning report not yet submitted
                    </div>
                  )}

                  {eod && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>EOD Report</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {[
                          { label: 'Visits Completed', value: eod.visits_completed, color: '#00FF9C' },
                          { label: 'Visits Missed', value: eod.visits_missed, color: eod.visits_missed > 2 ? '#FF4444' : '#FFB800' },
                          { label: 'Escalations', value: eod.escalations_made, color: '#FFB800' },
                          { label: 'Tasks Closed', value: eod.tasks_completed_today, color: '#00D4FF' },
                        ].map(m => (
                          <div key={m.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                      {eod.top_priorities_tomorrow && (
                        <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(0,212,255,0.05)', borderRadius: 8, borderLeft: '3px solid rgba(0,212,255,0.3)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Tomorrow's Priorities</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', whiteSpace: 'pre-line', lineHeight: 1.7 }}>{eod.top_priorities_tomorrow}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

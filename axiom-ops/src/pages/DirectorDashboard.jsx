import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

// ── Brand tokens ──────────────────────────────────────────────
const B = {
  red:       '#D94F2B',
  darkRed:   '#8B1A10',
  orange:    '#E8763A',
  black:     '#1A1A1A',
  gray:      '#8B6B64',
  lightGray: '#BBA8A4',
  border:    '#F0E4E0',
  bg:        '#FBF7F6',
  cardBg:    '#fff',
  green:     '#2E7D32',
  yellow:    '#D97706',
  danger:    '#DC2626',
  blue:      '#1565C0',
};

const VISIT_TARGET = 800;
const COORD_COLORS = { 'Gypsy': B.red, 'Mary': B.green, 'Audrey': B.orange, 'April': B.darkRed };

// ── CSV Parser ────────────────────────────────────────────────
function parseParioxCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  let completed = 0, missed = 0, scheduled = 0;
  const dailyMap = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    const row = {}; headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    const status = (row['status'] || row['visit status'] || row['visit_status'] || '').toLowerCase();
    const date = row['date'] || row['visit date'] || row['service date'] || row['visitdate'] || '';
    const count = parseInt(row['count'] || row['visits'] || row['total'] || '1') || 1;
    scheduled += count;
    const isComplete = status.includes('complet') || status.includes('kept') || status.includes('done');
    const isMissed = status.includes('miss') || status.includes('cancel') || status.includes('no show');
    if (isComplete) completed += count;
    if (isMissed) missed += count;
    if (date) {
      const d = date.split('T')[0].split(' ')[0];
      if (d) { if (!dailyMap[d]) dailyMap[d] = { completed: 0, scheduled: 0 }; dailyMap[d].scheduled += count; if (isComplete) dailyMap[d].completed += count; }
    }
  }
  const dailyTrend = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([date, data]) => ({
    day: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
    visits: data.completed, scheduled: data.scheduled, target: Math.round(VISIT_TARGET / 5)
  }));
  return { completedVisits: completed, missedVisits: missed, scheduledVisits: scheduled, dailyTrend, rowCount: lines.length - 1 };
}

// ── Shared components ─────────────────────────────────────────
function StatCard({ label, value, sub, color = B.red, alert, icon }) {
  return (
    <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'monospace' }}>{icon} {label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: B.lightGray, marginTop: 6 }}>{sub}</div>}
      {alert && <div style={{ fontSize: 11, color: B.danger, marginTop: 5, fontWeight: 600 }}>{alert}</div>}
    </div>
  );
}

function AlertItem({ text, severity }) {
  const map = {
    critical: { color: B.danger, bg: '#FEF2F2', border: '#FECACA', icon: '🔴' },
    warning:  { color: B.yellow, bg: '#FFFBEB', border: '#FDE68A', icon: '🟡' },
    info:     { color: B.red,    bg: '#FFF5F2', border: '#FDDDD5', icon: '🔵' },
  };
  const s = map[severity];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: s.bg, borderLeft: `3px solid ${s.color}`, borderRadius: '0 8px 8px 0', marginBottom: 8 }}>
      <span style={{ fontSize: 12 }}>{s.icon}</span>
      <span style={{ fontSize: 12, color: B.black, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

function CoordRow({ report, coordinator }) {
  const color = COORD_COLORS[coordinator?.name] || B.red;
  const caseload = report?.active_patients || 0;
  const caseloadColor = caseload > 150 ? B.danger : caseload > 80 ? B.yellow : caseload < 50 ? B.orange : B.green;
  const cr = report?.visits_scheduled > 0 ? Math.round((report.visits_completed / report.visits_scheduled) * 100) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 80px 80px 80px 80px 80px 80px 80px 1fr', padding: '14px 20px', borderBottom: `1px solid ${B.border}`, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 3, height: 32, background: color, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: B.black }}>{coordinator?.name}</div>
          <div style={{ fontSize: 10, color: B.lightGray }}>{coordinator?.region}</div>
        </div>
      </div>
      {[
        { val: caseload, color: caseloadColor },
        { val: report?.visits_scheduled || 0, color: B.black },
        { val: report?.visits_completed || 0, color: B.green },
        { val: report?.visits_missed || 0, color: (report?.visits_missed || 0) > 3 ? B.danger : B.yellow },
        { val: report?.auths_expiring_7d || 0, color: (report?.auths_expiring_7d || 0) > 2 ? B.danger : B.yellow },
        { val: report?.new_referrals || 0, color: B.darkRed },
        { val: report?.tasks_open || 0, color: (report?.tasks_open || 0) > 8 ? B.danger : B.orange },
      ].map((cell, i) => (
        <div key={i} style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: cell.color }}>{cell.val}</div>
      ))}
      <div style={{ paddingLeft: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: '#F5EDEB', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${cr}%`, borderRadius: 2, background: cr > 85 ? B.green : cr > 70 ? B.yellow : B.red }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: B.lightGray, width: 30 }}>{cr}%</span>
          {!report && <span style={{ fontSize: 10, color: B.danger, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>NO REPORT</span>}
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(139,26,16,0.12)' }}>
      <div style={{ color: B.lightGray, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.color || B.red, fontFamily: 'monospace', fontWeight: 700 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

function CSVUploadPanel({ onDataLoaded, csvData }) {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) { setError('Please upload a CSV or Excel file from Pariox'); return; }
    setProcessing(true); setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = parseParioxCSV(e.target.result);
        if (!result) { setError('Could not parse this file. Make sure it is a Pariox CSV export.'); setProcessing(false); return; }
        onDataLoaded(result); setProcessing(false);
      } catch (err) { setError('Error: ' + err.message); setProcessing(false); }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '24px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: B.black, marginBottom: 3 }}>📊 Pariox Visit Data Import</div>
          <div style={{ fontSize: 12, color: B.gray }}>Upload your weekly CSV/Excel export from Pariox to update visit counts and charts</div>
        </div>
        {csvData && <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '6px 12px', fontSize: 11, color: B.green, fontWeight: 600 }}>✓ {csvData.rowCount} records loaded</div>}
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current.click()}
        style={{ border: `2px dashed ${dragging ? B.red : '#E8D5D0'}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: dragging ? '#FFF5F2' : '#FDFAF9' }}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: B.black, marginBottom: 4 }}>{processing ? 'Processing...' : 'Drop your Pariox export here'}</div>
        <div style={{ fontSize: 11, color: B.lightGray }}>or click to browse — CSV, XLS, XLSX accepted</div>
      </div>
      {error && <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: B.danger }}>{error}</div>}
      {csvData && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Completed', value: csvData.completedVisits, color: B.red },
            { label: 'Scheduled', value: csvData.scheduledVisits, color: B.black },
            { label: 'Missed', value: csvData.missedVisits, color: B.danger },
            { label: 'Completion %', value: csvData.scheduledVisits > 0 ? `${Math.round(csvData.completedVisits / csvData.scheduledVisits * 100)}%` : '—', color: B.green },
          ].map(m => (
            <div key={m.label} style={{ background: '#FBF7F6', borderRadius: 8, padding: '10px 14px', textAlign: 'center', border: `1px solid ${B.border}` }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
              <div style={{ fontSize: 10, color: B.lightGray, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoogleDriveLinkPanel({ driveLinks, onAddLink, onRemoveLink }) {
  const [newLink, setNewLink] = useState({ label: '', url: '' });
  const [adding, setAdding] = useState(false);
  const getType = url => url.includes('spreadsheets') ? 'sheet' : url.includes('document') ? 'doc' : url.includes('drive.google.com/drive/folders') ? 'folder' : 'other';
  const inputStyle = { width: '100%', padding: '8px 12px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: B.black, background: '#fff' };

  return (
    <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '24px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: B.black, marginBottom: 3 }}>📂 Google Drive Reports</div>
          <div style={{ fontSize: 12, color: B.gray }}>Link your Google Sheets or Docs daily reports for quick live access</div>
        </div>
        <button onClick={() => setAdding(!adding)} style={{ background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 8, color: '#fff', padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(217,79,43,0.3)' }}>+ Add Link</button>
      </div>

      {adding && (
        <div style={{ background: '#FBF7F6', border: `1px solid ${B.border}`, borderRadius: 10, padding: '16px', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>Label</label>
              <input value={newLink.label} onChange={e => setNewLink(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Gypsy Weekly Report" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>Google Drive URL</label>
              <input value={newLink.url} onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))} placeholder="Paste Google Sheets, Doc, or Drive folder URL" style={inputStyle} />
            </div>
            <button onClick={() => { if (!newLink.label || !newLink.url) return; onAddLink({ ...newLink, id: Date.now(), type: getType(newLink.url) }); setNewLink({ label: '', url: '' }); setAdding(false); }} style={{ background: B.green, border: 'none', borderRadius: 8, color: '#fff', padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', height: 38, whiteSpace: 'nowrap' }}>Add</button>
          </div>
          <div style={{ fontSize: 11, color: B.lightGray, marginTop: 8 }}>Supports: Google Sheets (live data), Google Docs, Drive folder links</div>
        </div>
      )}

      {driveLinks.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: '28px', color: B.lightGray, fontSize: 13, background: '#FDFAF9', borderRadius: 10, border: `1px dashed ${B.border}` }}>
          No reports linked yet — click "+ Add Link" to connect your Google Drive reports
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {driveLinks.map(link => (
          <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#FBF7F6', border: `1px solid ${B.border}`, borderRadius: 10 }}>
            <div style={{ fontSize: 20 }}>{link.type === 'sheet' ? '📊' : link.type === 'doc' ? '📄' : link.type === 'folder' ? '📁' : '🔗'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{link.label}</div>
              <div style={{ fontSize: 11, color: B.lightGray, marginTop: 2 }}>{link.type === 'sheet' ? 'Google Sheet' : link.type === 'doc' ? 'Google Doc' : link.type === 'folder' ? 'Drive Folder' : 'Link'}</div>
            </div>
            <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ background: '#FFF5F2', border: `1px solid #FDDDD5`, borderRadius: 8, color: B.red, padding: '6px 12px', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>Open →</a>
            <button onClick={() => onRemoveLink(link.id)} style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: B.danger, padding: '6px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function DirectorDashboard() {
  const { signOut } = useAuth();
  const [coordinators, setCoordinators] = useState([]);
  const [morningReports, setMorningReports] = useState([]);
  const [eodReports, setEodReports] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date());
  const [manualVisits, setManualVisits] = useState(650);
  const [csvData, setCsvData] = useState(null);
  const [driveLinks, setDriveLinks] = useState(() => { try { return JSON.parse(localStorage.getItem('axiom_drive_links') || '[]'); } catch { return []; } });

  useEffect(() => {
    loadData();
    const t = setInterval(() => setTime(new Date()), 1000);
    const sub = supabase.channel('reports').on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, loadData).subscribe();
    return () => { clearInterval(t); sub.unsubscribe(); };
  }, []);

  const loadData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().split('T')[0]; });
    const [coordRes, morningRes, eodRes, trendRes] = await Promise.all([
      supabase.from('coordinators').select('*').neq('role', 'director').order('name'),
      supabase.from('daily_reports').select('*').eq('report_date', today).eq('report_type', 'morning'),
      supabase.from('daily_reports').select('*').eq('report_date', today).eq('report_type', 'eod'),
      supabase.from('daily_reports').select('report_date, visits_completed').in('report_date', days).eq('report_type', 'eod'),
    ]);
    setCoordinators(coordRes.data || []);
    setMorningReports(morningRes.data || []);
    setEodReports(eodRes.data || []);
    setWeeklyData(days.map(day => ({ day: new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }), visits: (trendRes.data || []).filter(r => r.report_date === day).reduce((s, r) => s + (r.visits_completed || 0), 0), target: Math.round(VISIT_TARGET / 5) })));
    setLoading(false);
  }, []);

  const addDriveLink = link => { const u = [...driveLinks, link]; setDriveLinks(u); localStorage.setItem('axiom_drive_links', JSON.stringify(u)); };
  const removeDriveLink = id => { const u = driveLinks.filter(l => l.id !== id); setDriveLinks(u); localStorage.setItem('axiom_drive_links', JSON.stringify(u)); };
  const handleCSV = data => { setCsvData(data); if (data.completedVisits > 0) setManualVisits(data.completedVisits); };

  const sum = (key, r) => r.reduce((s, x) => s + (x[key] || 0), 0);
  const totalPatients = sum('active_patients', morningReports);
  const totalScheduled = sum('visits_scheduled', morningReports);
  const totalCompleted = sum('visits_completed', eodReports.length > 0 ? eodReports : morningReports);
  const totalMissed = sum('visits_missed', eodReports);
  const totalAuthsPending = sum('auths_pending', morningReports);
  const totalAuthsExpiring = sum('auths_expiring_7d', morningReports);
  const totalReferrals = sum('new_referrals', morningReports);
  const totalOpenTasks = sum('tasks_open', morningReports);
  const reportsIn = morningReports.length;
  const visitPct = Math.min(Math.round((manualVisits / VISIT_TARGET) * 100), 100);
  const visitGap = VISIT_TARGET - manualVisits;
  const trendData = csvData?.dailyTrend?.length > 0 ? csvData.dailyTrend : weeklyData;
  const tabs = ['overview', 'team', 'trends', 'reports', 'data'];

  if (loading) return <div style={{ minHeight: '100vh', background: B.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: B.lightGray, fontFamily: 'DM Sans, sans-serif' }}>Loading...</div>;

  return (
    <div style={{ minHeight: '100vh', background: B.bg, color: B.black, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap'); * { box-sizing: border-box; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #E8D5D0; border-radius: 2px; } .tab-btn { background: none; border: none; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', sans-serif; } .visits-input { background: #FFF5F2; border: 1.5px solid #FDDDD5; border-radius: 8px; color: ${B.red}; padding: 4px 10px; font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 800; width: 110px; text-align: center; outline: none; }`}</style>

      {/* Header */}
      <div style={{ background: B.cardBg, borderBottom: `1px solid ${B.border}`, padding: '12px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 6px rgba(139,26,16,0.08)' }}>
        <img src="/logo.png" alt="AxiomHealth Management" style={{ height: 40, objectFit: 'contain' }} />

        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map(tab => (
            <button key={tab} className="tab-btn" onClick={() => setActiveTab(tab)} style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              color: activeTab === tab ? '#fff' : B.gray,
              background: activeTab === tab ? `linear-gradient(135deg, ${B.red}, ${B.darkRed})` : 'transparent',
              border: activeTab === tab ? 'none' : `1px solid ${B.border}`,
              boxShadow: activeTab === tab ? '0 2px 8px rgba(217,79,43,0.3)' : 'none'
            }}>
              {tab === 'data' ? '📊 Data' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: B.red }}>{time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            <div style={{ fontSize: 10, color: B.lightGray }}>{time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </div>
          <button onClick={signOut} style={{ background: '#FBF7F6', border: `1px solid ${B.border}`, borderRadius: 8, color: B.gray, padding: '7px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>

        {/* ── OVERVIEW ────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 18, padding: '24px 32px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', boxShadow: '0 1px 6px rgba(139,26,16,0.06)' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Weekly Visit Target {csvData && <span style={{ color: B.green, fontWeight: 700 }}>· Pariox Data Loaded</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                  <input className="visits-input" type="number" value={manualVisits} onChange={e => setManualVisits(parseInt(e.target.value) || 0)} />
                  <span style={{ fontSize: 16, color: B.lightGray }}>/ {VISIT_TARGET} visits/wk</span>
                </div>
                <div style={{ height: 8, background: '#F5EDEB', borderRadius: 4 }}>
                  <div style={{ height: '100%', width: `${visitPct}%`, borderRadius: 4, background: visitPct >= 100 ? B.green : `linear-gradient(90deg, ${B.darkRed}, ${B.red}, ${B.orange})`, transition: 'width 0.5s ease', boxShadow: '0 0 8px rgba(217,79,43,0.3)' }} />
                </div>
                <div style={{ fontSize: 11, color: B.gray, marginTop: 6 }}>{visitPct}% of target — {visitGap > 0 ? `${visitGap} visits to reach sustainability` : '🎯 Target reached!'}</div>
              </div>
              {[
                { label: 'Reports In', value: `${reportsIn}/${coordinators.length}`, color: reportsIn < coordinators.length ? B.danger : B.green },
                { label: 'Gap to 800', value: visitGap > 0 ? visitGap : '✓', color: visitGap > 0 ? B.yellow : B.green },
                { label: 'Auths Expiring', value: totalAuthsExpiring, color: totalAuthsExpiring > 5 ? B.danger : B.yellow },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', borderLeft: `1px solid ${B.border}`, paddingLeft: 28 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: s.color, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
              <StatCard icon="👥" label="Patient Census" value={totalPatients || '—'} sub="Total active patients" color={B.red} />
              <StatCard icon="✅" label="Visits Today" value={totalCompleted || '—'} sub={`of ${totalScheduled || '—'} scheduled`} color={B.green} />
              <StatCard icon="⚠️" label="Missed Visits" value={totalMissed || 0} sub="Require same-day reschedule" color={totalMissed > 5 ? B.danger : B.yellow} alert={totalMissed > 5 ? 'Above threshold' : null} />
              <StatCard icon="📋" label="New Referrals" value={totalReferrals || 0} sub="Received today" color={B.darkRed} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
              <StatCard icon="🔒" label="Auths Pending" value={totalAuthsPending || 0} sub="Awaiting approval" color={B.yellow} />
              <StatCard icon="⏰" label="Auths Expiring" value={totalAuthsExpiring || 0} sub="Within 7 days" color={totalAuthsExpiring > 3 ? B.danger : B.yellow} alert={totalAuthsExpiring > 3 ? 'Action required today' : null} />
              <StatCard icon="📌" label="Open Tasks" value={totalOpenTasks || 0} sub="Team total" color={B.orange} />
              <StatCard icon="📊" label="Morning Reports" value={`${reportsIn}/${coordinators.length}`} sub="Submitted by 9 AM" color={reportsIn < coordinators.length ? B.danger : B.green} alert={reportsIn < coordinators.length ? `${coordinators.length - reportsIn} missing` : null} />
            </div>

            <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 6px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: B.lightGray, marginBottom: 14 }}>Live Alerts</div>
              {coordinators.filter(c => !morningReports.find(r => r.coordinator_id === c.id)).map(c => <AlertItem key={c.id} text={`${c.name} — Morning report not submitted`} severity="critical" />)}
              {totalAuthsExpiring > 3 && <AlertItem text={`${totalAuthsExpiring} authorizations expiring within 7 days — action required today`} severity="critical" />}
              {visitGap > 100 && <AlertItem text={`Weekly visit pace is ${visitGap} below the 800-visit sustainability threshold`} severity="warning" />}
              {totalMissed > 5 && <AlertItem text={`${totalMissed} missed visits today — verify same-day reschedule documentation`} severity="warning" />}
              {reportsIn === coordinators.length && totalAuthsExpiring <= 3 && totalMissed <= 5 && visitGap <= 100 && coordinators.length > 0 && <AlertItem text="No critical alerts — team is operating within thresholds" severity="info" />}
            </div>
          </>
        )}

        {/* ── TEAM ─────────────────────────────────────────────── */}
        {activeTab === 'team' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Team Performance</div>
              <div style={{ fontSize: 13, color: B.gray }}>Live coordinator metrics — updates in real time as reports are submitted</div>
            </div>
            <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 6px rgba(139,26,16,0.06)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '180px 80px 80px 80px 80px 80px 80px 80px 1fr', padding: '12px 20px', borderBottom: `1px solid ${B.border}`, background: '#FBF7F6' }}>
                {['Coordinator', 'Patients', 'Sched', 'Done', 'Missed', 'Auth ⚠', 'Referrals', 'Tasks', 'Completion'].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: i > 0 && i < 8 ? 'center' : 'left' }}>{h}</div>
                ))}
              </div>
              {coordinators.length === 0 ? <div style={{ padding: '40px 20px', textAlign: 'center', color: B.lightGray, fontSize: 13 }}>No coordinator data yet.</div>
                : coordinators.map(c => <CoordRow key={c.id} coordinator={c} report={morningReports.find(r => r.coordinator_id === c.id)} />)}
            </div>
          </div>
        )}

        {/* ── TRENDS ───────────────────────────────────────────── */}
        {activeTab === 'trends' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Visit Trend</div>
              <div style={{ fontSize: 13, color: B.gray }}>{csvData ? 'Showing Pariox import data' : 'Daily completed visits — upload Pariox data in the Data tab for full detail'}</div>
            </div>
            <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '24px', marginBottom: 20, boxShadow: '0 1px 6px rgba(139,26,16,0.06)' }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trendData} barSize={32}>
                  <XAxis dataKey="day" tick={{ fill: B.lightGray, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: B.lightGray, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(217,79,43,0.04)' }} />
                  <ReferenceLine y={160} stroke={B.border} strokeDasharray="4 4" label={{ value: 'Daily Target', fill: B.lightGray, fontSize: 11 }} />
                  <Bar dataKey="visits" name="Visits Completed" radius={[4, 4, 0, 0]}>
                    {trendData.map((entry, i) => <Cell key={i} fill={entry.visits >= 150 ? B.green : entry.visits >= 120 ? B.yellow : entry.visits > 0 ? B.red : '#F5EDEB'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <StatCard label="7-Day Total" value={trendData.reduce((s, d) => s + d.visits, 0)} sub="Completed visits" color={B.red} />
              <StatCard label="Daily Average" value={Math.round(trendData.reduce((s, d) => s + d.visits, 0) / Math.max(trendData.filter(d => d.visits > 0).length, 1))} sub="Per active day" color={B.green} />
              <StatCard label="Days On Target" value={trendData.filter(d => d.visits >= 150).length} sub={`of ${trendData.filter(d => d.visits > 0).length} reported days`} color={B.darkRed} />
            </div>
          </div>
        )}

        {/* ── REPORTS ──────────────────────────────────────────── */}
        {activeTab === 'reports' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Today's Reports</div>
              <div style={{ fontSize: 13, color: B.gray }}>Full detail submitted by coordinators</div>
            </div>
            {coordinators.map(c => {
              const morning = morningReports.find(r => r.coordinator_id === c.id);
              const eod = eodReports.find(r => r.coordinator_id === c.id);
              const color = COORD_COLORS[c.name] || B.red;
              return (
                <div key={c.id} style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '22px 24px', marginBottom: 16, position: 'relative', overflow: 'hidden', boxShadow: '0 1px 6px rgba(139,26,16,0.06)' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 3, height: 36, background: color, borderRadius: 2 }} />
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: B.lightGray }}>{c.region}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[{ label: 'Morning', data: morning }, { label: 'EOD', data: eod }].map(({ label, data }) => (
                        <div key={label} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: data ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${data ? '#BBF7D0' : '#FECACA'}`, color: data ? B.green : B.danger }}>{label}: {data ? '✓' : 'Missing'}</div>
                      ))}
                    </div>
                  </div>
                  {morning ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                      {[
                        { label: 'Patients', value: morning.active_patients, color: B.red },
                        { label: 'Visits Scheduled', value: morning.visits_scheduled, color: B.black },
                        { label: 'Auths Pending', value: morning.auths_pending, color: B.yellow },
                        { label: 'Auths Expiring', value: morning.auths_expiring_7d, color: morning.auths_expiring_7d > 2 ? B.danger : B.yellow },
                        { label: 'New Referrals', value: morning.new_referrals, color: B.darkRed },
                        { label: 'Open Tasks', value: morning.tasks_open, color: B.orange },
                        { label: 'On Time', value: morning.report_submitted_on_time ? 'Yes' : 'Late', color: morning.report_submitted_on_time ? B.green : B.danger },
                      ].map(m => (
                        <div key={m.label} style={{ background: '#FBF7F6', borderRadius: 8, padding: '10px 14px', border: `1px solid ${B.border}` }}>
                          <div style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{m.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ padding: '16px', background: '#FEF2F2', borderRadius: 10, fontSize: 13, color: B.lightGray, textAlign: 'center' }}>Morning report not yet submitted</div>}
                  {eod?.top_priorities_tomorrow && (
                    <div style={{ marginTop: 12, padding: '12px 16px', background: '#FFF5F2', borderRadius: 8, borderLeft: `3px solid #FDDDD5` }}>
                      <div style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Tomorrow's Priorities</div>
                      <div style={{ fontSize: 12, color: B.black, whiteSpace: 'pre-line', lineHeight: 1.7 }}>{eod.top_priorities_tomorrow}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── DATA ─────────────────────────────────────────────── */}
        {activeTab === 'data' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Data & Integrations</div>
              <div style={{ fontSize: 13, color: B.gray }}>Import Pariox visit data and link Google Drive reports for live access</div>
            </div>
            <CSVUploadPanel onDataLoaded={handleCSV} csvData={csvData} />
            <GoogleDriveLinkPanel driveLinks={driveLinks} onAddLink={addDriveLink} onRemoveLink={removeDriveLink} />
          </div>
        )}
      </div>
    </div>
  );
}

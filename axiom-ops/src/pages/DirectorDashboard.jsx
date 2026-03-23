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
function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += line[i]; }
  }
  result.push(current.trim());
  return result;
}

function parseParioxCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

  // Detect Pariox column indexes — handles "Status (eForm)" naming
  const statusIdx = headers.findIndex(h => h.includes('status'));
  const dateIdx = headers.findIndex(h => h === 'date');
  if (statusIdx === -1) return null;

  let completed = 0, missed = 0, scheduled = 0;
  const dailyMap = {};

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVLine(lines[i]);
    const status = (cols[statusIdx] || '').toLowerCase().trim();
    const dateRaw = (cols[dateIdx] || '').trim();
    scheduled++;

    // Pariox statuses: "Completed (Active)", "Completed (Submitted)", "Completed (Sent Back)", "Scheduled (Active)"
    const isComplete = status.startsWith('completed');
    const isMissed = status.includes('missed') || status.includes('no show') || status.includes('cancel');
    if (isComplete) completed++;
    if (isMissed) missed++;

    // Parse MM/DD/YYYY from Pariox
    const mmddyyyy = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mmddyyyy) {
      const [, mm, dd, yyyy] = mmddyyyy;
      const isoDate = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      if (!dailyMap[isoDate]) dailyMap[isoDate] = { completed: 0, scheduled: 0 };
      dailyMap[isoDate].scheduled++;
      if (isComplete) dailyMap[isoDate].completed++;
    }
  }

  const dailyTrend = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b)).slice(-7)
    .map(([date, data]) => ({
      day: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      visits: data.completed, scheduled: data.scheduled, target: Math.round(VISIT_TARGET / 5)
    }));

  // Count unique patients + build staff stats + deduplicate visits
  const patientSet = new Set();
  const staffMap = {};
  const visitDedupeMap = {}; // key: patient+date, value: array of disciplines
  const patIdx2 = headers.findIndex(h => h === 'patient');
  const staffIdx2 = headers.findIndex(h => h === 'staff');
  const discIdx = headers.findIndex(h => h === 'disc');
  const regionIdx2 = headers.findIndex(h => h === 'region');
  const dateIdx2 = headers.findIndex(h => h === 'date');
  const statusIdx3 = headers.findIndex(h => h.includes('status'));

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = parseCSVLine(lines[i]);
    const patient = cols[patIdx2] || '';
    const staff = cols[staffIdx2] || '';
    const disc = cols[discIdx] || '';
    const region = cols[regionIdx2] || '';
    const dateRaw = cols[dateIdx2] || '';
    const status = (cols[statusIdx3] || '').toLowerCase();
    const isComplete = status.startsWith('completed');

    if (patient) patientSet.add(patient);

    // Parse date for deduplication key
    const dateMatch = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const isoDate = dateMatch ? `${dateMatch[3]}-${dateMatch[1].padStart(2,'0')}-${dateMatch[2].padStart(2,'0')}` : '';
    const dedupeKey = `${patient}||${isoDate}`;

    if (!visitDedupeMap[dedupeKey]) visitDedupeMap[dedupeKey] = { disciplines: [], completed: false };
    visitDedupeMap[dedupeKey].disciplines.push(disc);
    if (isComplete) visitDedupeMap[dedupeKey].completed = true;

    // Build staff stats
    if (staff) {
      if (!staffMap[staff]) staffMap[staff] = { name: staff, discipline: disc, primaryRegion: region, totalVisits: 0, completedVisits: 0, patients: new Set(), regions: new Set() };
      staffMap[staff].totalVisits++;
      if (isComplete) staffMap[staff].completedVisits++;
      if (patient) staffMap[staff].patients.add(patient);
      if (region) staffMap[staff].regions.add(region);
    }
  }

  // Deduplicated visit counts — PT+PTA same patient/date = 1 visit
  const supervisoryDiscs = ['LYMPHEDEMA PT', 'OT'];
  let dedupedScheduled = 0, dedupedCompleted = 0;
  for (const [key, visit] of Object.entries(visitDedupeMap)) {
    const hasSupervisory = visit.disciplines.some(d => supervisoryDiscs.includes(d));
    const hasBillable = visit.disciplines.some(d => !supervisoryDiscs.includes(d));
    // Count as 1 visit if both PT+PTA present — the PTA/COTA is the billable visit
    // Count as 1 visit if solo clinician
    if (hasSupervisory && hasBillable) {
      // Joint visit — count once
      dedupedScheduled++;
      if (visit.completed) dedupedCompleted++;
    } else {
      // Solo visit — count normally
      dedupedScheduled++;
      if (visit.completed) dedupedCompleted++;
    }
  }

  // Serialize staffMap (convert Sets to counts)
  const staffStats = {};
  for (const [name, data] of Object.entries(staffMap)) {
    staffStats[name] = { name: data.name, discipline: data.discipline, primaryRegion: data.primaryRegion, totalVisits: data.totalVisits, completedVisits: data.completedVisits, uniquePatients: data.patients.size, regions: Array.from(data.regions) };
  }

  // Build staffList from staffMap for directory sync
  const staffList = Object.values(staffMap).map(s => ({
    name: s.name,
    discipline: s.discipline,
    regions: Array.from(s.regions).sort().join(', '),
    regionCount: s.regions.size,
    totalVisits: s.totalVisits,
    uniquePatients: s.uniquePatients.size,
  }));
  return { completedVisits: dedupedCompleted, missedVisits: missed, scheduledVisits: dedupedScheduled, rawScheduled: scheduled, rawCompleted: completed, dailyTrend, rowCount: lines.length - 1, regionData, uniquePatients: patientSet.size, staffList, dedupedCount: dedupedScheduled, rawCount: scheduled };
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
  const [lastFile, setLastFile] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    // Load SheetJS for Excel support
    if (!window.XLSX && !document.querySelector('script[src*="xlsx"]')) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // Wait for XLSX to load then run callback — handles async script loading
  const withXLSX = (callback, onError) => {
    if (window.XLSX) { callback(window.XLSX); return; }
    let attempts = 0;
    const check = setInterval(() => {
      attempts++;
      if (window.XLSX) { clearInterval(check); callback(window.XLSX); }
      else if (attempts > 40) { clearInterval(check); onError('Excel parser timed out. Please save as CSV and try again.'); }
    }, 250);
  };


  function processRows(rows, headersArr, statusIdx, dateIdx) {
    let completed = 0, missed = 0, scheduled = 0;
    const dailyMap = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]; if (!row || !row.length) continue;
      const status = String(row[statusIdx] || '').toLowerCase().trim();
      const dateRaw = row[dateIdx];
      scheduled++;
      const isComplete = status.startsWith('completed');
      const isMissed = status.includes('missed') || status.includes('no show') || status.includes('cancel');
      if (isComplete) completed++;
      if (isMissed) missed++;
      let isoDate = '';
      if (dateRaw instanceof Date) { isoDate = dateRaw.toISOString().split('T')[0]; }
      else if (typeof dateRaw === 'number') { const d = new Date((dateRaw - 25569) * 86400 * 1000); isoDate = d.toISOString().split('T')[0]; }
      else if (typeof dateRaw === 'string') { const m = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) isoDate = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
      if (isoDate) {
        if (!dailyMap[isoDate]) dailyMap[isoDate] = { completed: 0, scheduled: 0 };
        dailyMap[isoDate].scheduled++;
        if (isComplete) dailyMap[isoDate].completed++;
      }
    }
    const dailyTrend = Object.entries(dailyMap).sort(([a],[b]) => a.localeCompare(b)).slice(-7).map(([date, data]) => ({
      day: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
      visits: data.completed, scheduled: data.scheduled, target: Math.round(VISIT_TARGET / 5)
    }));
    // Build region breakdown and staff map simultaneously
  const regionMap = {};
  const staffMap = {};
   const regionIdx = headersArr.findIndex(h => h === 'region');
   const staffIdx2 = headersArr.findIndex(h => h === 'staff');
   const patientIdx2 = headersArr.findIndex(h => h === 'patient');
   const discIdx2 = headersArr.findIndex(h => h === 'disc');
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]; if (!row || !row.length) continue;
    const regionIdx = headersArr.findIndex(h => h === 'region');
    const staffIdx = headersArr.findIndex(h => h === 'staff');
    const patientIdx = headersArr.findIndex(h => h === 'patient');
    if (regionIdx === -1) continue;
     const region = String(row[regionIdx] || '').trim();
     const staff = String(row[staffIdx2] || '').trim();
     const patient = String(row[patientIdx2] || '').trim();
     const disc = discIdx2 >= 0 ? String(row[discIdx2] || '').trim() : '';
     const status = String(row[statusIdx] || '').toLowerCase().trim();
     const isComplete = status.startsWith('completed');
     if (!region) continue;
     if (!regionMap[region]) regionMap[region] = { scheduled: 0, completed: 0, clinicians: new Set(), patients: new Set(), clinicianMap: {} };
     regionMap[region].scheduled++;
     if (isComplete) regionMap[region].completed++;
     if (staff) {
       regionMap[region].clinicians.add(staff);
       if (!regionMap[region].clinicianMap[staff]) regionMap[region].clinicianMap[staff] = { scheduled: 0, completed: 0, patients: new Set() };
       regionMap[region].clinicianMap[staff].scheduled++;
       if (isComplete) regionMap[region].clinicianMap[staff].completed++;
       if (patient) regionMap[region].clinicianMap[staff].patients.add(patient);
       // Staff directory
       if (!staffMap[staff]) staffMap[staff] = { name: staff, discipline: disc, regions: new Set(), totalVisits: 0, uniquePatients: new Set() };
       staffMap[staff].totalVisits++;
       staffMap[staff].regions.add(region);
       if (patient) staffMap[staff].uniquePatients.add(patient);
     }
     if (patient) regionMap[region].patients.add(patient);
  }
  const regionData = {};
  for (const [region, data] of Object.entries(regionMap)) {
    regionData[region] = { scheduled: data.scheduled, completed: data.completed, clinicians: data.clinicians.size, patients: data.patients.size, clinicianList: Object.entries(data.clinicianMap).map(([name, d]) => ({ name, scheduled: d.scheduled, completed: d.completed, patients: d.patients.size })) };
  }
    // Count unique patients
    // Build staffStats + deduplication for XLSX
    const xlsxPatientSet = new Set();
    const xlsxStaffMap = {};
    const xlsxDedupeMap = {};
    const xPatIdx = headersArr.findIndex(h => h === 'patient');
    const xStaffIdx = headersArr.findIndex(h => h === 'staff');
    const xDiscIdx = headersArr.findIndex(h => h === 'disc');
    const xRegIdx = headersArr.findIndex(h => h === 'region');
    const xDateIdx2 = headersArr.findIndex(h => h === 'date');

    for (let i2 = 1; i2 < rows.length; i2++) {
      const r2 = rows[i2]; if (!r2 || !r2.length) continue;
      const patient = String(r2[xPatIdx] || '');
      const staff = String(r2[xStaffIdx] || '');
      const disc = String(r2[xDiscIdx] || '');
      const region = String(r2[xRegIdx] || '');
      const dateRaw2 = r2[xDateIdx2];
      const xStatus = String(r2[statusIdx] || '').toLowerCase();
      const xComplete = xStatus.startsWith('completed');
      if (patient) xlsxPatientSet.add(patient);
      let xIso = '';
      if (dateRaw2 instanceof Date) { xIso = dateRaw2.toISOString().split('T')[0]; }
      else if (typeof dateRaw2 === 'string') {
        const xm = dateRaw2.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (xm) xIso = xm[3]+'-'+xm[1].padStart(2,'0')+'-'+xm[2].padStart(2,'0');
      }
      const xKey = patient + '||' + xIso;
      if (!xlsxDedupeMap[xKey]) xlsxDedupeMap[xKey] = { disciplines: [], completed: false };
      xlsxDedupeMap[xKey].disciplines.push(disc);
      if (xComplete) xlsxDedupeMap[xKey].completed = true;
      if (staff) {
        if (!xlsxStaffMap[staff]) xlsxStaffMap[staff] = { name: staff, discipline: disc, primaryRegion: region, totalVisits: 0, completedVisits: 0, patients: new Set(), regions: new Set() };
        xlsxStaffMap[staff].totalVisits++;
        if (xComplete) xlsxStaffMap[staff].completedVisits++;
        if (patient) xlsxStaffMap[staff].patients.add(patient);
        if (region) xlsxStaffMap[staff].regions.add(region);
      }
    }
    let xDedupedSched = Object.keys(xlsxDedupeMap).length;
    let xDedupedComp = Object.values(xlsxDedupeMap).filter(v => v.completed).length;
    const xlsxStaffStats = {};
    for (const [name, data] of Object.entries(xlsxStaffMap)) {
      xlsxStaffStats[name] = { name: data.name, discipline: data.discipline, primaryRegion: data.primaryRegion, totalVisits: data.totalVisits, completedVisits: data.completedVisits, uniquePatients: data.patients.size, regions: Array.from(data.regions) };
    }
    const xlsxStaffList = Object.values(staffMap).map(s => ({
      name: s.name, discipline: s.discipline,
      regions: Array.from(s.regions).sort().join(', '),
      regionCount: s.regions.size,
      totalVisits: s.totalVisits,
      uniquePatients: s.uniquePatients.size,
    }));
    return { completedVisits: xDedupedComp, missedVisits: missed, scheduledVisits: xDedupedSched, rawScheduled: scheduled, rawCompleted: completed, dailyTrend, rowCount: rows.length - 1, regionData, uniquePatients: xlsxPatientSet.size, staffList: xlsxStaffList, dedupedCount: xDedupedSched, rawCount: scheduled };
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) { setError('Please upload a CSV or Excel file from Pariox'); return; }
    setProcessing(true); setError('');
    const isXLSX = file.name.match(/\.xlsx?$/i);

    if (isXLSX) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuf = e.target.result;
        withXLSX((XLSX) => {
          try {
            const wb = XLSX.read(new Uint8Array(arrayBuf), { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'mm/dd/yyyy' });
            const headers = (rows[0] || []).map(h => String(h || '').toLowerCase().trim());
            const statusIdx = headers.findIndex(h => h.includes('status'));
            const dateIdx = headers.findIndex(h => h === 'date');
            if (statusIdx === -1) { setError('Could not find Status column. Make sure this is a Pariox export.'); setProcessing(false); return; }
            const result = processRows(rows, headers, statusIdx, dateIdx);
            setLastFile(file.name);
            onDataLoaded(result);
            setProcessing(false);
          } catch (err) { setError('Error reading Excel: ' + err.message); setProcessing(false); }
        }, (errMsg) => { setError(errMsg); setProcessing(false); });
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const result = parseParioxCSV(e.target.result);
          if (!result) { setError('Could not parse this file.'); setProcessing(false); return; }
          setLastFile(file.name);
          onDataLoaded(result);
          setProcessing(false);
        } catch (err) { setError('Error: ' + err.message); setProcessing(false); }
      };
      reader.readAsText(file);
    }
  }

  function handleInputChange(e) { handleFile(e.target.files[0]); e.target.value = ''; }

  return (
    <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '24px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: B.black, marginBottom: 3 }}>📊 Pariox Visit Data Import</div>
          <div style={{ fontSize: 12, color: B.gray }}>Upload CSV or XLSX from Pariox — each upload fully replaces previous data</div>
        </div>
        {csvData && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '6px 12px', fontSize: 11, color: B.green, fontWeight: 600 }}>✓ {csvData.rowCount} records loaded</div>
            {lastFile && <div style={{ fontSize: 10, color: B.lightGray, marginTop: 4 }}>{lastFile}</div>}
          </div>
        )}
      </div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current.click()}
        style={{ border: `2px dashed ${dragging ? B.red : '#E8D5D0'}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: dragging ? '#FFF5F2' : '#FDFAF9' }}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleInputChange} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>{processing ? '⏳' : csvData ? '🔄' : '📁'}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: B.black, marginBottom: 4 }}>
          {processing ? 'Processing...' : csvData ? 'Upload new file to override current data' : 'Drop your Pariox export here'}
        </div>
        <div style={{ fontSize: 11, color: B.lightGray }}>CSV or XLSX accepted — each upload replaces all previous data</div>
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


function CensusUploadPanel({ censusData, onDataLoaded, parseCensusFile, error, setError, processing, setProcessing }) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const STATUS_META = {
    active:              { label: 'Active',              color: '#2E7D32', icon: '✅' },
    active_auth_pending: { label: 'Active–Auth Pending', color: '#E8763A', icon: '⏳' },
    auth_pending:        { label: 'Auth Pending',        color: '#D97706', icon: '🔒' },
    soc_pending:         { label: 'SOC Pending',         color: '#0284C7', icon: '📅' },
    eval_pending:        { label: 'Eval Pending',        color: '#1565C0', icon: '🩺' },
    waitlist:            { label: 'Waitlist',            color: '#7C3AED', icon: '📋' },
    on_hold:             { label: 'On Hold',             color: '#6B7280', icon: '⏸️' },
    on_hold_facility:    { label: 'On Hold – Facility',  color: '#9CA3AF', icon: '🏥' },
    on_hold_pt:          { label: 'On Hold – Pt Req',    color: '#9CA3AF', icon: '🙋' },
    on_hold_md:          { label: 'On Hold – MD Req',    color: '#9CA3AF', icon: '👨‍⚕️' },
    hospitalized:        { label: 'Hospitalized',        color: '#DC2626', icon: '🚨' },
    discharge:           { label: 'Discharge',           color: '#BBA8A4', icon: '📤' },
  };

  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) { setError('Please upload a CSV or Excel census file from Pariox'); return; }
    setProcessing(true); setError('');

    const isXLSX = file.name.match(/\.xlsx?$/i);
    if (isXLSX) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuf = e.target.result;
        withXLSX((XLSX) => {
          try {
            const wb = XLSX.read(new Uint8Array(arrayBuf), { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const csvText = XLSX.utils.sheet_to_csv(ws);
            const result = parseCensusFile(csvText);
            if (!result) { setError('Could not detect a Status column. Make sure this is a Pariox patient census report.'); setProcessing(false); return; }
            onDataLoaded(result); setProcessing(false);
          } catch(err) { setError('Error reading file: ' + err.message); setProcessing(false); }
        }, (errMsg) => { setError(errMsg); setProcessing(false); });
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const result = parseCensusFile(e.target.result);
          if (!result) { setError('Could not detect a Status column. Make sure this is a Pariox patient census report.'); setProcessing(false); return; }
          onDataLoaded(result); setProcessing(false);
        } catch(err) { setError('Error: ' + err.message); setProcessing(false); }
      };
      reader.readAsText(file);
    }
  }

  function handleChange(e) { handleFile(e.target.files[0]); e.target.value = ''; }

  const totalCensus = censusData ? Object.values(censusData.counts).reduce((s,v) => s+v, 0) : 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #F0E4E0', borderRadius: 16, padding: '24px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', marginBottom: 3 }}>👥 Patient Census Upload</div>
          <div style={{ fontSize: 12, color: '#8B6B64' }}>
            Upload your Pariox patient census report — separate from the visit schedule.
            Tracks Active, On Hold, Auth Pending, Waitlist, and Eval Pending patients.
          </div>
        </div>
        {censusData && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '6px 12px', fontSize: 11, color: '#2E7D32', fontWeight: 600 }}>
              ✓ {totalCensus} patients loaded
            </div>
            <div style={{ fontSize: 10, color: '#BBA8A4', marginTop: 4 }}>Updated {censusData.lastUpdated}</div>
          </div>
        )}
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current.click()}
        style={{ border: `2px dashed ${dragging ? '#D94F2B' : '#E8D5D0'}`, borderRadius: 12, padding: '24px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: dragging ? '#FFF5F2' : '#FDFAF9' }}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleChange} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>{processing ? '⏳' : censusData ? '🔄' : '👥'}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', marginBottom: 4 }}>
          {processing ? 'Processing census...' : censusData ? 'Upload new census to override' : 'Drop your Pariox patient census here'}
        </div>
        <div style={{ fontSize: 11, color: '#BBA8A4' }}>CSV or XLSX — pull from Pariox Reports → Patient Census or Patient List</div>
      </div>

      {error && <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      {/* Status breakdown */}
      {censusData && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: '#BBA8A4', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Status Breakdown — {censusData.detectedStatusCol ? `Column detected: "${censusData.detectedStatusCol}"` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.entries(STATUS_META).map(([key, meta]) => {
              const count = censusData.counts[key] || 0;
              const pct = totalCensus > 0 ? Math.round(count / totalCensus * 100) : 0;
              return (
                <div key={key} style={{ background: '#FBF7F6', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #F0E4E0' }}>
                  <div style={{ fontSize: 12, color: '#1A1A1A' }}>{meta.icon} {meta.label}</div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: meta.color, fontFamily: "'DM Mono', monospace" }}>{count}</span>
                    <span style={{ fontSize: 10, color: '#BBA8A4', marginLeft: 4 }}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          {censusData.counts.other > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#BBA8A4', padding: '6px 10px', background: '#FBF7F6', borderRadius: 6 }}>
              ⓘ {censusData.counts.other} patients had unrecognized status values — check that your Pariox status column matches expected values (Active, On Hold, Auth Pending, Waitlist, Eval Pending)
            </div>
          )}
        </div>
      )}

      {/* How to export tip */}
      {!censusData && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1565C0', marginBottom: 6 }}>How to export from Pariox</div>
          <div style={{ fontSize: 11, color: '#1565C0', lineHeight: 1.7 }}>
            1. Log into Pariox → Reports<br/>
            2. Find "Patient List" or "Patient Census" report<br/>
            3. Filter by all active statuses (Active, On Hold, Auth Pending, Waitlist, Eval Pending)<br/>
            4. Export as CSV or Excel<br/>
            5. Upload here — the status column is auto-detected
          </div>
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
  const [manualVisits, setManualVisits] = useState(() => { try { return parseInt(localStorage.getItem('axiom_manual_visits') || '650'); } catch { return 650; } });
  const [csvData, setCsvData] = useState(() => { try { const s = localStorage.getItem('axiom_pariox_data'); return s ? JSON.parse(s) : null; } catch { return null; } });
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [directorNotes, setDirectorNotes] = useState(() => { try { return JSON.parse(localStorage.getItem('axiom_director_notes') || '[]'); } catch { return []; } });
  const [newNote, setNewNote] = useState('');
  const [expansionData, setExpansionData] = useState(() => {
    try {
      const saved = localStorage.getItem('axiom_expansion');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      GA: { state: 'Georgia', status: 'In Progress', credentialing: 60, staffHired: 2, staffNeeded: 4, firstPatientDate: '2026-05-01', weeklyVisitTarget: 80, currentVisits: 0, revenueContribution: 0, notes: '' },
      TX: { state: 'Texas', status: 'Planning', credentialing: 20, staffHired: 0, staffNeeded: 6, firstPatientDate: '2026-07-01', weeklyVisitTarget: 120, currentVisits: 0, revenueContribution: 0, notes: '' },
      NC: { state: 'North Carolina', status: 'Planning', credentialing: 10, staffHired: 0, staffNeeded: 3, firstPatientDate: '2026-08-01', weeklyVisitTarget: 60, currentVisits: 0, revenueContribution: 0, notes: '' },
    };
  });
  const [editingExpansion, setEditingExpansion] = useState(null);
  const [staffDirectory, setStaffDirectory] = useState(() => {
    try { const s = localStorage.getItem('axiom_staff_dir'); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });
  const [staffFilter, setStaffFilter] = useState('all');
  const [staffSearch, setStaffSearch] = useState('');
  const [staffSort, setStaffSort] = useState('visits_desc');
  const [editingStaff, setEditingStaff] = useState(null);
  const [censusData, setCensusData] = useState(() => {
    try { const s = localStorage.getItem('axiom_census'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [censusUploadError, setCensusUploadError] = useState('');
  const [censusProcessing, setCensusProcessing] = useState(false);
  const [selectedCensusRegion, setSelectedCensusRegion] = useState('all');

  const saveCensusData = (data) => {
    setCensusData(data);
    try { localStorage.setItem('axiom_census', JSON.stringify(data)); } catch(e) {}
  };

  // Parse Pariox census file — handles exact column names from Census export
  const parseCensusFile = (text) => {
    const rawLines = text.trim().split('\n');
    if (rawLines.length < 2) return null;

    function parseCSVLine2(line) {
      const result = []; let cur = ''; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQ = !inQ; }
        else if (line[i] === ',' && !inQ) { result.push(cur.trim().replace(/^"|"$/g,'')); cur = ''; }
        else { cur += line[i]; }
      }
      result.push(cur.trim().replace(/^"|"$/g,''));
      return result;
    }

    const headers2 = parseCSVLine2(rawLines[0]).map(h => h.toLowerCase().trim());
    const statusIdx2  = headers2.findIndex(h => h === 'status');
    const patientIdx2 = headers2.findIndex(h => h === 'patient');
    const regionIdx2  = headers2.findIndex(h => h === 'region');
    const discIdx2    = headers2.findIndex(h => h === 'disc');
    const insIdx2     = headers2.findIndex(h => h === 'insurance');
    const socIdx2     = headers2.findIndex(h => h === 'soc');
    const refIdx2     = headers2.findIndex(h => h === 'ref source');
    const changedIdx2 = headers2.findIndex(h => h === 'changed');

    if (statusIdx2 === -1) return null;

    // Exact Pariox status mapping — including truncated values
    const STATUS_MAP = {
      'active':                'active',
      'active - auth pendin':  'active_auth_pending',
      'active - auth pending': 'active_auth_pending',
      'auth pending':          'auth_pending',
      'soc pending':           'soc_pending',
      'eval pending':          'eval_pending',
      'evaluation pending':    'eval_pending',
      'waitlist':              'waitlist',
      'on hold':               'on_hold',
      'on hold - facility':    'on_hold_facility',
      'on hold - pt request':  'on_hold_pt',
      'on hold - md request':  'on_hold_md',
      'hospitalized':          'hospitalized',
      'discharge - change i':  'discharge',
      'discharge':             'discharge',
    };

    // Active census = Active + Active-Auth Pending
    const ACTIVE_STATUSES = new Set(['active', 'active_auth_pending']);

    const counts = {
      active: 0, active_auth_pending: 0, auth_pending: 0, soc_pending: 0,
      eval_pending: 0, waitlist: 0, on_hold: 0, on_hold_facility: 0,
      on_hold_pt: 0, on_hold_md: 0, hospitalized: 0, discharge: 0, other: 0
    };

    const byRegion = {};
    const patients = [];
    let unknownStatuses = new Set();

    for (let i = 1; i < rawLines.length; i++) {
      if (!rawLines[i].trim()) continue;
      const cols = parseCSVLine2(rawLines[i]);
      const rawStatus = (cols[statusIdx2] || '').trim();
      const statusKey = STATUS_MAP[rawStatus.toLowerCase()] || 'other';
      if (statusKey === 'other' && rawStatus) unknownStatuses.add(rawStatus);

      counts[statusKey] = (counts[statusKey] || 0) + 1;

      const patient  = patientIdx2  >= 0 ? cols[patientIdx2]  : '';
      const region   = regionIdx2   >= 0 ? cols[regionIdx2]   : '';
      const disc     = discIdx2     >= 0 ? cols[discIdx2]      : '';
      const ins      = insIdx2      >= 0 ? cols[insIdx2]       : '';
      const soc      = socIdx2      >= 0 ? cols[socIdx2]       : '';
      const ref      = refIdx2      >= 0 ? cols[refIdx2]       : '';

      if (region) {
        if (!byRegion[region]) {
          byRegion[region] = {
            total: 0, activeCensus: 0,
            active: 0, active_auth_pending: 0, auth_pending: 0, soc_pending: 0,
            eval_pending: 0, waitlist: 0, on_hold: 0, on_hold_facility: 0,
            on_hold_pt: 0, on_hold_md: 0, hospitalized: 0, discharge: 0, other: 0,
            patients: []
          };
        }
        byRegion[region].total++;
        byRegion[region][statusKey] = (byRegion[region][statusKey] || 0) + 1;
        if (ACTIVE_STATUSES.has(statusKey)) byRegion[region].activeCensus++;
        byRegion[region].patients.push({ name: patient, status: statusKey, rawStatus, disc, ins, soc, ref });
      }

      patients.push({ name: patient, status: statusKey, rawStatus, region, disc, ins, soc, ref });
    }

    const activeCensus = counts.active + counts.active_auth_pending;

    return {
      counts, byRegion, patients,
      total: rawLines.length - 1,
      activeCensus,
      unknownStatuses: Array.from(unknownStatuses),
      lastUpdated: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      detectedStatusCol: rawLines[0].split(',')[statusIdx2] || 'Status',
    };
  };



  const [staffDirTab, setStaffDirTab] = useState('directory');

  const saveStaffDirectory = (dir) => {
    setStaffDirectory(dir);
    try { localStorage.setItem('axiom_staff_dir', JSON.stringify(dir)); } catch(e) {}
  };

  // Auto-populate directory from Pariox data when uploaded
  const syncStaffFromPariox = (parsedData) => {
    if (!parsedData?.staffList) return;
    setStaffDirectory(prev => {
      const updated = { ...prev };
      parsedData.staffList.forEach(s => {
        if (!updated[s.name]) {
          // Auto-classify: PT/OT appearing in 3+ regions = likely telehealth
          const isLikelyTelehealth = s.regionCount >= 3 && (s.discipline.includes('PT') || s.discipline === 'OT') && !s.discipline.includes('PTA');
          updated[s.name] = {
            name: s.name,
            discipline: s.discipline,
            classification: isLikelyTelehealth ? 'telehealth' : 'field',
            regions: s.regions,
            status: 'active',
            role: s.discipline.includes('PTA') || s.discipline === 'COTA' ? 'treating' : 'supervisory',
            phone: '', email: '', notes: '',
            weeklyVisits: s.totalVisits,
            uniquePatients: s.uniquePatients,
          };
        } else {
          // Update visit/patient counts but preserve manual overrides
          updated[s.name] = { ...updated[s.name], weeklyVisits: s.totalVisits, uniquePatients: s.uniquePatients, regions: s.regions };
        }
      });
      try { localStorage.setItem('axiom_staff_dir', JSON.stringify(updated)); } catch(e) {}
      return updated;
    });
  };
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
  const handleCSV = data => {
    setCsvData(data);
    if (data.completedVisits > 0) setManualVisits(data.completedVisits);
    if (data.staffList?.length > 0) syncStaffFromPariox(data);
    try { localStorage.setItem('axiom_pariox_data', JSON.stringify(data)); } catch(e) {}

    // Auto-populate staff directory from Pariox staffStats
    if (data.staffStats) {
      setStaffDirectory(prev => {
        const updated = { ...prev };
        Object.entries(data.staffStats).forEach(([name, stats]) => {
          if (!updated[name]) {
            // New clinician — seed with Pariox data, default employment type by visit count
            updated[name] = {
              name,
              discipline: stats.discipline,
              primaryRegion: stats.primaryRegion,
              employmentType: stats.totalVisits >= 20 ? 'full_time' : 'part_time',
              workType: ['LYMPHEDEMA PT', 'OT'].includes(stats.discipline) ? 'telehealth' : 'in_person',
              status: 'active',
              minVisits: stats.totalVisits >= 20 ? 24 : 15,
              notes: '',
            };
          } else {
            // Existing — update Pariox-derived stats only
            updated[name] = { ...updated[name], discipline: stats.discipline, primaryRegion: stats.primaryRegion };
          }
        });
        try { localStorage.setItem('axiom_staff_dir', JSON.stringify(updated)); } catch(e) {}
        return updated;
      });
    }
  };

  const sum = (key, r) => r.reduce((s, x) => s + (x[key] || 0), 0);
  // Use Pariox data when loaded, fall back to coordinator reports
  // Pariox gives us: patients, today's visits, completion, missed
  const hasPariox = !!(csvData && csvData.scheduledVisits > 0);
  const hasCensus = !!(censusData && censusData.counts);

  // Use csvData direct fields for overview — Pariox has weekly totals
  const totalPatients = hasPariox
    ? (csvData.uniquePatients || Object.values(csvData.regionData || {}).reduce((s, r) => s + (r.patients || 0), 0))
    : sum('active_patients', morningReports);
  const totalScheduled = hasPariox ? (csvData.scheduledVisits || 0) : sum('visits_scheduled', morningReports);
  const totalCompleted = hasPariox ? (csvData.completedVisits || 0) : sum('visits_completed', eodReports.length > 0 ? eodReports : morningReports);
  const totalMissed = hasPariox ? (csvData.missedVisits || 0) : sum('visits_missed', eodReports);
  const totalAuthsPending = sum('auths_pending', morningReports); // still from coordinator reports
  const totalAuthsExpiring = sum('auths_expiring_7d', morningReports); // still from coordinator reports
  const totalReferrals = sum('new_referrals', morningReports);
  const totalOpenTasks = sum('tasks_open', morningReports);
  const reportsIn = morningReports.length;

  // Source label for UI
  const dataSource = hasPariox ? `Pariox · ${csvData.rowCount} records` : 'Coordinator Reports';
  const DEFAULT_SETTINGS = {
    visitTarget: 800, revenueTarget: 200000, avgReimbursement: 90,
    activeCensusTarget: 500, coordinatorCap: 80, authRiskVisitsPerWeek: 3, adminPin: '1234',
  };
  const [settings, setSettings] = useState(() => {
    try {
      const s = localStorage.getItem('axiom_settings');
      const parsed = s ? JSON.parse(s) : null;
      return parsed || DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinError, setAdminPinError] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(null);

  const saveSettings = (s) => {
    setSettings(s);
    try { localStorage.setItem('axiom_settings', JSON.stringify(s)); } catch(e) {}
  };

  // Pull targets from settings (with fallbacks)
  const CFG = settings || {
    visitTarget: 800, revenueTarget: 200000, avgReimbursement: 90,
    activeCensusTarget: 500, coordinatorCap: 80, authRiskVisitsPerWeek: 3, adminPin: '1234'
  };

  const visitPct = Math.min(Math.round((manualVisits / CFG.visitTarget) * 100), 100);
  const visitGap = CFG.visitTarget - manualVisits;
  const trendData = csvData?.dailyTrend?.length > 0 ? csvData.dailyTrend : weeklyData;
  const tabs = ['overview', 'revenue', 'scorecard', 'expansion', 'staff', 'regions', 'team', 'trends', 'reports', 'data', '⚙️'];

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
              {tab === 'data' ? '📊 Data' : tab === '⚙️' ? '⚙️' : tab.charAt(0).toUpperCase() + tab.slice(1)}
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

            {/* ── VISIT THUMBNAIL ─────────────────────────────── */}
            {(() => {
              const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })();
              const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 5); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); })();
              const scheduledThisWeek = hasPariox ? (csvData.dedupedCount || csvData.scheduledVisits || 0) : 0;
              const completedThisWeek = hasPariox ? (csvData.completedVisits || 0) : totalCompleted;
              const paceColor = scheduledThisWeek >= CFG.visitTarget ? B.green : scheduledThisWeek >= CFG.visitTarget * 0.8 ? B.yellow : B.red;
              const completionPct = scheduledThisWeek > 0 ? Math.round(completedThisWeek / scheduledThisWeek * 100) : 0;

              return (
                <div style={{
                  background: `linear-gradient(135deg, ${B.darkRed} 0%, ${B.red} 50%, ${B.orange} 100%)`,
                  borderRadius: 16, padding: '18px 28px', marginBottom: 20,
                  display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
                  boxShadow: '0 4px 16px rgba(139,26,16,0.2)',
                  position: 'relative', overflow: 'hidden'
                }}>
                  {/* Background pattern */}
                  <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                  <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                      📅 This Week's Schedule · {weekStart} – {weekEnd}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 44, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>
                        {hasPariox ? scheduledThisWeek.toLocaleString() : '—'}
                      </span>
                      <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)' }}>
                        visits on schedule
                      </span>
                    </div>
                    {hasPariox && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ height: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 3, marginBottom: 5 }}>
                          <div style={{ height: '100%', width: `${Math.min(scheduledThisWeek / CFG.visitTarget * 100, 100)}%`, background: '#fff', borderRadius: 3, transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                          {scheduledThisWeek >= CFG.visitTarget
                            ? `✓ At or above ${CFG.visitTarget} visit target`
                            : `${CFG.visitTarget - scheduledThisWeek} below the ${CFG.visitTarget}-visit sustainability threshold`}
                        </div>
                      </div>
                    )}
                    {!hasPariox && (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>Upload Pariox weekly export to populate</div>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ width: 1, height: 60, background: 'rgba(255,255,255,0.2)', display: 'none' }} />

                  {/* Stats row */}
                  {hasPariox && (
                    <div style={{ display: 'flex', gap: 20, position: 'relative' }}>
                      {[
                        { label: 'Completed', value: completedThisWeek, sub: `${completionPct}% done` },
                        { label: 'Remaining', value: Math.max(0, scheduledThisWeek - completedThisWeek), sub: 'this week' },
                        { label: 'Clinicians', value: csvData.staffList?.length || '—', sub: 'on schedule' },
                        { label: 'Patients', value: csvData.uniquePatients || '—', sub: 'this week' },
                      ].map((s, i) => (
                        <div key={s.label} style={{ textAlign: 'center', paddingLeft: i > 0 ? 20 : 0, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{s.value}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Last upload badge */}
                  {hasPariox && (
                    <div style={{ position: 'absolute', top: 10, right: 14, fontSize: 10, color: 'rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '3px 8px' }}>
                      {dataSource}
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 18, padding: '24px 32px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', boxShadow: '0 1px 6px rgba(139,26,16,0.06)' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Weekly Visit Target {hasPariox && <span style={{ color: B.green, fontWeight: 700 }}>· {dataSource}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                  <input className="visits-input" type="number" value={manualVisits} onChange={e => { const v = parseInt(e.target.value) || 0; setManualVisits(v); try { localStorage.setItem('axiom_manual_visits', v); } catch(e) {} }} />
                  <span style={{ fontSize: 16, color: B.lightGray }}>/ {CFG.visitTarget} visits/wk</span>
                </div>
                <div style={{ height: 8, background: '#F5EDEB', borderRadius: 4 }}>
                  <div style={{ height: '100%', width: `${visitPct}%`, borderRadius: 4, background: visitPct >= 100 ? B.green : `linear-gradient(90deg, ${B.darkRed}, ${B.red}, ${B.orange})`, transition: 'width 0.5s ease', boxShadow: '0 0 8px rgba(217,79,43,0.3)' }} />
                </div>
                <div style={{ fontSize: 11, color: B.gray, marginTop: 6 }}>{visitPct}% of target — {visitGap > 0 ? `${visitGap} visits to reach sustainability` : '🎯 Target reached!'}</div>
              </div>
              {[
                { label: 'Reports In', value: `${reportsIn}/${coordinators.length}`, color: reportsIn < coordinators.length ? B.danger : B.green },
                { label: `Gap to ${CFG.visitTarget}`, value: visitGap > 0 ? visitGap : '✓', color: visitGap > 0 ? B.yellow : B.green },
                { label: 'Auths Expiring', value: totalAuthsExpiring, color: totalAuthsExpiring > 5 ? B.danger : B.yellow },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', borderLeft: `1px solid ${B.border}`, paddingLeft: 28 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: s.color, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
              <StatCard icon="👥" label="Patient Census" value={totalPatients || '—'} sub={hasPariox ? `${totalPatients} unique patients (Pariox)` : "Total from coordinator reports"} color={B.red} />
              <StatCard icon="✅" label="Visits Today" value={totalCompleted || '—'} sub={hasPariox ? `of ${totalScheduled} scheduled this week (Pariox)` : `of ${totalScheduled || '—'} scheduled today`} color={B.green} />
              <StatCard icon="⚠️" label="Missed Visits" value={totalMissed || 0} sub={hasPariox ? "Cancelled/no-show this week" : "Require same-day reschedule"} color={totalMissed > 5 ? B.danger : B.yellow} alert={totalMissed > 5 ? 'Above threshold' : null} />
              <StatCard icon="📋" label="New Referrals" value={totalReferrals || 0} sub="Received today" color={B.darkRed} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
              <StatCard icon="🔒" label="Auths Pending" value={totalAuthsPending || 0} sub="Awaiting approval" color={B.yellow} />
              <StatCard icon="⏰" label="Auths Expiring" value={totalAuthsExpiring || 0} sub="Within 7 days" color={totalAuthsExpiring > 3 ? B.danger : B.yellow} alert={totalAuthsExpiring > 3 ? 'Action required today' : null} />
              <StatCard icon="📌" label="Open Tasks" value={totalOpenTasks || 0} sub="Team total" color={B.orange} />
              <StatCard icon="📊" label="Morning Reports" value={`${reportsIn}/${coordinators.length}`} sub="Submitted by 9 AM" color={reportsIn < coordinators.length ? B.danger : B.green} alert={reportsIn < coordinators.length ? `${coordinators.length - reportsIn} missing` : null} />
            </div>

            {/* ── PATIENT CENSUS ──────────────────────────────── */}
            {(() => {
              const STATUS_META = {
                active:              { label: 'Active',             color: B.green,   bg: '#F0FDF4', border: '#BBF7D0', icon: '✅', desc: 'In treatment' },
                active_auth_pending: { label: 'Active–Auth Pend',   color: B.orange,  bg: '#FFF7ED', border: '#FED7AA', icon: '⏳', desc: 'Treating, auth at risk' },
                auth_pending:        { label: 'Auth Pending',       color: B.yellow,  bg: '#FFFBEB', border: '#FDE68A', icon: '🔒', desc: 'Blocked — no auth' },
                soc_pending:         { label: 'SOC Pending',        color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', icon: '📅', desc: 'Start of care pending' },
                eval_pending:        { label: 'Eval Pending',       color: '#1565C0', bg: '#EFF6FF', border: '#BFDBFE', icon: '🩺', desc: 'Pipeline' },
                waitlist:            { label: 'Waitlist',           color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', icon: '📋', desc: 'Needs scheduling' },
                on_hold:             { label: 'On Hold',            color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: '⏸️', desc: 'Revenue paused' },
                on_hold_facility:    { label: 'On Hold–Facility',   color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', icon: '🏥', desc: 'Facility hold' },
                on_hold_pt:          { label: 'On Hold–Pt Req',     color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', icon: '🙋', desc: 'Patient requested' },
                on_hold_md:          { label: 'On Hold–MD Req',     color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', icon: '👨‍⚕️', desc: 'MD ordered hold' },
                hospitalized:        { label: 'Hospitalized',       color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: '🚨', desc: 'In hospital' },
                discharge:           { label: 'Discharge',          color: '#BBA8A4', bg: '#FAFAFA', border: '#E5E7EB', icon: '📤', desc: 'Discharged' },
              };
              const totalCensus = hasCensus ? censusData.total : null;
              const activeCensus = hasCensus ? censusData.activeCensus : null;
              const regionKeys = hasCensus ? Object.keys(censusData.byRegion || {}).sort() : [];
              const displayCounts = hasCensus && selectedCensusRegion !== 'all' && censusData.byRegion[selectedCensusRegion]
                ? censusData.byRegion[selectedCensusRegion]
                : (hasCensus ? censusData.counts : null);
              const displayTotal = hasCensus && selectedCensusRegion !== 'all' && censusData.byRegion[selectedCensusRegion]
                ? censusData.byRegion[selectedCensusRegion].total
                : totalCensus;
              const displayActive = hasCensus && selectedCensusRegion !== 'all' && censusData.byRegion[selectedCensusRegion]
                ? censusData.byRegion[selectedCensusRegion].activeCensus
                : activeCensus;

              return (
                <div style={{ marginBottom: 20 }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                       <div style={{ fontSize: 12, fontWeight: 700, color: B.black, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Patient Census</div>
                       {hasCensus && <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: B.green }}>{displayActive} Active Census</div>}
                       {hasCensus && <div style={{ fontSize: 11, color: B.lightGray }}>{displayTotal} total{selectedCensusRegion !== 'all' ? ` in Region ${selectedCensusRegion}` : ''} · {censusData.lastUpdated}</div>}
                     </div>
                     <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                       {hasCensus && <span style={{ fontSize: 11, color: B.lightGray, marginRight: 2 }}>Region:</span>}
                       {hasCensus && ['all', ...regionKeys].map(r => (
                         <button key={r} onClick={() => setSelectedCensusRegion(r)} style={{
                           padding: '4px 9px', borderRadius: 6, border: `1px solid ${selectedCensusRegion === r ? B.red : B.border}`,
                           background: selectedCensusRegion === r ? '#FFF5F2' : 'transparent',
                           color: selectedCensusRegion === r ? B.red : B.gray,
                           fontSize: 11, fontWeight: selectedCensusRegion === r ? 700 : 400,
                           cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
                         }}>{r === 'all' ? 'All' : `R${r}`}</button>
                       ))}
                       {!hasCensus && <button onClick={() => setActiveTab('data')} style={{ background: 'none', border: `1px solid ${B.border}`, borderRadius: 7, color: B.gray, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Upload Census →</button>}
                     </div>
                   </div>

                   {hasCensus ? (
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                       {Object.entries(STATUS_META).map(([key, meta]) => {
                         const count = (displayCounts && displayCounts[key]) || 0;
                         const pct = displayTotal > 0 ? Math.round(count / displayTotal * 100) : 0;
                         return (
                           <div key={key} style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 12, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
                             <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: meta.color }} />
                             <div style={{ fontSize: 10, color: meta.color, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{meta.icon} {meta.label}</div>
                             <div style={{ fontSize: 26, fontWeight: 800, color: meta.color, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{count}</div>
                             <div style={{ fontSize: 10, color: meta.color, opacity: 0.7, marginTop: 3 }}>{pct}% of {selectedCensusRegion === 'all' ? 'census' : `Region ${selectedCensusRegion}`}</div>
                             <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{meta.desc}</div>
                             <div style={{ marginTop: 6, height: 3, background: 'rgba(0,0,0,0.08)', borderRadius: 2 }}>
                               <div style={{ height: '100%', width: `${pct}%`, background: meta.color, borderRadius: 2, transition: 'width 0.4s ease' }} />
                             </div>
                           </div>
                         );
                       })}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
                      {Object.entries(STATUS_META).map(([key, meta]) => (
                        <div key={key} style={{ background: '#FAFAFA', border: `1px solid ${B.border}`, borderRadius: 12, padding: '14px 16px', opacity: 0.6 }}>
                          <div style={{ fontSize: 10, color: B.lightGray, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{meta.icon} {meta.label}</div>
                          <div style={{ fontSize: 30, fontWeight: 800, color: B.lightGray, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>—</div>
                          <div style={{ fontSize: 10, color: B.lightGray, marginTop: 4 }}>{meta.desc}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Revenue at risk callout */}
                  {hasCensus && displayCounts && ((displayCounts.auth_pending||0) + (displayCounts.active_auth_pending||0) + (displayCounts.on_hold||0)) > 0 && (() => {
                    const atRisk = (displayCounts.auth_pending||0) + (displayCounts.active_auth_pending||0);
                    const onHold = (displayCounts.on_hold||0) + (displayCounts.on_hold_facility||0) + (displayCounts.on_hold_pt||0) + (displayCounts.on_hold_md||0);
                    const estRevenueRisk = atRisk * 3 * 85; // avg 3 visits/week @ $85
                    return (
                      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {atRisk > 0 && (
                          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>⚠️ Authorization Revenue Risk</div>
                              <div style={{ fontSize: 11, color: '#92400E', marginTop: 2 }}>{atRisk} patients blocked — estimated ${estRevenueRisk.toLocaleString()}/wk at risk</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: B.yellow, fontFamily: "'DM Mono', monospace" }}>{atRisk}</div>
                          </div>
                        )}
                        {onHold > 0 && (
                          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>⏸️ On Hold — Paused Revenue</div>
                              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{onHold} patients not generating visits{selectedCensusRegion !== 'all' ? ` in Region ${selectedCensusRegion}` : ''}</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#6B7280', fontFamily: "'DM Mono', monospace" }}>{onHold}</div>
                          </div>
                        )}
                        {(displayCounts.soc_pending||0) > 0 && (
                          <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#0284C7' }}>📅 SOC Pending — Ready to Start</div>
                              <div style={{ fontSize: 11, color: '#0284C7', marginTop: 2 }}>{displayCounts.soc_pending} patients awaiting start of care{selectedCensusRegion !== 'all' ? ` in Region ${selectedCensusRegion}` : ''}</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#0284C7', fontFamily: "'DM Mono', monospace" }}>{displayCounts.soc_pending}</div>
                          </div>
                        )}
                        {(displayCounts.hospitalized||0) > 0 && (
                          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>🚨 Hospitalized</div>
                              <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>{displayCounts.hospitalized} patients currently hospitalized — monitor for readmission risk</div>
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', fontFamily: "'DM Mono', monospace" }}>{displayCounts.hospitalized}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}


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



        {/* ── STAFF DIRECTORY ─────────────────────────────────── */}
        {activeTab === 'staff' && (() => {
          const FT_MIN = 24;
          const PT_MIN = 15;

          // Merge Pariox staffStats with saved directory settings
          const allStaff = Object.keys(staffDirectory).length > 0
            ? Object.values(staffDirectory).map(dir => ({
                ...dir,
                ...(csvData?.staffStats?.[dir.name] || {}),
                // Use saved settings
                employmentType: dir.employmentType || 'full_time',
                workType: dir.workType || 'in_person',
                status: dir.status || 'active',
                minVisits: dir.employmentType === 'part_time' ? PT_MIN : FT_MIN,
              }))
            : csvData?.staffStats
              ? Object.values(csvData.staffStats).map(s => ({
                  ...s,
                  employmentType: s.totalVisits >= 20 ? 'full_time' : 'part_time',
                  workType: ['LYMPHEDEMA PT','OT'].includes(s.discipline) ? 'telehealth' : 'in_person',
                  status: 'active',
                  minVisits: s.totalVisits >= 20 ? FT_MIN : PT_MIN,
                  notes: '',
                }))
              : [];

          const activeStaff = allStaff.filter(s => s.status === 'active');

          // Productivity status
          const getProdStatus = (s) => {
            const min = s.employmentType === 'part_time' ? PT_MIN : FT_MIN;
            if (s.totalVisits >= min) return 'meeting';
            if (s.totalVisits >= min * 0.75) return 'close';
            return 'below';
          };
          const prodColors = { meeting: B.green, close: B.yellow, below: B.danger };
          const prodBg = { meeting: '#F0FDF4', close: '#FFFBEB', below: '#FEF2F2' };
          const prodLabel = { meeting: 'Meeting Target', close: 'Near Target', below: 'Below Minimum' };

          // Filter + sort
          const filtered = activeStaff.filter(s => {
            if (staffFilter === 'below') return getProdStatus(s) === 'below';
            if (staffFilter === 'ft') return s.employmentType === 'full_time';
            if (staffFilter === 'pt') return s.employmentType === 'part_time';
            if (staffFilter === 'telehealth') return s.workType === 'telehealth';
            return true;
          });

          const sorted = [...filtered].sort((a, b) => {
            if (staffSort === 'visits_desc') return (b.totalVisits||0) - (a.totalVisits||0);
            if (staffSort === 'visits_asc') return (a.totalVisits||0) - (b.totalVisits||0);
            if (staffSort === 'name') return a.name.localeCompare(b.name);
            if (staffSort === 'region') return (a.primaryRegion||'').localeCompare(b.primaryRegion||'');
            return 0;
          });

          const saveStaff = (name, updates) => {
            const updated = { ...staffDirectory, [name]: { ...(staffDirectory[name] || {}), name, ...updates } };
            setStaffDirectory(updated);
            try { localStorage.setItem('axiom_staff_dir', JSON.stringify(updated)); } catch(e) {}
          };

          // Summary stats
          const belowMin = activeStaff.filter(s => getProdStatus(s) === 'below').length;
          const meetingMin = activeStaff.filter(s => getProdStatus(s) === 'meeting').length;
          const ftCount = activeStaff.filter(s => s.employmentType === 'full_time').length;
          const ptCount = activeStaff.filter(s => s.employmentType === 'part_time').length;
          const telehealthCount = activeStaff.filter(s => s.workType === 'telehealth').length;

          return (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.black, marginBottom: 4 }}>Staff Directory & Productivity</div>
                  <div style={{ fontSize: 13, color: B.gray }}>
                    {csvData ? `${activeStaff.length} active clinicians from Pariox · FT minimum: ${FT_MIN} visits/wk · PT minimum: ${PT_MIN} visits/wk` : 'Upload a Pariox export to populate staff data'}
                  </div>
                </div>
                {csvData?.rawCount && csvData.rawCount !== csvData.dedupedCount && (
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '10px 16px', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#1565C0', fontWeight: 700, marginBottom: 2 }}>✓ Visit Deduplication Active</div>
                    <div style={{ fontSize: 11, color: B.gray }}>{csvData.rawCount} raw rows → {csvData.dedupedCount} true visits</div>
                    <div style={{ fontSize: 11, color: B.gray }}>{csvData.rawCount - csvData.dedupedCount} PT+PTA joint visits corrected</div>
                  </div>
                )}
              </div>

              {!csvData ? (
                <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.black, marginBottom: 8 }}>No staff data loaded</div>
                  <div style={{ fontSize: 13, color: B.gray, marginBottom: 20 }}>Upload a Pariox export to auto-populate your staff directory</div>
                  <button onClick={() => setActiveTab('data')} style={{ background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 8, color: '#fff', padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Go to Data Tab →</button>
                </div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
                    {[
                      { label: 'Total Active', value: activeStaff.length, color: B.red, icon: '👥' },
                      { label: 'Full Time', value: ftCount, color: B.black, icon: '⏰' },
                      { label: 'Part Time', value: ptCount, color: B.orange, icon: '🕐' },
                      { label: 'Meeting Target', value: meetingMin, color: B.green, icon: '✅' },
                      { label: 'Below Minimum', value: belowMin, color: belowMin > 0 ? B.danger : B.green, icon: belowMin > 0 ? '⚠️' : '✓' },
                    ].map(m => (
                      <div key={m.label} style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center', boxShadow: '0 1px 3px rgba(139,26,16,0.05)' }}>
                        <div style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{m.icon} {m.label}</div>
                        <div style={{ fontSize: 26, fontWeight: 800, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Filters + Sort */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[
                      { key: 'all', label: 'All Staff' },
                      { key: 'below', label: `⚠ Below Minimum (${belowMin})` },
                      { key: 'ft', label: 'Full Time' },
                      { key: 'pt', label: 'Part Time' },
                      { key: 'telehealth', label: 'Telehealth' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setStaffFilter(f.key)} style={{
                        padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'inherit', border: 'none',
                        background: staffFilter === f.key ? `linear-gradient(135deg, ${B.red}, ${B.darkRed})` : B.cardBg,
                        color: staffFilter === f.key ? '#fff' : B.gray,
                        boxShadow: staffFilter === f.key ? '0 2px 8px rgba(217,79,43,0.25)' : '0 1px 3px rgba(0,0,0,0.08)',
                      }}>{f.label}</button>
                    ))}
                    <select value={staffSort} onChange={e => setStaffSort(e.target.value)} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: `1px solid ${B.border}`, fontSize: 12, fontFamily: 'inherit', color: B.black, background: '#fff', cursor: 'pointer', outline: 'none' }}>
                      <option value="visits_desc">Sort: Most Visits</option>
                      <option value="visits_asc">Sort: Least Visits</option>
                      <option value="name">Sort: Name A-Z</option>
                      <option value="region">Sort: Region</option>
                    </select>
                  </div>

                  {/* Staff table */}
                  <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '200px 130px 90px 90px 80px 80px 80px 100px 1fr', padding: '10px 20px', background: '#FBF7F6', borderBottom: `1px solid ${B.border}` }}>
                      {['Clinician','Discipline','Region','Type','Visits','Min','Status','Employment','Progress'].map((h,i) => (
                        <div key={h} style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: i > 2 ? 'center' : 'left' }}>{h}</div>
                      ))}
                    </div>

                    {sorted.length === 0 && (
                      <div style={{ padding: '30px', textAlign: 'center', color: B.lightGray, fontSize: 13 }}>No staff match this filter</div>
                    )}

                    {sorted.map((s, idx) => {
                      const min = s.employmentType === 'part_time' ? PT_MIN : FT_MIN;
                      const prodStatus = getProdStatus(s);
                      const pct = min > 0 ? Math.min(Math.round((s.totalVisits || 0) / min * 100), 100) : 0;
                      const isTelehealth = s.workType === 'telehealth';
                      const discColor = ['LYMPHEDEMA PT','OT'].includes(s.discipline) ? '#1565C0' : B.red;

                      return (
                        <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '200px 130px 90px 90px 80px 80px 80px 100px 1fr', padding: '12px 20px', borderBottom: idx < sorted.length-1 ? `1px solid #FAF4F2` : 'none', alignItems: 'center', background: prodStatus === 'below' ? '#FFFAFA' : '#fff' }}>

                          {/* Name */}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{s.name}</div>
                            {s.notes && <div style={{ fontSize: 10, color: B.lightGray, marginTop: 2 }}>{s.notes}</div>}
                          </div>

                          {/* Discipline */}
                          <div style={{ fontSize: 11, fontWeight: 600, color: discColor, background: `${discColor}10`, border: `1px solid ${discColor}25`, borderRadius: 6, padding: '3px 8px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.discipline}</div>

                          {/* Region */}
                          <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: B.red, fontFamily: "'DM Mono', monospace" }}>{s.primaryRegion || '—'}</div>

                          {/* Work type toggle */}
                          <div style={{ textAlign: 'center' }}>
                            <button onClick={() => saveStaff(s.name, { ...s, workType: s.workType === 'telehealth' ? 'in_person' : 'telehealth' })}
                              style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                background: isTelehealth ? '#EFF6FF' : '#FFF5F2',
                                color: isTelehealth ? '#1565C0' : B.red }}>
                              {isTelehealth ? '📱 Telehealth' : '🏠 In-Person'}
                            </button>
                          </div>

                          {/* Visits this week */}
                          <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 800, color: prodColors[prodStatus], fontFamily: "'DM Mono', monospace" }}>{s.totalVisits || 0}</div>

                          {/* Minimum */}
                          <div style={{ textAlign: 'center', fontSize: 13, color: B.lightGray, fontFamily: "'DM Mono', monospace" }}>{min}</div>

                          {/* Productivity status */}
                          <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                              background: prodBg[prodStatus], color: prodColors[prodStatus] }}>
                              {prodStatus === 'meeting' ? '✓' : prodStatus === 'close' ? '~' : '↓'} {prodLabel[prodStatus]}
                            </span>
                          </div>

                          {/* Employment type toggle */}
                          <div style={{ textAlign: 'center' }}>
                            <button onClick={() => saveStaff(s.name, { ...s, employmentType: s.employmentType === 'full_time' ? 'part_time' : 'full_time', minVisits: s.employmentType === 'full_time' ? PT_MIN : FT_MIN })}
                              style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                background: s.employmentType === 'full_time' ? '#F0FDF4' : '#FFFBEB',
                                color: s.employmentType === 'full_time' ? B.green : B.yellow }}>
                              {s.employmentType === 'full_time' ? 'Full Time' : 'Part Time'}
                            </button>
                          </div>

                          {/* Progress bar */}
                          <div style={{ paddingLeft: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 6, background: '#F5EDEB', borderRadius: 3 }}>
                                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: prodColors[prodStatus], transition: 'width 0.5s ease' }} />
                              </div>
                              <span style={{ fontSize: 10, color: B.lightGray, fontFamily: 'monospace', width: 30 }}>{pct}%</span>
                            </div>
                            {prodStatus === 'below' && (
                              <div style={{ fontSize: 10, color: B.danger, marginTop: 3 }}>Needs {min - (s.totalVisits||0)} more visits</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Productivity summary by discipline */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginTop: 16 }}>
                    {['LYMPHEDEMA PTA','COTA','LYMPHEDEMA PT','OT'].map(disc => {
                      const discStaff = activeStaff.filter(s => s.discipline === disc);
                      if (discStaff.length === 0) return null;
                      const avgVisits = discStaff.length > 0 ? Math.round(discStaff.reduce((s,c) => s+(c.totalVisits||0), 0) / discStaff.length) : 0;
                      const belowCount = discStaff.filter(s => getProdStatus(s) === 'below').length;
                      return (
                        <div key={disc} style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 3px rgba(139,26,16,0.05)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: B.black }}>{disc}</div>
                            <div style={{ fontSize: 11, color: B.lightGray }}>{discStaff.length} clinicians</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                            {[
                              { label: 'Avg Visits', value: avgVisits, color: B.red },
                              { label: 'Below Min', value: belowCount, color: belowCount > 0 ? B.danger : B.green },
                              { label: 'Total Visits', value: discStaff.reduce((s,c)=>s+(c.totalVisits||0),0), color: B.black },
                            ].map(m => (
                              <div key={m.label} style={{ textAlign: 'center', background: '#FBF7F6', borderRadius: 8, padding: '8px' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
                                <div style={{ fontSize: 9, color: B.lightGray, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{m.label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ── REGIONS ─────────────────────────────────────────── */}
        {activeTab === 'regions' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Regional Breakdown</div>
              <div style={{ fontSize: 13, color: B.gray }}>
                {csvData ? `Data from last Pariox upload — ${csvData.rowCount} visits across ${Object.keys(csvData.regionData || {}).length} regions` : 'Upload a Pariox export in the Data tab to see regional breakdowns'}
              </div>
            </div>

            {!csvData ? (
              <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.black, marginBottom: 8 }}>No Pariox data loaded</div>
                <div style={{ fontSize: 13, color: B.gray, marginBottom: 20 }}>Upload your weekly Pariox export in the Data tab to see per-region and per-clinician breakdowns</div>
                <button onClick={() => setActiveTab('data')} style={{ background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 8, color: '#fff', padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Go to Data Tab →</button>
              </div>
            ) : (
              <>
                {/* Region summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
                  {Object.entries(csvData.regionData || {}).sort(([,a],[,b]) => b.scheduled - a.scheduled).map(([region, data]) => {
                    const compPct = data.scheduled > 0 ? Math.round(data.completed / data.scheduled * 100) : 0;
                    const barColor = compPct >= 80 ? B.green : compPct >= 50 ? B.yellow : B.red;
                    return (
                      <div key={region} onClick={() => setSelectedRegion(selectedRegion === region ? null : region)}
                        style={{ background: selectedRegion === region ? '#FFF5F2' : B.cardBg, border: `1.5px solid ${selectedRegion === region ? B.red : B.border}`, borderRadius: 14, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 4px rgba(139,26,16,0.06)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${B.red}, ${B.orange})` }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: B.red, fontFamily: "'DM Mono', monospace" }}>Region {region}</div>
                            <div style={{ fontSize: 11, color: B.lightGray, marginTop: 2 }}>{data.clinicians} clinicians · {data.patients} patients</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 24, fontWeight: 800, color: barColor, fontFamily: "'DM Mono', monospace" }}>{compPct}%</div>
                            <div style={{ fontSize: 10, color: B.lightGray }}>complete</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          {[
                            { label: 'Scheduled', value: data.scheduled, color: B.black },
                            { label: 'Completed', value: data.completed, color: B.green },
                          ].map(m => (
                            <div key={m.label} style={{ background: '#FBF7F6', borderRadius: 6, padding: '6px 10px', textAlign: 'center' }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
                              <div style={{ fontSize: 9, color: B.lightGray, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ height: 4, background: '#F5EDEB', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${compPct}%`, borderRadius: 2, background: barColor, transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ fontSize: 10, color: B.lightGray, marginTop: 6, textAlign: 'center' }}>Click to see clinicians ↓</div>
                      </div>
                    );
                  })}
                </div>

                {/* Clinician drill-down */}
                {selectedRegion && csvData.regionData[selectedRegion] && (
                  <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 6px rgba(139,26,16,0.08)' }}>
                    <div style={{ background: '#FFF5F2', borderBottom: `1px solid ${B.border}`, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: B.red }}>Region {selectedRegion} — Clinician Productivity</div>
                        <div style={{ fontSize: 12, color: B.gray, marginTop: 2 }}>{csvData.regionData[selectedRegion].clinicians} clinicians · {csvData.regionData[selectedRegion].scheduled} total visits this week</div>
                      </div>
                      <button onClick={() => setSelectedRegion(null)} style={{ background: 'none', border: `1px solid ${B.border}`, borderRadius: 8, color: B.gray, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Close</button>
                    </div>

                    {/* Clinician table header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '220px 100px 100px 100px 1fr', padding: '10px 24px', background: '#FBF7F6', borderBottom: `1px solid ${B.border}` }}>
                      {['Clinician', 'Scheduled', 'Completed', 'Completion', 'Progress'].map((h, i) => (
                        <div key={h} style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: i > 0 ? 'center' : 'left' }}>{h}</div>
                      ))}
                    </div>

                    {(csvData.regionData[selectedRegion].clinicianList || [])
                      .sort((a, b) => b.scheduled - a.scheduled)
                      .map((clinician, idx) => {
                        const pct = clinician.scheduled > 0 ? Math.round(clinician.completed / clinician.scheduled * 100) : 0;
                        const barColor = pct >= 80 ? B.green : pct >= 40 ? B.yellow : pct > 0 ? B.red : '#E5D5D0';
                        return (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '220px 100px 100px 100px 1fr', padding: '12px 24px', borderBottom: `1px solid #FAF4F2`, alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{clinician.name}</div>
                              <div style={{ fontSize: 10, color: B.lightGray }}>{clinician.patients} patients</div>
                            </div>
                            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: B.black, fontFamily: "'DM Mono', monospace" }}>{clinician.scheduled}</div>
                            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: clinician.completed > 0 ? B.green : B.lightGray, fontFamily: "'DM Mono', monospace" }}>{clinician.completed}</div>
                            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: barColor, fontFamily: "'DM Mono', monospace" }}>{pct}%</div>
                            <div style={{ paddingLeft: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 6, background: '#F5EDEB', borderRadius: 3 }}>
                                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: barColor, transition: 'width 0.5s ease' }} />
                                </div>
                                <span style={{ fontSize: 10, color: B.lightGray, width: 28, textAlign: 'right' }}>{clinician.scheduled}v</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                    {/* Region summary footer */}
                    <div style={{ display: 'grid', gridTemplateColumns: '220px 100px 100px 100px 1fr', padding: '12px 24px', background: '#FFF5F2', borderTop: `1px solid ${B.border}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: B.red }}>REGION {selectedRegion} TOTAL</div>
                      <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: B.black, fontFamily: "'DM Mono', monospace" }}>{csvData.regionData[selectedRegion].scheduled}</div>
                      <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: B.green, fontFamily: "'DM Mono', monospace" }}>{csvData.regionData[selectedRegion].completed}</div>
                      <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: B.red, fontFamily: "'DM Mono', monospace" }}>
                        {csvData.regionData[selectedRegion].scheduled > 0 ? Math.round(csvData.regionData[selectedRegion].completed / csvData.regionData[selectedRegion].scheduled * 100) : 0}%
                      </div>
                      <div />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
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


        {/* ── SCORECARD ───────────────────────────────────────── */}
        {activeTab === 'scorecard' && (() => {
          const kpis = [
            {
              label: 'Weekly Visits', value: manualVisits, target: CFG.visitTarget,
              pct: Math.round(manualVisits/CFG.visitTarget*100),
              status: manualVisits >= CFG.visitTarget ? 'green' : manualVisits >= CFG.visitTarget*0.8 ? 'yellow' : 'red',
              sub: `${CFG.visitTarget - manualVisits > 0 ? (CFG.visitTarget - manualVisits) + ' below target' : 'Target met ✓'}`,
              icon: '📅'
            },
            {
              label: 'Active Census', value: hasCensus ? censusData.activeCensus : (totalPatients || '—'), target: `${CFG.activeCensusTarget}+`,
              pct: hasCensus ? Math.min(Math.round(censusData.activeCensus/CFG.activeCensusTarget*100),100) : (totalPatients ? Math.min(Math.round(totalPatients/CFG.activeCensusTarget*100),100) : 0),
              status: (hasCensus ? censusData.activeCensus : totalPatients) >= CFG.activeCensusTarget ? 'green' : (hasCensus ? censusData.activeCensus : totalPatients) >= CFG.activeCensusTarget*0.8 ? 'yellow' : 'red',
              sub: totalPatients ? `${totalPatients} active patients` : 'Submit morning reports',
              icon: '👥'
            },
            {
              label: 'Visit Completion Rate', value: totalScheduled > 0 ? `${Math.round(totalCompleted/totalScheduled*100)}%` : '—', target: '90%+',
              pct: totalScheduled > 0 ? Math.round(totalCompleted/totalScheduled*100) : 0,
              status: totalScheduled > 0 && (totalCompleted/totalScheduled) >= 0.9 ? 'green' : totalScheduled > 0 && (totalCompleted/totalScheduled) >= 0.75 ? 'yellow' : 'red',
              sub: `${totalCompleted} of ${totalScheduled} visits completed`,
              icon: '✅'
            },
            {
              label: 'Auth Expiry Risk', value: totalAuthsExpiring, target: '0',
              pct: Math.max(0, 100 - (totalAuthsExpiring * 10)),
              status: totalAuthsExpiring === 0 ? 'green' : totalAuthsExpiring <= 3 ? 'yellow' : 'red',
              sub: `${totalAuthsExpiring} auths expiring within 7 days`,
              icon: '⏰'
            },
            {
              label: 'Morning Reports', value: `${reportsIn}/${coordinators.length}`, target: `${coordinators.length}/${coordinators.length}`,
              pct: coordinators.length > 0 ? Math.round(reportsIn/coordinators.length*100) : 0,
              status: reportsIn === coordinators.length ? 'green' : reportsIn >= coordinators.length*0.75 ? 'yellow' : 'red',
              sub: reportsIn < coordinators.length ? `${coordinators.length - reportsIn} coordinators not reporting` : 'All reports received',
              icon: '📊'
            },
            {
              label: 'Missed Visits', value: totalMissed, target: '< 5/day',
              pct: Math.max(0, 100 - (totalMissed * 10)),
              status: totalMissed <= 2 ? 'green' : totalMissed <= 5 ? 'yellow' : 'red',
              sub: totalMissed > 0 ? `${totalMissed} visits need same-day reschedule` : 'No missed visits today',
              icon: '⚠️'
            },
            {
              label: 'Expansion Progress', value: '3 States', target: 'Live by Q3',
              pct: Math.round((Object.values(expansionData).reduce((s,e) => s + e.credentialing, 0) / (Object.keys(expansionData).length * 100)) * 100),
              status: 'yellow',
              sub: `GA ${expansionData.GA?.credentialing||0}% · TX ${expansionData.TX?.credentialing||0}% · NC ${expansionData.NC?.credentialing||0}%`,
              icon: '🗺️'
            },
          ];
          const statusColors = { green: B.green, yellow: B.yellow, red: B.danger };
          const statusBg = { green: '#F0FDF4', yellow: '#FFFBEB', red: '#FEF2F2' };
          const statusBorder = { green: '#BBF7D0', yellow: '#FDE68A', red: '#FECACA' };
          const weekStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const greenCount = kpis.filter(k => k.status === 'green').length;
          const redCount = kpis.filter(k => k.status === 'red').length;

          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.black, marginBottom: 4 }}>Weekly KPI Scorecard</div>
                  <div style={{ fontSize: 13, color: B.gray }}>Week of {weekStr} — your 90-second Monday morning check</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: B.green, fontFamily: "'DM Mono', monospace" }}>{greenCount}</div>
                    <div style={{ fontSize: 10, color: B.lightGray, textTransform: 'uppercase', letterSpacing: '0.08em' }}>On Track</div>
                  </div>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: B.danger, fontFamily: "'DM Mono', monospace" }}>{redCount}</div>
                    <div style={{ fontSize: 10, color: B.lightGray, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Needs Action</div>
                  </div>
                </div>
              </div>

              {/* KPI Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
                {kpis.map(kpi => (
                  <div key={kpi.label} style={{ background: statusBg[kpi.status], border: `1px solid ${statusBorder[kpi.status]}`, borderRadius: 14, padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: statusColors[kpi.status] }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{kpi.icon} {kpi.label}</div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: statusColors[kpi.status], fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{kpi.value}</div>
                        <div style={{ fontSize: 11, color: B.gray, marginTop: 6 }}>{kpi.sub}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: B.lightGray, marginBottom: 4 }}>Target: {kpi.target}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: statusColors[kpi.status], fontFamily: "'DM Mono', monospace" }}>{kpi.pct}%</div>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${kpi.pct}%`, borderRadius: 3, background: statusColors[kpi.status], transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Weekly Executive Report Generator */}
              <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '24px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)', marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.black, marginBottom: 4 }}>📋 Weekly Executive Report</div>
                <div style={{ fontSize: 12, color: B.gray, marginBottom: 16 }}>Auto-generated from your data — ready to send to Dustin</div>
                <div style={{ background: '#FBF7F6', border: `1px solid ${B.border}`, borderRadius: 10, padding: '20px', fontFamily: "'DM Mono', monospace", fontSize: 12, color: B.black, lineHeight: 1.8, whiteSpace: 'pre-wrap', marginBottom: 14 }}>{`AXIOMHEALTH — WEEKLY OPERATIONS REPORT
Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
Prepared by: Liam O'Brien, Director of Operations
${'─'.repeat(50)}

VISIT PERFORMANCE
• Weekly Visits: ${manualVisits} / ${CFG.visitTarget} target (${Math.round(manualVisits/CFG.visitTarget*100)}%)
• Gap to Sustainability Threshold: ${visitGap > 0 ? visitGap + ' visits' : 'TARGET MET ✓'}
• Visit Completion Rate: ${totalScheduled > 0 ? Math.round(totalCompleted/totalScheduled*100) + '%' : 'Pending coordinator reports'}
• Missed Visits: ${totalMissed} (${totalMissed <= 2 ? 'Within threshold' : 'ABOVE threshold — action taken'})

PATIENT CENSUS
• Active Patients: ${totalPatients || 'Pending'}
• New Referrals Today: ${totalReferrals}
• Authorization Flags: ${totalAuthsExpiring} auths expiring within 7 days

TEAM ACCOUNTABILITY
• Morning Reports Submitted: ${reportsIn}/${coordinators.length}${reportsIn < coordinators.length ? ' ⚠ ' + (coordinators.length-reportsIn) + ' MISSING' : ' ✓ ALL RECEIVED'}
• Open Tasks: ${totalOpenTasks}

REGIONAL PERFORMANCE${csvData?.regionData ? '\n' + Object.entries(csvData.regionData).sort(([,a],[,b]) => b.scheduled - a.scheduled).map(([r,d]) => `• Region ${r}: ${d.scheduled} scheduled, ${d.completed} completed (${d.scheduled > 0 ? Math.round(d.completed/d.scheduled*100) : 0}%) — ${d.clinicians} clinicians`).join('\n') : '\nUpload Pariox data to populate regional breakdown'}

EXPANSION STATUS
• Georgia: ${expansionData.GA?.credentialing||0}% credentialed — ${expansionData.GA?.staffHired||0}/${expansionData.GA?.staffNeeded||0} staff hired — Target: ${expansionData.GA?.firstPatientDate||'TBD'}
• Texas: ${expansionData.TX?.credentialing||0}% credentialed — ${expansionData.TX?.staffHired||0}/${expansionData.TX?.staffNeeded||0} staff hired — Target: ${expansionData.TX?.firstPatientDate||'TBD'}
• North Carolina: ${expansionData.NC?.credentialing||0}% credentialed — ${expansionData.NC?.staffHired||0}/${expansionData.NC?.staffNeeded||0} staff hired — Target: ${expansionData.NC?.firstPatientDate||'TBD'}
${'─'.repeat(50)}
${directorNotes.length > 0 ? 'DIRECTOR NOTES\n' + directorNotes.slice(0,3).map(n => `• [${n.date}] ${n.text}`).join('\n') : ''}`}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { navigator.clipboard.writeText(document.querySelector('[data-report]')?.textContent || ''); }} style={{ background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 8, color: '#fff', padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(217,79,43,0.25)' }}
                    onClick={() => {
                      const text = document.querySelector('.report-text')?.innerText;
                      if (text) navigator.clipboard.writeText(text).then(() => alert('Report copied to clipboard — paste into email or Slack'));
                    }}>📋 Copy Report</button>
                </div>
              </div>

              {/* Director Notes */}
              <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '24px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: B.black, marginBottom: 4 }}>📝 Director's Notes</div>
                <div style={{ fontSize: 12, color: B.gray, marginBottom: 16 }}>Context that lives with your data — visible in the weekly report</div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input value={newNote} onChange={e => setNewNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newNote.trim()) { const note = { text: newNote.trim(), date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), id: Date.now() }; const updated = [note, ...directorNotes].slice(0, 20); setDirectorNotes(updated); try { localStorage.setItem('axiom_director_notes', JSON.stringify(updated)); } catch(e){} setNewNote(''); }}}
                    placeholder="Add a note for this week... (press Enter to save)"
                    style={{ flex: 1, padding: '10px 14px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: B.black }} />
                  <button onClick={() => { if (!newNote.trim()) return; const note = { text: newNote.trim(), date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), id: Date.now() }; const updated = [note, ...directorNotes].slice(0, 20); setDirectorNotes(updated); try { localStorage.setItem('axiom_director_notes', JSON.stringify(updated)); } catch(e){} setNewNote(''); }}
                    style={{ background: B.red, border: 'none', borderRadius: 8, color: '#fff', padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add</button>
                </div>
                {directorNotes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: B.lightGray, fontSize: 13, background: '#FDFAF9', borderRadius: 10, border: `1px dashed ${B.border}` }}>No notes yet — add context about this week's performance</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {directorNotes.map(note => (
                      <div key={note.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: '#FBF7F6', border: `1px solid ${B.border}`, borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: B.lightGray, whiteSpace: 'nowrap', marginTop: 1, fontFamily: 'monospace' }}>{note.date}</span>
                        <span style={{ flex: 1, fontSize: 13, color: B.black }}>{note.text}</span>
                        <button onClick={() => { const updated = directorNotes.filter(n => n.id !== note.id); setDirectorNotes(updated); try { localStorage.setItem('axiom_director_notes', JSON.stringify(updated)); } catch(e){} }}
                          style={{ background: 'none', border: 'none', color: B.lightGray, cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── EXPANSION ────────────────────────────────────────── */}
        {activeTab === 'expansion' && (() => {
          const statusConfig = {
            'Live': { color: B.green, bg: '#F0FDF4', border: '#BBF7D0' },
            'In Progress': { color: B.red, bg: '#FFF5F2', border: '#FDDDD5' },
            'Planning': { color: B.yellow, bg: '#FFFBEB', border: '#FDE68A' },
            'On Hold': { color: B.lightGray, bg: '#F9FAFB', border: '#E5E7EB' },
          };
          const saveExpansion = (data) => { setExpansionData(data); try { localStorage.setItem('axiom_expansion', JSON.stringify(data)); } catch(e){} };

          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.black, marginBottom: 4 }}>Expansion Tracker</div>
                  <div style={{ fontSize: 13, color: B.gray }}>Georgia · Texas · North Carolina — live status for every leadership conversation</div>
                </div>
                <div style={{ background: '#FFF5F2', border: `1px solid #FDDDD5`, borderRadius: 10, padding: '10px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Expansion Target</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: B.red, fontFamily: "'DM Mono', monospace" }}>300+ Staff · $200K/wk</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {Object.entries(expansionData).map(([code, state]) => {
                  const sc = statusConfig[state.status] || statusConfig['Planning'];
                  const isEditing = editingExpansion === code;
                  const overallPct = Math.round((state.credentialing + (state.staffHired/Math.max(state.staffNeeded,1)*100)) / 2);

                  return (
                    <div key={code} style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                      {/* State header */}
                      <div style={{ background: sc.bg, borderBottom: `1px solid ${sc.border}`, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ fontSize: 28, fontWeight: 800, color: sc.color, fontFamily: "'DM Mono', monospace" }}>{code}</div>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: B.black }}>{state.state}</div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 12, padding: '2px 10px' }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: sc.color }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: sc.color, letterSpacing: '0.06em' }}>{state.status}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ textAlign: 'center', borderRight: `1px solid ${B.border}`, paddingRight: 16 }}>
                            <div style={{ fontSize: 24, fontWeight: 800, color: sc.color, fontFamily: "'DM Mono', monospace" }}>{overallPct}%</div>
                            <div style={{ fontSize: 10, color: B.lightGray, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall</div>
                          </div>
                          <button onClick={() => setEditingExpansion(isEditing ? null : code)} style={{ background: isEditing ? B.green : `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 8, color: '#fff', padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {isEditing ? '✓ Save' : '✏️ Edit'}
                          </button>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div style={{ padding: '20px 24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
                          {[
                            { label: 'Credentialing', value: isEditing ? null : `${state.credentialing}%`, editKey: 'credentialing', type: 'range', color: sc.color },
                            { label: 'Staff Hired', value: isEditing ? null : `${state.staffHired}/${state.staffNeeded}`, editKey: 'staffHired', type: 'number', color: B.black },
                            { label: 'First Patient', value: isEditing ? null : state.firstPatientDate, editKey: 'firstPatientDate', type: 'date', color: B.black },
                            { label: 'Weekly Target', value: isEditing ? null : `${state.weeklyVisitTarget} visits`, editKey: 'weeklyVisitTarget', type: 'number', color: B.black },
                          ].map(m => (
                            <div key={m.label} style={{ background: '#FBF7F6', borderRadius: 10, padding: '12px 14px', border: `1px solid ${B.border}` }}>
                              <div style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{m.label}</div>
                              {isEditing ? (
                                m.type === 'range' ? (
                                  <div>
                                    <input type="range" min="0" max="100" value={state[m.editKey]}
                                      onChange={e => saveExpansion({ ...expansionData, [code]: { ...state, [m.editKey]: parseInt(e.target.value) } })}
                                      style={{ width: '100%', accentColor: B.red }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: sc.color, fontFamily: "'DM Mono', monospace", textAlign: 'center' }}>{state[m.editKey]}%</div>
                                  </div>
                                ) : (
                                  <input type={m.type === 'date' ? 'date' : 'number'} value={state[m.editKey]}
                                    onChange={e => saveExpansion({ ...expansionData, [code]: { ...state, [m.editKey]: m.type === 'number' ? parseInt(e.target.value)||0 : e.target.value } })}
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${B.border}`, borderRadius: 6, fontSize: 13, fontFamily: "'DM Mono', monospace", outline: 'none', color: B.black, background: '#fff' }} />
                                )
                              ) : (
                                <div style={{ fontSize: 16, fontWeight: 700, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Credentialing progress bar */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: B.gray }}>Credentialing Progress</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: sc.color, fontFamily: 'monospace' }}>{state.credentialing}%</span>
                          </div>
                          <div style={{ height: 8, background: '#F5EDEB', borderRadius: 4 }}>
                            <div style={{ height: '100%', width: `${state.credentialing}%`, borderRadius: 4, background: `linear-gradient(90deg, ${B.darkRed}, ${B.red}, ${B.orange})`, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>

                        {/* Status selector + notes */}
                        {isEditing && (
                          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, marginTop: 12 }}>
                            <div>
                              <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Status</div>
                              <select value={state.status} onChange={e => saveExpansion({ ...expansionData, [code]: { ...state, status: e.target.value } })}
                                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: B.black, background: '#fff' }}>
                                {['Planning', 'In Progress', 'Live', 'On Hold'].map(s => <option key={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Notes</div>
                              <input value={state.notes} onChange={e => saveExpansion({ ...expansionData, [code]: { ...state, notes: e.target.value } })}
                                placeholder="Key blockers, next steps, contacts..."
                                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: B.black, background: '#fff' }} />
                            </div>
                          </div>
                        )}
                        {!isEditing && state.notes && (
                          <div style={{ padding: '10px 14px', background: '#FFF5F2', borderRadius: 8, borderLeft: `3px solid #FDDDD5`, fontSize: 12, color: B.black }}>
                            {state.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Combined expansion impact */}
              <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '20px 24px', marginTop: 16, boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: B.black, marginBottom: 14 }}>Projected Impact When All 3 States Are Live</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {[
                    { label: 'Additional Weekly Visits', value: Object.values(expansionData).reduce((s,e) => s + (e.weeklyVisitTarget||0), 0), color: B.red },
                    { label: 'Combined Weekly Target', value: CFG.visitTarget + Object.values(expansionData).reduce((s,e) => s + (e.weeklyVisitTarget||0), 0), color: B.darkRed },
                    { label: 'Staff to Hire', value: Object.values(expansionData).reduce((s,e) => s + Math.max(0, (e.staffNeeded||0)-(e.staffHired||0)), 0), color: B.orange },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#FBF7F6', borderRadius: 10, padding: '14px', textAlign: 'center', border: `1px solid ${B.border}` }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: m.color, fontFamily: "'DM Mono', monospace" }}>{m.value}</div>
                      <div style={{ fontSize: 11, color: B.lightGray, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}


        {/* ── STAFF DIRECTORY ─────────────────────────────────── */}
        {activeTab === 'staff' && (() => {
          const DISC_CONFIG = {
            'LYMPHEDEMA PT':  { label: 'PT',   color: '#1565C0', bg: '#EFF6FF', border: '#BFDBFE', role: 'supervisory' },
            'LYMPHEDEMA PTA': { label: 'PTA',  color: B.red,     bg: '#FFF5F2', border: '#FDDDD5', role: 'treating' },
            'OT':             { label: 'OT',   color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', role: 'supervisory' },
            'COTA':           { label: 'COTA', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', role: 'treating' },
          };
          const CLASS_CONFIG = {
            telehealth: { label: 'Telehealth', color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', icon: '💻' },
            field:      { label: 'Field',      color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', icon: '🏠' },
          };

          const allStaff = Object.values(staffDirectory);
          const filtered = allStaff
            .filter(s => {
              if (staffFilter === 'telehealth') return s.classification === 'telehealth';
              if (staffFilter === 'field') return s.classification === 'field';
              if (staffFilter === 'pt') return s.discipline === 'LYMPHEDEMA PT';
              if (staffFilter === 'pta') return s.discipline === 'LYMPHEDEMA PTA';
              if (staffFilter === 'ot') return s.discipline === 'OT';
              if (staffFilter === 'cota') return s.discipline === 'COTA';
              if (staffFilter === 'mismatch') return s.classification === 'telehealth' && s.discipline.includes('PTA') || s.classification === 'telehealth' && s.discipline === 'COTA';
              return true;
            })
            .filter(s => !staffSearch || s.name.toLowerCase().includes(staffSearch.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name));

          const telehealthCount = allStaff.filter(s => s.classification === 'telehealth').length;
          const fieldCount = allStaff.filter(s => s.classification === 'field').length;
          const mismatches = allStaff.filter(s =>
            (s.classification === 'telehealth' && (s.discipline === 'LYMPHEDEMA PTA' || s.discipline === 'COTA')) ||
            (s.classification === 'field' && (s.discipline === 'LYMPHEDEMA PT' || s.discipline === 'OT') && s.regionCount <= 2)
          );

          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: B.black, marginBottom: 4 }}>Staff Directory</div>
                  <div style={{ fontSize: 13, color: B.gray }}>
                    {allStaff.length > 0
                      ? `${allStaff.length} clinicians · ${telehealthCount} telehealth · ${fieldCount} field${mismatches.length > 0 ? ` · ⚠️ ${mismatches.length} classification to review` : ''}`
                      : 'Upload a Pariox report to auto-populate the directory'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {allStaff.length === 0 && (
                    <button onClick={() => setActiveTab('data')} style={{ background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 8, color: '#fff', padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Upload Pariox →</button>
                  )}
                </div>
              </div>

              {/* Mismatch alert */}
              {mismatches.length > 0 && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>Classification Review Required</div>
                    <div style={{ fontSize: 12, color: '#92400E' }}>
                      {mismatches.map(s => `${s.name} (${DISC_CONFIG[s.discipline]?.label || s.discipline}) is marked as ${s.classification}`).join(' · ')}
                    </div>
                    <button onClick={() => setStaffFilter('mismatch')} style={{ marginTop: 8, background: '#92400E', border: 'none', borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Review these →</button>
                  </div>
                </div>
              )}

              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'PT / Supervisory', value: allStaff.filter(s => s.discipline === 'LYMPHEDEMA PT').length, color: '#1565C0', icon: '🩺' },
                  { label: 'PTA / Treating', value: allStaff.filter(s => s.discipline === 'LYMPHEDEMA PTA').length, color: B.red, icon: '👐' },
                  { label: 'OT / Supervisory', value: allStaff.filter(s => s.discipline === 'OT').length, color: '#6D28D9', icon: '🖐️' },
                  { label: 'COTA / Treating', value: allStaff.filter(s => s.discipline === 'COTA').length, color: '#059669', icon: '🤝' },
                ].map(c => (
                  <div key={c.label} style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{c.icon} {c.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: c.color, fontFamily: "'DM Mono', monospace" }}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Filters + Search */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder="Search by name..."
                  style={{ padding: '8px 14px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: B.black, width: 220 }} />
                {[
                  { key: 'all', label: 'All' },
                  { key: 'telehealth', label: '💻 Telehealth' },
                  { key: 'field', label: '🏠 Field' },
                  { key: 'pt', label: 'PT' },
                  { key: 'pta', label: 'PTA' },
                  { key: 'ot', label: 'OT' },
                  { key: 'cota', label: 'COTA' },
                  ...(mismatches.length > 0 ? [{ key: 'mismatch', label: `⚠️ Review (${mismatches.length})` }] : []),
                ].map(f => (
                  <button key={f.key} onClick={() => setStaffFilter(f.key)} style={{
                    padding: '7px 14px', borderRadius: 8, border: `1px solid ${staffFilter === f.key ? B.red : B.border}`,
                    background: staffFilter === f.key ? '#FFF5F2' : 'transparent',
                    color: staffFilter === f.key ? B.red : B.gray,
                    fontSize: 12, fontWeight: staffFilter === f.key ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit'
                  }}>{f.label}</button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: B.lightGray }}>{filtered.length} clinicians</span>
              </div>

              {/* Staff Table */}
              {allStaff.length === 0 ? (
                <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: B.black, marginBottom: 8 }}>Directory is empty</div>
                  <div style={{ fontSize: 13, color: B.gray }}>Upload a Pariox report and the directory auto-populates with all clinicians, disciplines, and regions</div>
                </div>
              ) : (
                <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                  {/* Table Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 90px 120px 130px 90px 90px 1fr', padding: '10px 20px', background: '#FBF7F6', borderBottom: `1px solid ${B.border}` }}>
                    {['Clinician', 'Disc', 'Classification', 'Regions', 'Visits', 'Patients', 'Actions'].map((h, i) => (
                      <div key={h} style={{ fontSize: 10, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: i > 1 && i < 6 ? 'center' : 'left' }}>{h}</div>
                    ))}
                  </div>

                  {filtered.map(staff => {
                    const dc = DISC_CONFIG[staff.discipline] || { label: staff.discipline, color: B.gray, bg: '#F9FAFB', border: '#E5E7EB' };
                    const cc = CLASS_CONFIG[staff.classification] || CLASS_CONFIG.field;
                    const isEditing = editingStaff === staff.name;
                    const isMismatch = mismatches.find(m => m.name === staff.name);

                    return (
                      <div key={staff.name} style={{ borderBottom: `1px solid #FAF4F2`, background: isMismatch ? '#FFFBEB' : 'transparent' }}>
                        {/* Main row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 90px 120px 130px 90px 90px 1fr', padding: '12px 20px', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{staff.name}</div>
                            {staff.status === 'inactive' && <div style={{ fontSize: 10, color: B.lightGray }}>Inactive</div>}
                            {isMismatch && <div style={{ fontSize: 10, color: '#D97706', fontWeight: 600 }}>⚠ Review classification</div>}
                          </div>

                          <div>
                            <span style={{ background: dc.bg, border: `1px solid ${dc.border}`, color: dc.color, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>{dc.label}</span>
                          </div>

                          <div>
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: 4 }}>
                                {['telehealth', 'field'].map(cls => (
                                  <button key={cls} onClick={() => {
                                    const updated = { ...staffDirectory, [staff.name]: { ...staff, classification: cls } };
                                    saveStaffDirectory(updated);
                                  }} style={{
                                    padding: '4px 8px', borderRadius: 6, border: `1px solid ${staff.classification === cls ? CLASS_CONFIG[cls].border : B.border}`,
                                    background: staff.classification === cls ? CLASS_CONFIG[cls].bg : 'transparent',
                                    color: staff.classification === cls ? CLASS_CONFIG[cls].color : B.lightGray,
                                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
                                  }}>{CLASS_CONFIG[cls].icon} {CLASS_CONFIG[cls].label}</button>
                                ))}
                              </div>
                            ) : (
                              <span style={{ background: cc.bg, border: `1px solid ${cc.border}`, color: cc.color, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>{cc.icon} {cc.label}</span>
                            )}
                          </div>

                          <div style={{ textAlign: 'center', fontSize: 11, color: B.gray }}>{staff.regions}</div>
                          <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: B.black, fontFamily: "'DM Mono', monospace" }}>{staff.weeklyVisits || 0}</div>
                          <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: B.black, fontFamily: "'DM Mono', monospace" }}>{staff.uniquePatients || 0}</div>

                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditingStaff(isEditing ? null : staff.name)} style={{
                              background: isEditing ? B.green : 'transparent', border: `1px solid ${isEditing ? B.green : B.border}`,
                              borderRadius: 7, color: isEditing ? '#fff' : B.gray, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
                            }}>{isEditing ? '✓ Done' : 'Edit'}</button>
                            <button onClick={() => {
                              const updated = { ...staffDirectory, [staff.name]: { ...staff, status: staff.status === 'inactive' ? 'active' : 'inactive' } };
                              saveStaffDirectory(updated);
                            }} style={{
                              background: 'transparent', border: `1px solid ${B.border}`,
                              borderRadius: 7, color: staff.status === 'inactive' ? B.green : B.lightGray,
                              padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit'
                            }}>{staff.status === 'inactive' ? 'Activate' : 'Deactivate'}</button>
                          </div>
                        </div>

                        {/* Edit panel */}
                        {isEditing && (
                          <div style={{ margin: '0 20px 16px', background: '#FBF7F6', border: `1px solid ${B.border}`, borderRadius: 10, padding: '16px' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: B.black, marginBottom: 12 }}>Edit {staff.name}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                              <div>
                                <label style={{ display: 'block', fontSize: 11, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Classification</label>
                                <select value={staff.classification}
                                  onChange={e => saveStaffDirectory({ ...staffDirectory, [staff.name]: { ...staff, classification: e.target.value } })}
                                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: B.black, background: '#fff', outline: 'none' }}>
                                  <option value="telehealth">💻 Telehealth</option>
                                  <option value="field">🏠 Field</option>
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: 11, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Status</label>
                                <select value={staff.status}
                                  onChange={e => saveStaffDirectory({ ...staffDirectory, [staff.name]: { ...staff, status: e.target.value } })}
                                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: B.black, background: '#fff', outline: 'none' }}>
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: 11, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Phone</label>
                                <input value={staff.phone || ''} onChange={e => saveStaffDirectory({ ...staffDirectory, [staff.name]: { ...staff, phone: e.target.value } })}
                                  placeholder="(407) 555-0100"
                                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: B.black, outline: 'none' }} />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: 11, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Email</label>
                                <input value={staff.email || ''} onChange={e => saveStaffDirectory({ ...staffDirectory, [staff.name]: { ...staff, email: e.target.value } })}
                                  placeholder="name@axiomhealth.com"
                                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: B.black, outline: 'none' }} />
                              </div>
                              <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: 11, color: B.gray, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Notes</label>
                                <input value={staff.notes || ''} onChange={e => saveStaffDirectory({ ...staffDirectory, [staff.name]: { ...staff, notes: e.target.value } })}
                                  placeholder="Schedule notes, supervision assignments, issues..."
                                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${B.border}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: B.black, outline: 'none' }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}


        {/* ── REVENUE ─────────────────────────────────────────── */}
        {activeTab === 'revenue' && (() => {
          const avgRate = CFG.avgReimbursement;
          const weeklyVisitRev = (csvData?.dedupedCount || manualVisits) * avgRate;
          const revTarget = CFG.revenueTarget;
          const revPct = Math.min(Math.round(weeklyVisitRev / revTarget * 100), 100);
          const revGap = Math.max(0, revTarget - weeklyVisitRev);
          const revStatus = revPct >= 100 ? 'green' : revPct >= 80 ? 'yellow' : 'red';
          const statusColors = { green: B.green, yellow: B.yellow, red: B.danger };

          // Auth risk revenue
          const authRiskPatients = hasCensus ? ((censusData.counts.auth_pending||0) + (censusData.counts.active_auth_pending||0)) : 0;
          const authRiskRev = authRiskPatients * CFG.authRiskVisitsPerWeek * avgRate;

          // On hold paused revenue
          const onHoldPatients = hasCensus ? ((censusData.counts.on_hold||0) + (censusData.counts.on_hold_facility||0) + (censusData.counts.on_hold_pt||0) + (censusData.counts.on_hold_md||0)) : 0;
          const onHoldRev = onHoldPatients * CFG.authRiskVisitsPerWeek * avgRate;

          // SOC pending potential
          const socPending = hasCensus ? (censusData.counts.soc_pending||0) : 0;
          const socPotential = socPending * CFG.authRiskVisitsPerWeek * avgRate;

          // Waitlist potential
          const waitlistPats = hasCensus ? (censusData.counts.waitlist||0) : 0;
          const waitlistPotential = waitlistPats * CFG.authRiskVisitsPerWeek * avgRate;

          // Payer mix — derived from Ref Source prefix (Insurance col is placeholder)
          const getPayerFromRef = (ref) => {
            const r = (ref || '').toUpperCase();
            if (r.startsWith('HU')) return 'Humana';
            if (r.startsWith('CP') || r.startsWith('CAR')) return 'CarePlus';
            if (r.startsWith('MED')) return 'Medicare/Devoted';
            if (r.startsWith('DH')) return 'Devoted Health';
            if (r.startsWith('FHC')) return 'Florida Health Care Plans';
            if (r.startsWith('AM') || r.startsWith('AC')) return 'Aetna';
            if (r.startsWith('CIG') || r.startsWith('HCIG')) return 'Cigna';
            if (r.startsWith('HF')) return 'HealthFirst';
            if (r.startsWith('PP')) return 'Private Pay (Self)';
            return 'Other';
          };
          const payerCounts = hasCensus ? censusData.patients.reduce((acc, p) => {
            const key = getPayerFromRef(p.ref);
            acc[key] = (acc[key]||0) + 1; return acc;
          }, {}) : {};
          const totalPayers = Object.values(payerCounts).reduce((s,v)=>s+v,0);

          const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n}`;

          return (
            <div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: B.black, marginBottom: 4 }}>Revenue Dashboard</div>
                <div style={{ fontSize: 13, color: B.gray }}>
                  Based on {fmt(avgRate)} avg reimbursement per visit — update in ⚙️ Settings
                </div>
              </div>

              {/* Revenue target banner */}
              <div style={{ background: `linear-gradient(135deg, ${B.darkRed}, ${B.red}, ${B.orange})`, borderRadius: 18, padding: '24px 32px', marginBottom: 24, position: 'relative', overflow: 'hidden', boxShadow: '0 4px 16px rgba(139,26,16,0.2)' }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', position: 'relative' }}>
                  <div style={{ flex: 1, minWidth: 250 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Estimated Weekly Revenue</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                      <span style={{ fontSize: 44, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{fmt(weeklyVisitRev)}</span>
                      <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)' }}>/ {fmt(revTarget)} target</span>
                    </div>
                    <div style={{ marginTop: 12, height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${revPct}%`, background: '#fff', borderRadius: 3, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>
                      {revPct >= 100 ? '🎯 Revenue target reached' : `${fmt(revGap)} gap to ${fmt(revTarget)} weekly target`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    {[
                      { label: 'Per Visit', value: fmt(avgRate) },
                      { label: 'Visits', value: csvData?.dedupedCount || manualVisits },
                      { label: 'Pace', value: `${revPct}%` },
                    ].map((s, i) => (
                      <div key={s.label} style={{ textAlign: 'center', paddingLeft: i > 0 ? 20 : 0, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Revenue cards row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
                {[
                  { label: 'Est. Weekly Revenue', value: fmt(weeklyVisitRev), sub: `${csvData?.dedupedCount || manualVisits} visits × ${fmt(avgRate)}`, color: B.green, icon: '💰' },
                  { label: 'Auth Risk Revenue', value: fmt(authRiskRev), sub: `${authRiskPatients} patients blocked`, color: B.yellow, icon: '🔒', alert: authRiskPatients > 10 ? 'High risk — action needed' : null },
                  { label: 'On Hold Paused Rev', value: fmt(onHoldRev), sub: `${onHoldPatients} patients on hold`, color: '#6B7280', icon: '⏸️' },
                  { label: 'SOC + Waitlist Pipeline', value: fmt(socPotential + waitlistPotential), sub: `${socPending + waitlistPats} patients ready to activate`, color: '#0284C7', icon: '📈' },
                ].map(c => (
                  <div key={c.label} style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${c.color}, transparent)` }} />
                    <div style={{ fontSize: 11, color: B.lightGray, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{c.icon} {c.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: c.color, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}>{c.value}</div>
                    <div style={{ fontSize: 11, color: B.gray, marginTop: 6 }}>{c.sub}</div>
                    {c.alert && <div style={{ fontSize: 11, color: B.danger, marginTop: 4, fontWeight: 600 }}>{c.alert}</div>}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Revenue by region */}
                <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: B.black, marginBottom: 16 }}>📊 Revenue by Region (Est.)</div>
                  {csvData?.regionData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.entries(csvData.regionData).sort(([,a],[,b]) => b.scheduled - a.scheduled).map(([region, data]) => {
                        const regionRev = data.scheduled * avgRate;
                        const maxRev = Math.max(...Object.values(csvData.regionData).map(d => d.scheduled * avgRate));
                        const pct = Math.round(regionRev / maxRev * 100);
                        return (
                          <div key={region}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: B.black }}>Region {region}</span>
                              <div style={{ display: 'flex', gap: 12 }}>
                                <span style={{ fontSize: 11, color: B.gray }}>{data.scheduled} visits</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: B.red, fontFamily: 'monospace' }}>{fmt(regionRev)}</span>
                              </div>
                            </div>
                            <div style={{ height: 5, background: '#F5EDEB', borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: `linear-gradient(90deg, ${B.darkRed}, ${B.orange})`, transition: 'width 0.5s ease' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px', color: B.lightGray, fontSize: 13 }}>Upload Pariox data to see regional revenue breakdown</div>
                  )}
                </div>

                {/* Payer mix + revenue opportunity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Payer mix */}
                  <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: B.black, marginBottom: 14 }}>🏥 Payer Mix</div>
                    {Object.keys(payerCounts).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {Object.entries(payerCounts).sort(([,a],[,b]) => b-a).map(([payer, count]) => {
                          const pct = Math.round(count / totalPayers * 100);
                          const payerColor =
                            payer === 'Humana' ? '#0066CC' :
                            payer === 'CarePlus' ? '#009B77' :
                            payer === 'Medicare/Devoted' ? '#1565C0' :
                            payer === 'Devoted Health' ? '#1976D2' :
                            payer === 'Florida Health Care Plans' ? '#2E7D32' :
                            payer === 'Aetna' ? '#7B1FA2' :
                            payer === 'Cigna' ? '#E65100' :
                            payer === 'HealthFirst' ? '#00838F' :
                            payer === 'Private Pay (Self)' ? B.gray : B.lightGray;
                          return (
                            <div key={payer}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: B.black }}>{payer}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: payerColor, fontFamily: 'monospace' }}>{count} ({pct}%)</span>
                              </div>
                              <div style={{ height: 4, background: '#F5EDEB', borderRadius: 2 }}>
                                <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: payerColor }} />
                              </div>
                            </div>
                          );
                        })}
                      <div style={{ borderTop: `1px solid ${B.border}`, marginTop: 4, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: B.gray }}>Total insured patients</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: B.black }}>{totalPayers}</span>
                      </div>
                        {(() => {
                          const topPayer = Object.entries(payerCounts).sort(([,a],[,b])=>b-a)[0];
                          if (topPayer && topPayer[1]/totalPayers > 0.4) {
                            return (
                              <div style={{ marginTop: 8, padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 11, color: '#92400E' }}>
                                ⚠️ {topPayer[0]} represents {Math.round(topPayer[1]/totalPayers*100)}% of census ({topPayer[1]} patients) — single payer concentration risk
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: B.lightGray, fontSize: 13 }}>Upload census data to see payer mix</div>
                    )}
                  </div>

                  {/* Revenue opportunity */}
                  <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: B.green, marginBottom: 12 }}>📈 Revenue Recovery Opportunity</div>
                    {[
                      { label: 'Resolve auth blocks', patients: authRiskPatients, color: B.yellow },
                      { label: 'Activate SOC pending', patients: socPending, color: '#0284C7' },
                      { label: 'Convert waitlist', patients: waitlistPats, color: '#7C3AED' },
                      { label: 'Return on-hold patients', patients: onHoldPatients, color: '#6B7280' },
                    ].map(r => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: B.black }}>{r.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: B.green, fontFamily: 'monospace' }}>+{fmt(r.patients * CFG.authRiskVisitsPerWeek * avgRate)}/wk</span>
                      </div>
                    ))}
                    <div style={{ borderTop: `1px solid #BBF7D0`, paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: B.green }}>Total potential uplift</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: B.green, fontFamily: 'monospace' }}>+{fmt((authRiskPatients + socPending + waitlistPats + onHoldPatients) * CFG.authRiskVisitsPerWeek * avgRate)}/wk</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── ADMIN SETTINGS ───────────────────────────────────── */}
        {activeTab === '⚙️' && (() => {
          const isUnlocked = adminUnlocked;
          const draft = settingsDraft || CFG;

          return (
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: B.black, marginBottom: 4 }}>⚙️ Director Settings</div>
                <div style={{ fontSize: 13, color: B.gray }}>Edit dashboard targets, rates, and thresholds — no code required</div>
              </div>

              {!isUnlocked ? (
                <div style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '40px', textAlign: 'center', boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: B.black, marginBottom: 6 }}>Director Access Required</div>
                  <div style={{ fontSize: 13, color: B.gray, marginBottom: 24 }}>Enter your 4-digit PIN to edit settings</div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                    <input
                      type="password" maxLength={4} value={adminPinInput}
                      onChange={e => { setAdminPinInput(e.target.value); setAdminPinError(false); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (adminPinInput === CFG.adminPin) { setAdminUnlocked(true); setSettingsDraft({...CFG}); setAdminPinInput(''); }
                          else { setAdminPinError(true); setAdminPinInput(''); }
                        }
                      }}
                      placeholder="PIN"
                      style={{ width: 100, padding: '12px', textAlign: 'center', fontSize: 20, letterSpacing: '0.3em', border: `2px solid ${adminPinError ? B.danger : B.border}`, borderRadius: 10, outline: 'none', fontFamily: "'DM Mono', monospace" }}
                    />
                    <button onClick={() => {
                      if (adminPinInput === CFG.adminPin) { setAdminUnlocked(true); setSettingsDraft({...CFG}); setAdminPinInput(''); }
                      else { setAdminPinError(true); setAdminPinInput(''); }
                    }} style={{ background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 10, color: '#fff', padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Unlock</button>
                  </div>
                  {adminPinError && <div style={{ color: B.danger, fontSize: 12, marginTop: 10 }}>Incorrect PIN — try again</div>}
                  <div style={{ fontSize: 11, color: B.lightGray, marginTop: 16 }}>Default PIN: 1234 — change it in settings after unlocking</div>
                </div>
              ) : (
                <div>
                  {/* Settings form */}
                  {[
                    {
                      section: '📅 Visit Targets',
                      fields: [
                        { key: 'visitTarget', label: 'Weekly Visit Target', sub: 'Sustainability threshold for the whole company', type: 'number', suffix: 'visits/wk' },
                      ]
                    },
                    {
                      section: '💰 Revenue Targets',
                      fields: [
                        { key: 'revenueTarget', label: 'Weekly Revenue Target', sub: 'Company weekly revenue goal', type: 'number', prefix: '$', suffix: '/week' },
                        { key: 'avgReimbursement', label: 'Avg Reimbursement Per Visit', sub: 'Used to estimate all revenue figures', type: 'number', prefix: '$', suffix: '/visit' },
                        { key: 'authRiskVisitsPerWeek', label: 'Avg Visits Per Patient Per Week', sub: 'Used for revenue risk calculations', type: 'number', suffix: 'visits/wk' },
                      ]
                    },
                    {
                      section: '👥 Census Targets',
                      fields: [
                        { key: 'activeCensusTarget', label: 'Active Census Target', sub: 'Goal for Active + Active-Auth Pending patients', type: 'number', suffix: 'patients' },
                        { key: 'coordinatorCap', label: 'Coordinator Caseload Cap', sub: 'Max patients per care coordinator before flag', type: 'number', suffix: 'patients' },
                      ]
                    },
                    {
                      section: '🔐 Security',
                      fields: [
                        { key: 'adminPin', label: 'Director PIN', sub: 'Change your 4-digit settings PIN', type: 'text', maxLength: 4 },
                      ]
                    },
                  ].map(section => (
                    <div key={section.section} style={{ background: B.cardBg, border: `1px solid ${B.border}`, borderRadius: 16, padding: '22px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(139,26,16,0.06)' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: B.black, marginBottom: 16 }}>{section.section}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {section.fields.map(field => (
                          <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16, alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{field.label}</div>
                              <div style={{ fontSize: 11, color: B.gray, marginTop: 2 }}>{field.sub}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {field.prefix && <span style={{ fontSize: 13, color: B.gray }}>{field.prefix}</span>}
                              <input
                                type={field.type}
                                value={draft[field.key]}
                                maxLength={field.maxLength}
                                onChange={e => setSettingsDraft(prev => ({ ...prev, [field.key]: field.type === 'number' ? (parseFloat(e.target.value)||0) : e.target.value }))}
                                style={{ flex: 1, padding: '10px 12px', border: `1.5px solid ${B.border}`, borderRadius: 8, fontSize: 14, fontFamily: "'DM Mono', monospace", fontWeight: 700, color: B.red, outline: 'none', textAlign: 'right' }}
                              />
                              {field.suffix && <span style={{ fontSize: 11, color: B.gray, whiteSpace: 'nowrap' }}>{field.suffix}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Save / Cancel */}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button onClick={() => { setAdminUnlocked(false); setSettingsDraft(null); }} style={{ background: 'none', border: `1px solid ${B.border}`, borderRadius: 10, color: B.gray, padding: '12px 20px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={() => { saveSettings(draft); setAdminUnlocked(false); setSettingsDraft(null); alert('Settings saved — dashboard updated.'); }} style={{ background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 10, color: '#fff', padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(217,79,43,0.3)' }}>
                      Save Settings
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── DATA ─────────────────────────────────────────────── */}
        {activeTab === 'data' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Data & Integrations</div>
              <div style={{ fontSize: 13, color: B.gray }}>Import Pariox visit data and link Google Drive reports for live access</div>
            </div>
            <CSVUploadPanel onDataLoaded={handleCSV} csvData={csvData} />

            {/* ── CENSUS UPLOAD ─────────────────────────────── */}
            <CensusUploadPanel
              censusData={censusData}
              onDataLoaded={saveCensusData}
              parseCensusFile={parseCensusFile}
              error={censusUploadError}
              setError={setCensusUploadError}
              processing={censusProcessing}
              setProcessing={setCensusProcessing}
            />

            <GoogleDriveLinkPanel driveLinks={driveLinks} onAddLink={addDriveLink} onRemoveLink={removeDriveLink} />
          </div>
        )}
      </div>
    </div>
  );
}

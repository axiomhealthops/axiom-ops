import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useOpsData } from '../hooks/useOpsData';
import { useAuth } from '../hooks/useAuth';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

if (typeof window !== 'undefined' && !window.XLSX && !document.querySelector('script[src*="xlsx"]')) {
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  script.async = true;
  document.head.appendChild(script);
}

function withXLSX(callback, onError) {
  if (window.XLSX) { callback(window.XLSX); return; }
  let attempts = 0;
  const check = setInterval(() => {
    attempts++;
    if (window.XLSX) { clearInterval(check); callback(window.XLSX); }
    else if (attempts > 40) {
      clearInterval(check);
      onError('Excel parser timed out. Try refreshing the page, or save the file as CSV instead.');
    }
  }, 250);
}

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#FBF7F6', cardBg:'#fff',
  green:'#2E7D32', yellow:'#D97706', danger:'#DC2626', blue:'#1565C0',
};

const VISIT_TARGET = 800;
const COORD_COLORS = { 'Gypsy': B.red, 'Mary': B.green, 'Audrey': B.orange, 'April': B.darkRed };

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
    const isComplete = status.startsWith('completed');
    const isMissed = status.includes('missed') || status.includes('no show') || status.includes('cancel');
    if (isComplete) completed++;
    if (isMissed) missed++;
    const mmddyyyy = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mmddyyyy) {
      const [, mm, dd, yyyy] = mmddyyyy;
      const isoDate = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      if (!dailyMap[isoDate]) dailyMap[isoDate] = { completed: 0, scheduled: 0 };
      dailyMap[isoDate].scheduled++;
      if (isComplete) dailyMap[isoDate].completed++;
    }
  }
  const dailyTrend = Object.entries(dailyMap).sort(([a],[b]) => a.localeCompare(b)).slice(-7).map(([date, data]) => ({
    day: new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'}),
    visits: data.completed, scheduled: data.scheduled, target: Math.round(VISIT_TARGET/5)
  }));
  const patientSet = new Set();
  const staffMap = {};
  const visitDedupeMap = {};
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
    const dateMatch = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const isoDate = dateMatch ? `${dateMatch[3]}-${dateMatch[1].padStart(2,'0')}-${dateMatch[2].padStart(2,'0')}` : '';
    const dedupeKey = `${patient}||${isoDate}`;
    if (!visitDedupeMap[dedupeKey]) visitDedupeMap[dedupeKey] = { disciplines: [], completed: false };
    visitDedupeMap[dedupeKey].disciplines.push(disc);
    if (isComplete) visitDedupeMap[dedupeKey].completed = true;
    if (staff) {
      if (!staffMap[staff]) staffMap[staff] = { name: staff, discipline: disc, primaryRegion: region, totalVisits: 0, completedVisits: 0, patients: new Set(), regions: new Set() };
      staffMap[staff].totalVisits++;
      if (isComplete) staffMap[staff].completedVisits++;
      if (patient) staffMap[staff].patients.add(patient);
      if (region) staffMap[staff].regions.add(region);
    }
  }
  let dedupedScheduled = Object.keys(visitDedupeMap).length;
  let dedupedCompleted = Object.values(visitDedupeMap).filter(v => v.completed).length;
  const staffStats = {};
  for (const [name, data] of Object.entries(staffMap)) {
    staffStats[name] = { name: data.name, discipline: data.discipline, primaryRegion: data.primaryRegion, totalVisits: data.totalVisits, completedVisits: data.completedVisits, uniquePatients: data.patients.size, regions: Array.from(data.regions) };
  }
  const staffList = Object.values(staffMap).map(s => ({ name: s.name, discipline: s.discipline, regions: Array.from(s.regions).sort().join(', '), regionCount: s.regions.size, totalVisits: s.totalVisits, uniquePatients: s.uniquePatients.size }));
  return { completedVisits: dedupedCompleted, missedVisits: missed, scheduledVisits: dedupedScheduled, rawScheduled: scheduled, rawCompleted: completed, dailyTrend, rowCount: lines.length-1, uniquePatients: patientSet.size, staffList, staffStats, dedupedCount: dedupedScheduled, rawCount: scheduled };
}

function StatCard({ label, value, sub, color=B.red, alert, icon }) {
  return (
    <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px', position:'relative', overflow:'hidden', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${color},transparent)` }} />
      <div style={{ fontSize:11, color:B.lightGray, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8, fontFamily:'monospace' }}>{icon} {label}</div>
      <div style={{ fontSize:28, fontWeight:800, color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:B.lightGray, marginTop:6 }}>{sub}</div>}
      {alert && <div style={{ fontSize:11, color:B.danger, marginTop:5, fontWeight:600 }}>{alert}</div>}
    </div>
  );
}

function AlertItem({ text, severity }) {
  const map = { critical:{color:B.danger,bg:'#FEF2F2',border:'#FECACA',icon:'🔴'}, warning:{color:B.yellow,bg:'#FFFBEB',border:'#FDE68A',icon:'🟡'}, info:{color:B.red,bg:'#FFF5F2',border:'#FDDDD5',icon:'🔵'} };
  const s = map[severity];
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px', background:s.bg, borderLeft:`3px solid ${s.color}`, borderRadius:'0 8px 8px 0', marginBottom:8 }}>
      <span style={{ fontSize:12 }}>{s.icon}</span>
      <span style={{ fontSize:12, color:B.black, lineHeight:1.5 }}>{text}</span>
    </div>
  );
}

function CoordRow({ report, coordinator }) {
  const color = COORD_COLORS[coordinator?.name] || B.red;
  const caseload = report?.active_patients || 0;
  const caseloadColor = caseload > 150 ? B.danger : caseload > 80 ? B.yellow : caseload < 50 ? B.orange : B.green;
  const cr = report?.visits_scheduled > 0 ? Math.round((report.visits_completed/report.visits_scheduled)*100) : 0;
  return (
    <div style={{ display:'grid', gridTemplateColumns:'180px 80px 80px 80px 80px 80px 80px 80px 1fr', padding:'14px 20px', borderBottom:`1px solid ${B.border}`, alignItems:'center' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:3, height:32, background:color, borderRadius:2, flexShrink:0 }} />
        <div>
          <div style={{ fontWeight:700, fontSize:13, color:B.black }}>{coordinator?.name}</div>
          <div style={{ fontSize:10, color:B.lightGray }}>{coordinator?.region}</div>
        </div>
      </div>
      {[
        { val:caseload, color:caseloadColor },
        { val:report?.visits_scheduled||0, color:B.black },
        { val:report?.visits_completed||0, color:B.green },
        { val:report?.visits_missed||0, color:(report?.visits_missed||0)>3?B.danger:B.yellow },
        { val:report?.auths_expiring_7d||0, color:(report?.auths_expiring_7d||0)>2?B.danger:B.yellow },
        { val:report?.new_referrals||0, color:B.darkRed },
        { val:report?.tasks_open||0, color:(report?.tasks_open||0)>8?B.danger:B.orange },
      ].map((cell,i) => (
        <div key={i} style={{ textAlign:'center', fontSize:15, fontWeight:700, fontFamily:"'DM Mono',monospace", color:cell.color }}>{cell.val}</div>
      ))}
      <div style={{ paddingLeft:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, height:4, background:'#F5EDEB', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${cr}%`, borderRadius:2, background:cr>85?B.green:cr>70?B.yellow:B.red }} />
          </div>
          <span style={{ fontSize:11, fontFamily:'monospace', color:B.lightGray, width:30 }}>{cr}%</span>
          {!report && <span style={{ fontSize:10, color:B.danger, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:4, padding:'2px 6px', fontWeight:700 }}>NO REPORT</span>}
        </div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:10, padding:'10px 14px', fontSize:12, boxShadow:'0 4px 12px rgba(139,26,16,0.12)' }}>
      <div style={{ color:B.lightGray, marginBottom:4 }}>{label}</div>
      {payload.map((p,i) => <div key={i} style={{ color:p.color||B.red, fontFamily:'monospace', fontWeight:700 }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

function CSVUploadPanel({ onDataLoaded, csvData }) {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [lastFile, setLastFile] = useState('');
  const fileRef = useRef();

  function processRows(rows, headersArr, statusIdx, dateIdx) {
    let completed=0, missed=0, scheduled=0;
    const dailyMap={};
    const regionIdx=headersArr.findIndex(h=>h==='region');
    const staffIdx2=headersArr.findIndex(h=>h==='staff');
    const patientIdx2=headersArr.findIndex(h=>h==='patient');
    const discIdx2=headersArr.findIndex(h=>h==='disc');
    for (let i=1;i<rows.length;i++) {
      const row=rows[i]; if (!row||!row.length) continue;
      const status=String(row[statusIdx]||'').toLowerCase().trim();
      const dateRaw=row[dateIdx];
      scheduled++;
      const isComplete=status.startsWith('completed');
      const isMissed=status.includes('missed')||status.includes('no show')||status.includes('cancel');
      if (isComplete) completed++;
      if (isMissed) missed++;
      let isoDate='';
      if (dateRaw instanceof Date) { isoDate=dateRaw.toISOString().split('T')[0]; }
      else if (typeof dateRaw==='number') { const d=new Date((dateRaw-25569)*86400*1000); isoDate=d.toISOString().split('T')[0]; }
      else if (typeof dateRaw==='string') { const m=dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) isoDate=`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
      if (isoDate) {
        if (!dailyMap[isoDate]) dailyMap[isoDate]={completed:0,scheduled:0};
        dailyMap[isoDate].scheduled++;
        if (isComplete) dailyMap[isoDate].completed++;
      }
    }
    const dailyTrend=Object.entries(dailyMap).sort(([a],[b])=>a.localeCompare(b)).slice(-7).map(([date,data])=>({
      day:new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'}),
      visits:data.completed,scheduled:data.scheduled,target:Math.round(VISIT_TARGET/5)
    }));
    const regionMap={};
    const staffMap={};
    for (let i=1;i<rows.length;i++) {
      const row=rows[i]; if (!row||!row.length) continue;
      if (regionIdx===-1) continue;
      const region=String(row[regionIdx]||'').trim();
      const staff=String(row[staffIdx2]||'').trim();
      const patient=String(row[patientIdx2]||'').trim();
      const disc=discIdx2>=0?String(row[discIdx2]||'').trim():'';
      const status=String(row[statusIdx]||'').toLowerCase().trim();
      const isComplete=status.startsWith('completed');
      if (!region) continue;
      if (!regionMap[region]) regionMap[region]={scheduled:0,completed:0,clinicians:new Set(),patients:new Set(),clinicianMap:{}};
      regionMap[region].scheduled++;
      if (isComplete) regionMap[region].completed++;
      if (staff) {
        regionMap[region].clinicians.add(staff);
        if (!regionMap[region].clinicianMap[staff]) regionMap[region].clinicianMap[staff]={scheduled:0,completed:0,patients:new Set()};
        regionMap[region].clinicianMap[staff].scheduled++;
        if (isComplete) regionMap[region].clinicianMap[staff].completed++;
        if (patient) regionMap[region].clinicianMap[staff].patients.add(patient);
        if (!staffMap[staff]) staffMap[staff]={name:staff,discipline:disc,regions:new Set(),totalVisits:0,uniquePatients:new Set()};
        staffMap[staff].totalVisits++;
        staffMap[staff].regions.add(region);
        if (patient) staffMap[staff].uniquePatients.add(patient);
      }
      if (patient) regionMap[region].patients.add(patient);
    }
    const regionData={};
    for (const [region,data] of Object.entries(regionMap)) {
      regionData[region]={scheduled:data.scheduled,completed:data.completed,clinicians:data.clinicians.size,patients:data.patients.size,clinicianList:Object.entries(data.clinicianMap).map(([name,d])=>({name,scheduled:d.scheduled,completed:d.completed,patients:d.patients.size}))};
    }
    const xlsxPatientSet=new Set();
    const xlsxStaffMap={};
    const xlsxDedupeMap={};
    const xPatIdx=headersArr.findIndex(h=>h==='patient');
    const xStaffIdx=headersArr.findIndex(h=>h==='staff');
    const xDiscIdx=headersArr.findIndex(h=>h==='disc');
    const xRegIdx=headersArr.findIndex(h=>h==='region');
    const xDateIdx2=headersArr.findIndex(h=>h==='date');
    for (let i2=1;i2<rows.length;i2++) {
      const r2=rows[i2]; if (!r2||!r2.length) continue;
      const patient=String(r2[xPatIdx]||'');
      const staff=String(r2[xStaffIdx]||'');
      const disc=String(r2[xDiscIdx]||'');
      const region=String(r2[xRegIdx]||'');
      const dateRaw2=r2[xDateIdx2];
      const xStatus=String(r2[statusIdx]||'').toLowerCase();
      const xComplete=xStatus.startsWith('completed');
      if (patient) xlsxPatientSet.add(patient);
      let xIso='';
      if (dateRaw2 instanceof Date) { xIso=dateRaw2.toISOString().split('T')[0]; }
      else if (typeof dateRaw2==='string') { const xm=dateRaw2.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (xm) xIso=xm[3]+'-'+xm[1].padStart(2,'0')+'-'+xm[2].padStart(2,'0'); }
      const xKey=patient+'||'+xIso;
      if (!xlsxDedupeMap[xKey]) xlsxDedupeMap[xKey]={disciplines:[],completed:false};
      xlsxDedupeMap[xKey].disciplines.push(disc);
      if (xComplete) xlsxDedupeMap[xKey].completed=true;
      if (staff) {
        if (!xlsxStaffMap[staff]) xlsxStaffMap[staff]={name:staff,discipline:disc,primaryRegion:region,totalVisits:0,completedVisits:0,patients:new Set(),regions:new Set()};
        xlsxStaffMap[staff].totalVisits++;
        if (xComplete) xlsxStaffMap[staff].completedVisits++;
        if (patient) xlsxStaffMap[staff].patients.add(patient);
        if (region) xlsxStaffMap[staff].regions.add(region);
      }
    }
    let xDedupedSched=Object.keys(xlsxDedupeMap).length;
    let xDedupedComp=Object.values(xlsxDedupeMap).filter(v=>v.completed).length;
    const xlsxStaffStats={};
    for (const [name,data] of Object.entries(xlsxStaffMap)) {
      xlsxStaffStats[name]={name:data.name,discipline:data.discipline,primaryRegion:data.primaryRegion,totalVisits:data.totalVisits,completedVisits:data.completedVisits,uniquePatients:data.patients.size,regions:Array.from(data.regions)};
    }
    const xlsxStaffList=Object.values(staffMap).map(s=>({name:s.name,discipline:s.discipline,regions:Array.from(s.regions).sort().join(', '),regionCount:s.regions.size,totalVisits:s.totalVisits,uniquePatients:s.uniquePatients.size}));
    return {completedVisits:xDedupedComp,missedVisits:missed,scheduledVisits:xDedupedSched,rawScheduled:scheduled,rawCompleted:completed,dailyTrend,rowCount:rows.length-1,regionData,uniquePatients:xlsxPatientSet.size,staffList:xlsxStaffList,staffStats:xlsxStaffStats,dedupedCount:xDedupedSched,rawCount:scheduled};
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) { setError('Please upload a CSV or Excel file from Pariox'); return; }
    setProcessing(true); setError('');
    const isXLSX=file.name.match(/\.xlsx?$/i);
    if (isXLSX) {
      const reader=new FileReader();
      reader.onload=(e)=>{
        const arrayBuf=e.target.result;
        withXLSX((XLSX)=>{
          try {
            const wb=XLSX.read(new Uint8Array(arrayBuf),{type:'array',cellDates:true});
            const ws=wb.Sheets[wb.SheetNames[0]];
            const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:'mm/dd/yyyy'});
            const headers=(rows[0]||[]).map(h=>String(h||'').toLowerCase().trim());
            const statusIdx=headers.findIndex(h=>h.includes('status'));
            const dateIdx=headers.findIndex(h=>h==='date');
            if (statusIdx===-1) { setError('Could not find Status column. Make sure this is a Pariox export.'); setProcessing(false); return; }
            const result=processRows(rows,headers,statusIdx,dateIdx);
            setLastFile(file.name);
            onDataLoaded(result);
            setProcessing(false);
          } catch(err) { setError('Error reading Excel: '+err.message); setProcessing(false); }
        },(errMsg)=>{ setError(errMsg); setProcessing(false); });
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader=new FileReader();
      reader.onload=(e)=>{
        try {
          const result=parseParioxCSV(e.target.result);
          if (!result) { setError('Could not parse this file.'); setProcessing(false); return; }
          setLastFile(file.name);
          onDataLoaded(result);
          setProcessing(false);
        } catch(err) { setError('Error: '+err.message); setProcessing(false); }
      };
      reader.readAsText(file);
    }
  }

  function handleInputChange(e) { handleFile(e.target.files[0]); e.target.value=''; }

  return (
    <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', boxShadow:'0 1px 4px rgba(139,26,16,0.06)', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:B.black, marginBottom:3 }}>📊 Pariox Visit Data Import</div>
          <div style={{ fontSize:12, color:B.gray }}>Upload CSV or XLSX from Pariox — each upload fully replaces previous data</div>
        </div>
        {csvData && (
          <div style={{ textAlign:'right' }}>
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'6px 12px', fontSize:11, color:B.green, fontWeight:600 }}>✓ {csvData.rowCount} records loaded</div>
            {lastFile && <div style={{ fontSize:10, color:B.lightGray, marginTop:4 }}>{lastFile}</div>}
          </div>
        )}
      </div>
      <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>fileRef.current.click()}
        style={{ border:`2px dashed ${dragging?B.red:'#E8D5D0'}`, borderRadius:12, padding:'28px 20px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', background:dragging?'#FFF5F2':'#FDFAF9' }}>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }} onChange={handleInputChange} />
        <div style={{ fontSize:28, marginBottom:8 }}>{processing?'⏳':csvData?'🔄':'📁'}</div>
        <div style={{ fontSize:13, fontWeight:600, color:B.black, marginBottom:4 }}>{processing?'Processing...':csvData?'Upload new file to override current data':'Drop your Pariox export here'}</div>
        <div style={{ fontSize:11, color:B.lightGray }}>CSV or XLSX accepted — each upload replaces all previous data</div>
      </div>
      {error && <div style={{ marginTop:10, padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:B.danger }}>{error}</div>}
      {csvData && (
        <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
          {[
            { label:'Completed', value:csvData.completedVisits, color:B.red },
            { label:'Scheduled', value:csvData.scheduledVisits, color:B.black },
            { label:'Missed', value:csvData.missedVisits, color:B.danger },
            { label:'Completion %', value:csvData.scheduledVisits>0?`${Math.round(csvData.completedVisits/csvData.scheduledVisits*100)}%`:'—', color:B.green },
          ].map(m => (
            <div key={m.label} style={{ background:'#FBF7F6', borderRadius:8, padding:'10px 14px', textAlign:'center', border:`1px solid ${B.border}` }}>
              <div style={{ fontSize:20, fontWeight:800, color:m.color, fontFamily:"'DM Mono',monospace" }}>{m.value}</div>
              <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:2 }}>{m.label}</div>
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
    active:{label:'Active',color:'#2E7D32',icon:'✅'}, active_auth_pending:{label:'Active–Auth Pending',color:'#E8763A',icon:'⏳'},
    auth_pending:{label:'Auth Pending',color:'#D97706',icon:'🔒'}, soc_pending:{label:'SOC Pending',color:'#0284C7',icon:'📅'},
    eval_pending:{label:'Eval Pending',color:'#1565C0',icon:'🩺'}, waitlist:{label:'Waitlist',color:'#7C3AED',icon:'📋'},
    on_hold:{label:'On Hold',color:'#6B7280',icon:'⏸️'}, on_hold_facility:{label:'On Hold – Facility',color:'#9CA3AF',icon:'🏥'},
    on_hold_pt:{label:'On Hold – Pt Req',color:'#9CA3AF',icon:'🙋'}, on_hold_md:{label:'On Hold – MD Req',color:'#9CA3AF',icon:'👨‍⚕️'},
    hospitalized:{label:'Hospitalized',color:'#DC2626',icon:'🚨'}, discharge:{label:'Discharge',color:'#BBA8A4',icon:'📤'},
  };

  function handleFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) { setError('Please upload a CSV or Excel census file from Pariox'); return; }
    setProcessing(true); setError('');
    const isXLSX=file.name.match(/\.xlsx?$/i);
    if (isXLSX) {
      const reader=new FileReader();
      reader.onload=(e)=>{
        const arrayBuf=e.target.result;
        withXLSX((XLSX)=>{
          try {
            const wb=XLSX.read(new Uint8Array(arrayBuf),{type:'array',cellDates:true});
            const ws=wb.Sheets[wb.SheetNames[0]];
            const csvText=XLSX.utils.sheet_to_csv(ws);
            const result=parseCensusFile(csvText);
            if (!result) { setError('Could not detect a Status column.'); setProcessing(false); return; }
            onDataLoaded(result); setProcessing(false);
          } catch(err) { setError('Error reading file: '+err.message); setProcessing(false); }
        },(errMsg)=>{ setError(errMsg); setProcessing(false); });
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader=new FileReader();
      reader.onload=(e)=>{
        try {
          const result=parseCensusFile(e.target.result);
          if (!result) { setError('Could not detect a Status column.'); setProcessing(false); return; }
          onDataLoaded(result); setProcessing(false);
        } catch(err) { setError('Error: '+err.message); setProcessing(false); }
      };
      reader.readAsText(file);
    }
  }

  function handleChange(e) { handleFile(e.target.files[0]); e.target.value=''; }
  const totalCensus=censusData?Object.values(censusData.counts).reduce((s,v)=>s+v,0):0;

  return (
    <div style={{ background:'#fff', border:'1px solid #F0E4E0', borderRadius:16, padding:'24px', boxShadow:'0 1px 4px rgba(139,26,16,0.06)', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'#1A1A1A', marginBottom:3 }}>👥 Patient Census Upload</div>
          <div style={{ fontSize:12, color:'#8B6B64' }}>Upload your Pariox patient census — syncs to all users in real time via Supabase</div>
        </div>
        {censusData && (
          <div style={{ textAlign:'right' }}>
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'6px 12px', fontSize:11, color:'#2E7D32', fontWeight:600 }}>✓ {totalCensus} patients loaded</div>
            <div style={{ fontSize:10, color:'#BBA8A4', marginTop:4 }}>Updated {censusData.lastUpdated}</div>
          </div>
        )}
      </div>
      <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>fileRef.current.click()}
        style={{ border:`2px dashed ${dragging?'#D94F2B':'#E8D5D0'}`, borderRadius:12, padding:'24px 20px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', background:dragging?'#FFF5F2':'#FDFAF9' }}>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }} onChange={handleChange} />
        <div style={{ fontSize:28, marginBottom:8 }}>{processing?'⏳':censusData?'🔄':'👥'}</div>
        <div style={{ fontSize:13, fontWeight:600, color:'#1A1A1A', marginBottom:4 }}>{processing?'Processing census...':censusData?'Upload new census to override':'Drop your Pariox patient census here'}</div>
        <div style={{ fontSize:11, color:'#BBA8A4' }}>CSV or XLSX — syncs to all team members automatically</div>
      </div>
      {error && <div style={{ marginTop:10, padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:12, color:'#DC2626' }}>{error}</div>}
      {censusData && (
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:11, color:'#BBA8A4', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:10 }}>Status Breakdown</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {Object.entries(STATUS_META).map(([key,meta]) => {
              const count=censusData.counts[key]||0;
              const pct=totalCensus>0?Math.round(count/totalCensus*100):0;
              return (
                <div key={key} style={{ background:'#FBF7F6', borderRadius:8, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid #F0E4E0' }}>
                  <div style={{ fontSize:12, color:'#1A1A1A' }}>{meta.icon} {meta.label}</div>
                  <div style={{ textAlign:'right' }}>
                    <span style={{ fontSize:18, fontWeight:800, color:meta.color, fontFamily:"'DM Mono',monospace" }}>{count}</span>
                    <span style={{ fontSize:10, color:'#BBA8A4', marginLeft:4 }}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleDriveLinkPanel({ driveLinks, onAddLink, onRemoveLink }) {
  const [newLink, setNewLink] = useState({ label:'', url:'' });
  const [adding, setAdding] = useState(false);
  const getType=url=>url.includes('spreadsheets')?'sheet':url.includes('document')?'doc':url.includes('drive.google.com/drive/folders')?'folder':'other';
  const inputStyle={ width:'100%', padding:'8px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box', color:B.black, background:'#fff' };
  return (
    <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:B.black, marginBottom:3 }}>📂 Google Drive Reports</div>
          <div style={{ fontSize:12, color:B.gray }}>Link your Google Sheets or Docs daily reports for quick live access</div>
        </div>
        <button onClick={()=>setAdding(!adding)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>+ Add Link</button>
      </div>
      {adding && (
        <div style={{ background:'#FBF7F6', border:`1px solid ${B.border}`, borderRadius:10, padding:'16px', marginBottom:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr auto', gap:10, alignItems:'end' }}>
            <div>
              <label style={{ display:'block', fontSize:11, color:B.gray, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6, fontWeight:600 }}>Label</label>
              <input value={newLink.label} onChange={e=>setNewLink(p=>({...p,label:e.target.value}))} placeholder="e.g. Gypsy Weekly Report" style={inputStyle} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, color:B.gray, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6, fontWeight:600 }}>Google Drive URL</label>
              <input value={newLink.url} onChange={e=>setNewLink(p=>({...p,url:e.target.value}))} placeholder="Paste Google Sheets, Doc, or Drive folder URL" style={inputStyle} />
            </div>
            <button onClick={()=>{ if (!newLink.label||!newLink.url) return; onAddLink({...newLink,id:Date.now(),type:getType(newLink.url)}); setNewLink({label:'',url:''}); setAdding(false); }} style={{ background:B.green, border:'none', borderRadius:8, color:'#fff', padding:'8px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', height:38, whiteSpace:'nowrap' }}>Add</button>
          </div>
        </div>
      )}
      {driveLinks.length===0&&!adding&&(
        <div style={{ textAlign:'center', padding:'28px', color:B.lightGray, fontSize:13, background:'#FDFAF9', borderRadius:10, border:`1px dashed ${B.border}` }}>No reports linked yet — click "+ Add Link" to connect your Google Drive reports</div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {driveLinks.map(link=>(
          <div key={link.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'#FBF7F6', border:`1px solid ${B.border}`, borderRadius:10 }}>
            <div style={{ fontSize:20 }}>{link.type==='sheet'?'📊':link.type==='doc'?'📄':link.type==='folder'?'📁':'🔗'}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{link.label}</div>
              <div style={{ fontSize:11, color:B.lightGray, marginTop:2 }}>{link.type==='sheet'?'Google Sheet':link.type==='doc'?'Google Doc':link.type==='folder'?'Drive Folder':'Link'}</div>
            </div>
            <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ background:'#FFF5F2', border:`1px solid #FDDDD5`, borderRadius:8, color:B.red, padding:'6px 12px', fontSize:12, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>Open →</a>
            <button onClick={()=>onRemoveLink(link.id)} style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, color:B.danger, padding:'6px 10px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DirectorDashboard({ initialTab='overview', readOnly=false }) {
  const { signOut } = useAuth();
  const { uploadCensus } = useOpsData();
  const [coordinators, setCoordinators] = useState([]);
  const [morningReports, setMorningReports] = useState([]);
  const [eodReports, setEodReports] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date());
  const [manualVisits, setManualVisits] = useState(() => { try { return parseInt(localStorage.getItem('axiom_manual_visits')||'650'); } catch { return 650; } });
  const [csvData, setCsvData] = useState(() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch { return null; } });
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [directorNotes, setDirectorNotes] = useState(() => { try { return JSON.parse(localStorage.getItem('axiom_director_notes')||'[]'); } catch { return []; } });
  const [newNote, setNewNote] = useState('');
  const [expansionData, setExpansionData] = useState(() => {
    try { const saved=localStorage.getItem('axiom_expansion'); if (saved) return JSON.parse(saved); } catch {}
    return {
      GA:{ state:'Georgia', status:'In Progress', credentialing:60, staffHired:2, staffNeeded:4, firstPatientDate:'2026-05-01', weeklyVisitTarget:80, currentVisits:0, revenueContribution:0, notes:'' },
      TX:{ state:'Texas', status:'Planning', credentialing:20, staffHired:0, staffNeeded:6, firstPatientDate:'2026-07-01', weeklyVisitTarget:120, currentVisits:0, revenueContribution:0, notes:'' },
      NC:{ state:'North Carolina', status:'Planning', credentialing:10, staffHired:0, staffNeeded:3, firstPatientDate:'2026-08-01', weeklyVisitTarget:60, currentVisits:0, revenueContribution:0, notes:'' },
    };
  });
  const [editingExpansion, setEditingExpansion] = useState(null);
  const [staffDirectory, setStaffDirectory] = useState(() => { try { const s=localStorage.getItem('axiom_staff_dir'); return s?JSON.parse(s):{}; } catch { return {}; } });
  const [staffFilter, setStaffFilter] = useState('all');
  const [staffSearch, setStaffSearch] = useState('');
  const [staffSort, setStaffSort] = useState('visits_desc');
  const [censusData, setCensusData] = useState(() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch { return null; } });
  const [censusUploadError, setCensusUploadError] = useState('');
  const [censusProcessing, setCensusProcessing] = useState(false);
  const [selectedCensusRegion, setSelectedCensusRegion] = useState('all');

  // ── PATCHED: saveCensusData now writes to Supabase for real-time sync ──
  const saveCensusData = async (data) => {
    setCensusData(data);
    try { localStorage.setItem('axiom_census', JSON.stringify(data)); } catch(e) {}
    // Write to Supabase so ALL users see live data instantly
    if (data?.patients?.length) {
      await uploadCensus(data.patients);
    }
  };

  const parseCensusFile = (text) => {
    const rawLines=text.trim().split('\n');
    if (rawLines.length<2) return null;
    function parseCSVLine2(line) {
      const result=[]; let cur=''; let inQ=false;
      for (let i=0;i<line.length;i++) {
        if (line[i]==='"') { inQ=!inQ; }
        else if (line[i]===','&&!inQ) { result.push(cur.trim().replace(/^"|"$/g,'')); cur=''; }
        else { cur+=line[i]; }
      }
      result.push(cur.trim().replace(/^"|"$/g,''));
      return result;
    }
    const headers2=parseCSVLine2(rawLines[0]).map(h=>h.toLowerCase().trim());
    const statusIdx2=headers2.findIndex(h=>h==='status');
    const patientIdx2=headers2.findIndex(h=>h==='patient');
    const regionIdx2=headers2.findIndex(h=>h==='region');
    const discIdx2=headers2.findIndex(h=>h==='disc');
    const insIdx2=headers2.findIndex(h=>h==='insurance');
    const socIdx2=headers2.findIndex(h=>h==='soc');
    const refIdx2=headers2.findIndex(h=>h==='ref source');
    const changedIdx2=headers2.findIndex(h=>h==='changed');
    if (statusIdx2===-1) return null;
    const STATUS_MAP={
      'active':'active','active - auth pendin':'active_auth_pending','active - auth pending':'active_auth_pending',
      'auth pending':'auth_pending','soc pending':'soc_pending','eval pending':'eval_pending',
      'evaluation pending':'eval_pending','waitlist':'waitlist','on hold':'on_hold',
      'on hold - facility':'on_hold_facility','on hold - pt request':'on_hold_pt',
      'on hold - md request':'on_hold_md','hospitalized':'hospitalized',
      'discharge - change i':'discharge','discharge':'discharge',
    };
    const ACTIVE_STATUSES=new Set(['active','active_auth_pending']);
    const counts={ active:0, active_auth_pending:0, auth_pending:0, soc_pending:0, eval_pending:0, waitlist:0, on_hold:0, on_hold_facility:0, on_hold_pt:0, on_hold_md:0, hospitalized:0, discharge:0, other:0 };
    const byRegion={};
    const patients=[];
    let unknownStatuses=new Set();
    for (let i=1;i<rawLines.length;i++) {
      if (!rawLines[i].trim()) continue;
      const cols=parseCSVLine2(rawLines[i]);
      const rawStatus=(cols[statusIdx2]||'').trim();
      const statusKey=STATUS_MAP[rawStatus.toLowerCase()]||'other';
      if (statusKey==='other'&&rawStatus) unknownStatuses.add(rawStatus);
      counts[statusKey]=(counts[statusKey]||0)+1;
      const patient=patientIdx2>=0?cols[patientIdx2]:'';
      const region=regionIdx2>=0?cols[regionIdx2]:'';
      const disc=discIdx2>=0?cols[discIdx2]:'';
      const ins=insIdx2>=0?cols[insIdx2]:'';
      const soc=socIdx2>=0?cols[socIdx2]:'';
      const ref=refIdx2>=0?cols[refIdx2]:'';
      const changed=changedIdx2>=0?cols[changedIdx2]:'';
      const daysInStatus=changed?Math.floor((new Date()-new Date(changed))/86400000):null;
      if (region) {
        if (!byRegion[region]) byRegion[region]={ total:0, activeCensus:0, active:0, active_auth_pending:0, auth_pending:0, soc_pending:0, eval_pending:0, waitlist:0, on_hold:0, on_hold_facility:0, on_hold_pt:0, on_hold_md:0, hospitalized:0, discharge:0, other:0, patients:[] };
        byRegion[region].total++;
        byRegion[region][statusKey]=(byRegion[region][statusKey]||0)+1;
        if (ACTIVE_STATUSES.has(statusKey)) byRegion[region].activeCensus++;
        byRegion[region].patients.push({ name:patient, status:statusKey, rawStatus, disc, ins, soc, ref, daysInStatus });
      }
      patients.push({ name:patient, status:statusKey, rawStatus, region, disc, ins, soc, ref, changed, daysInStatus });
    }
    const activeCensus=counts.active+counts.active_auth_pending;
    return { counts, byRegion, patients, total:rawLines.length-1, activeCensus, unknownStatuses:Array.from(unknownStatuses), lastUpdated:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}), detectedStatusCol:rawLines[0].split(',')[statusIdx2]||'Status' };
  };

  const [staffDirTab, setStaffDirTab] = useState('directory');
  const saveStaffDirectory=(dir)=>{ setStaffDirectory(dir); try { localStorage.setItem('axiom_staff_dir',JSON.stringify(dir)); } catch(e){} };
  const syncStaffFromPariox=(parsedData)=>{
    if (!parsedData?.staffList) return;
    setStaffDirectory(prev=>{
      const updated={...prev};
      parsedData.staffList.forEach(s=>{
        if (!updated[s.name]) {
          const isLikelyTelehealth=s.regionCount>=3&&(s.discipline.includes('PT')||s.discipline==='OT')&&!s.discipline.includes('PTA');
          updated[s.name]={ name:s.name, discipline:s.discipline, classification:isLikelyTelehealth?'telehealth':'field', regions:s.regions, status:'active', role:s.discipline.includes('PTA')||s.discipline==='COTA'?'treating':'supervisory', phone:'', email:'', notes:'', weeklyVisits:s.totalVisits, uniquePatients:s.uniquePatients };
        } else {
          updated[s.name]={ ...updated[s.name], weeklyVisits:s.totalVisits, uniquePatients:s.uniquePatients, regions:s.regions };
        }
      });
      try { localStorage.setItem('axiom_staff_dir',JSON.stringify(updated)); } catch(e){}
      return updated;
    });
  };

  const [driveLinks, setDriveLinks] = useState(() => { try { return JSON.parse(localStorage.getItem('axiom_drive_links')||'[]'); } catch { return []; } });

  useEffect(() => {
    loadData();
    const t=setInterval(()=>setTime(new Date()),1000);
    const sub=supabase.channel('reports').on('postgres_changes',{event:'*',schema:'public',table:'daily_reports'},loadData).subscribe();
    return ()=>{ clearInterval(t); sub.unsubscribe(); };
  }, []);

  const loadData=useCallback(async()=>{
    const today=new Date().toISOString().split('T')[0];
    const days=Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-(6-i)); return d.toISOString().split('T')[0]; });
    const [coordRes,morningRes,eodRes,trendRes]=await Promise.all([
      supabase.from('coordinators').select('*').neq('role','director').order('name'),
      supabase.from('daily_reports').select('*').eq('report_date',today).eq('report_type','morning'),
      supabase.from('daily_reports').select('*').eq('report_date',today).eq('report_type','eod'),
      supabase.from('daily_reports').select('report_date,visits_completed').in('report_date',days).eq('report_type','eod'),
    ]);
    setCoordinators(coordRes.data||[]);
    setMorningReports(morningRes.data||[]);
    setEodReports(eodRes.data||[]);
    setWeeklyData(days.map(day=>({ day:new Date(day+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'}), visits:(trendRes.data||[]).filter(r=>r.report_date===day).reduce((s,r)=>s+(r.visits_completed||0),0), target:Math.round(VISIT_TARGET/5) })));
    setLoading(false);
  },[]);

  const addDriveLink=link=>{ const u=[...driveLinks,link]; setDriveLinks(u); localStorage.setItem('axiom_drive_links',JSON.stringify(u)); };
  const removeDriveLink=id=>{ const u=driveLinks.filter(l=>l.id!==id); setDriveLinks(u); localStorage.setItem('axiom_drive_links',JSON.stringify(u)); };

  // ── PATCHED: handleCSV is now async ──
  const handleCSV = async data => {
    setCsvData(data);
    if (data.staffList?.length>0) syncStaffFromPariox(data);
    try { localStorage.setItem('axiom_pariox_data',JSON.stringify(data)); } catch(e){}
    if (data.staffStats) {
      setStaffDirectory(prev=>{
        const updated={...prev};
        Object.entries(data.staffStats).forEach(([name,stats])=>{
          if (!updated[name]) {
            updated[name]={ name, discipline:stats.discipline, primaryRegion:stats.primaryRegion, employmentType:stats.totalVisits>=20?'full_time':'part_time', workType:['LYMPHEDEMA PT','OT'].includes(stats.discipline)?'telehealth':'in_person', status:'active', minVisits:stats.totalVisits>=20?24:15, notes:'' };
          } else {
            updated[name]={ ...updated[name], discipline:stats.discipline, primaryRegion:stats.primaryRegion };
          }
        });
        try { localStorage.setItem('axiom_staff_dir',JSON.stringify(updated)); } catch(e){}
        return updated;
      });
    }
  };

  const sum=(key,r)=>r.reduce((s,x)=>s+(x[key]||0),0);
  const hasPariox=!!(csvData&&csvData.scheduledVisits>0);
  const hasCensus=!!(censusData&&censusData.counts);

  const activeNotSeen=(()=>{
    if (!hasCensus||!hasPariox) return null;
    const activeTotal=censusData.activeCensus||0;
    const seenThisWeek=csvData.uniquePatients||0;
    return Math.max(0,activeTotal-seenThisWeek);
  })();

  const totalPatients=hasPariox?(csvData.uniquePatients||Object.values(csvData.regionData||{}).reduce((s,r)=>s+(r.patients||0),0)):sum('active_patients',morningReports);
  const totalScheduled=hasPariox?(csvData.scheduledVisits||0):sum('visits_scheduled',morningReports);
  const totalCompleted=hasPariox?(csvData.completedVisits||0):sum('visits_completed',eodReports.length>0?eodReports:morningReports);
  const totalMissed=hasPariox?(csvData.missedVisits||0):sum('visits_missed',eodReports);
  const totalAuthsPending=sum('auths_pending',morningReports);
  const totalAuthsExpiring=sum('auths_expiring_7d',morningReports);
  const totalReferrals=sum('new_referrals',morningReports);
  const totalOpenTasks=sum('tasks_open',morningReports);
  const reportsIn=morningReports.length;
  const dataSource=hasPariox?`Pariox · ${csvData.rowCount} records`:'Coordinator Reports';

  const DEFAULT_SETTINGS={ visitTarget:800, revenueTarget:200000, avgReimbursement:90, activeCensusTarget:500, coordinatorCap:80, authRiskVisitsPerWeek:3, adminPin:'1234' };
  const [settings, setSettings]=useState(()=>{ try { const s=localStorage.getItem('axiom_settings'); const parsed=s?JSON.parse(s):null; return parsed||DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; } });
  const [adminUnlocked, setAdminUnlocked]=useState(false);
  const [adminPinInput, setAdminPinInput]=useState('');
  const [adminPinError, setAdminPinError]=useState(false);
  const [settingsDraft, setSettingsDraft]=useState(null);
  const saveSettings=(s)=>{ setSettings(s); try { localStorage.setItem('axiom_settings',JSON.stringify(s)); } catch(e){} };
  const CFG=settings||DEFAULT_SETTINGS;
  const displayVisits=hasPariox?(csvData.dedupedCount||csvData.scheduledVisits||manualVisits):manualVisits;
  const visitPct=Math.min(Math.round((displayVisits/CFG.visitTarget)*100),100);
  const visitGap=CFG.visitTarget-displayVisits;
  const trendData=csvData?.dailyTrend?.length>0?csvData.dailyTrend:weeklyData;

  const [weeklySnapshots, setWeeklySnapshots]=useState(()=>{ try { const s=localStorage.getItem('axiom_weekly_snapshots'); return s?JSON.parse(s):[]; } catch { return []; } });
  const [snapshotNotes, setSnapshotNotes]=useState('');
  const [savingSnapshot, setSavingSnapshot]=useState(false);
  const [growthView, setGrowthView]=useState('weekly');
  const [onHoldTracking, setOnHoldTracking]=useState(()=>{ try { const s=localStorage.getItem('axiom_onhold_tracking'); return s?JSON.parse(s):{}; } catch { return {}; } });
  const saveOnHoldTracking=(data)=>{ setOnHoldTracking(data); try { localStorage.setItem('axiom_onhold_tracking',JSON.stringify(data)); } catch(e){} };
  const [showMissedModal, setShowMissedModal]=useState(false);
  const [authPipeline, setAuthPipeline]=useState(()=>{ try { const s=localStorage.getItem('axiom_auth_pipeline'); return s?JSON.parse(s):[]; } catch { return []; } });
  const saveAuthPipeline=(data)=>{ setAuthPipeline(data); try { localStorage.setItem('axiom_auth_pipeline',JSON.stringify(data)); } catch(e){} };

  const saveSnapshot=()=>{
    if (!hasPariox&&!hasCensus) return;
    setSavingSnapshot(true);
    const weekLabel=(()=>{ const d=new Date(); const start=new Date(d); start.setDate(d.getDate()-d.getDay()+1); const end=new Date(d); end.setDate(d.getDate()-d.getDay()+5); return `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`; })();
    const monthLabel=new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const snap={ id:Date.now(), date:new Date().toISOString().split('T')[0], weekLabel, monthLabel, weekNum:Math.ceil((new Date()-new Date(new Date().getFullYear(),0,1))/(7*24*60*60*1000)), scheduledVisits:displayVisits, completedVisits:csvData?.completedVisits||0, missedVisits:csvData?.missedVisits||0, activeCensus:hasCensus?censusData.activeCensus:null, totalCensus:hasCensus?censusData.total:null, active:hasCensus?(censusData.counts.active||0):null, activeAuthPending:hasCensus?(censusData.counts.active_auth_pending||0):null, authPending:hasCensus?(censusData.counts.auth_pending||0):null, socPending:hasCensus?(censusData.counts.soc_pending||0):null, evalPending:hasCensus?(censusData.counts.eval_pending||0):null, waitlist:hasCensus?(censusData.counts.waitlist||0):null, onHold:hasCensus?((censusData.counts.on_hold||0)+(censusData.counts.on_hold_facility||0)+(censusData.counts.on_hold_pt||0)+(censusData.counts.on_hold_md||0)):null, hospitalized:hasCensus?(censusData.counts.hospitalized||0):null, discharge:hasCensus?(censusData.counts.discharge||0):null, estRevenue:displayVisits*CFG.avgReimbursement, notes:snapshotNotes };
    const updated=[...weeklySnapshots.filter(s=>s.weekLabel!==weekLabel),snap].sort((a,b)=>new Date(a.date)-new Date(b.date));
    setWeeklySnapshots(updated);
    try { localStorage.setItem('axiom_weekly_snapshots',JSON.stringify(updated)); } catch(e){}
    setSnapshotNotes('');
    setSavingSnapshot(false);
  };
  const deleteSnapshot=(id)=>{ const updated=weeklySnapshots.filter(s=>s.id!==id); setWeeklySnapshots(updated); try { localStorage.setItem('axiom_weekly_snapshots',JSON.stringify(updated)); } catch(e){} };

  if (loading) return <div style={{ minHeight:'100vh', background:B.bg, display:'flex', alignItems:'center', justifyContent:'center', color:B.lightGray, fontFamily:'DM Sans,sans-serif' }}>Loading...</div>;

  const STATUS_META_OV = {
    active:{label:'Active',color:B.green,bg:'#F0FDF4',border:'#BBF7D0',icon:'✅',desc:'In treatment'},
    active_auth_pending:{label:'Active–Auth Pend',color:B.orange,bg:'#FFF7ED',border:'#FED7AA',icon:'⏳',desc:'Treating, auth at risk'},
    auth_pending:{label:'Auth Pending',color:B.yellow,bg:'#FFFBEB',border:'#FDE68A',icon:'🔒',desc:'Blocked — no auth'},
    soc_pending:{label:'SOC Pending',color:'#0284C7',bg:'#F0F9FF',border:'#BAE6FD',icon:'📅',desc:'Start of care pending'},
    eval_pending:{label:'Eval Pending',color:'#1565C0',bg:'#EFF6FF',border:'#BFDBFE',icon:'🩺',desc:'Pipeline'},
    waitlist:{label:'Waitlist',color:'#7C3AED',bg:'#F5F3FF',border:'#DDD6FE',icon:'📋',desc:'Needs scheduling'},
    on_hold:{label:'On Hold',color:'#6B7280',bg:'#F9FAFB',border:'#E5E7EB',icon:'⏸️',desc:'Revenue paused'},
    on_hold_facility:{label:'On Hold–Facility',color:'#9CA3AF',bg:'#F9FAFB',border:'#E5E7EB',icon:'🏥',desc:'Facility hold'},
    on_hold_pt:{label:'On Hold–Pt Req',color:'#9CA3AF',bg:'#F9FAFB',border:'#E5E7EB',icon:'🙋',desc:'Patient requested'},
    on_hold_md:{label:'On Hold–MD Req',color:'#9CA3AF',bg:'#F9FAFB',border:'#E5E7EB',icon:'👨‍⚕️',desc:'MD ordered hold'},
    hospitalized:{label:'Hospitalized',color:'#DC2626',bg:'#FEF2F2',border:'#FECACA',icon:'🚨',desc:'In hospital'},
    discharge:{label:'Discharge',color:'#BBA8A4',bg:'#FAFAFA',border:'#E5E7EB',icon:'📤',desc:'Discharged'},
  };

  return (
    <div style={{ minHeight:'100vh', background:B.bg, color:B.black, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap'); *{box-sizing:border-box;} ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#E8D5D0;border-radius:2px;} .tab-btn{background:none;border:none;cursor:pointer;transition:all 0.15s;font-family:'DM Sans',sans-serif;}`}</style>
      <div style={{ padding:'24px 28px', maxWidth:1400, margin:'0 auto' }}>
        {/* ── OVERVIEW ── */}
        {activeTab==='overview' && (
          <>
            {(()=>{
              const weekStart=(()=>{ const d=new Date(); d.setDate(d.getDate()-d.getDay()+1); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); })();
              const weekEnd=(()=>{ const d=new Date(); d.setDate(d.getDate()-d.getDay()+5); return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); })();
              const scheduledThisWeek=displayVisits;
              const completedThisWeek=hasPariox?(csvData.completedVisits||0):totalCompleted;
              const completionPct=scheduledThisWeek>0?Math.round(completedThisWeek/scheduledThisWeek*100):0;
              return (
                <div style={{ background:`linear-gradient(135deg,${B.darkRed} 0%,${B.red} 50%,${B.orange} 100%)`, borderRadius:16, padding:'18px 28px', marginBottom:20, display:'flex', alignItems:'center', gap:24, flexWrap:'wrap', boxShadow:'0 4px 16px rgba(139,26,16,0.2)', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', inset:0, opacity:0.06, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
                  <div style={{ flex:1, minWidth:200, position:'relative' }}>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:4 }}>📅 This Week's Schedule · {weekStart} – {weekEnd}</div>
                    <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
                      <span style={{ fontSize:44, fontWeight:800, color:'#fff', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{hasPariox?scheduledThisWeek.toLocaleString():'—'}</span>
                      <span style={{ fontSize:16, color:'rgba(255,255,255,0.65)' }}>visits on schedule</span>
                    </div>
                    {hasPariox&&(<div style={{ marginTop:10 }}><div style={{ height:5, background:'rgba(255,255,255,0.2)', borderRadius:3, marginBottom:5 }}><div style={{ height:'100%', width:`${Math.min(scheduledThisWeek/CFG.visitTarget*100,100)}%`, background:'#fff', borderRadius:3 }} /></div><div style={{ fontSize:11, color:'rgba(255,255,255,0.65)' }}>{scheduledThisWeek>=CFG.visitTarget?`✓ At or above ${CFG.visitTarget} visit target`:`${CFG.visitTarget-scheduledThisWeek} below the ${CFG.visitTarget}-visit sustainability threshold`}</div></div>)}
                    {!hasPariox&&<div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:6 }}>Upload Pariox weekly export to populate</div>}
                  </div>
                  {hasPariox&&(
                    <div style={{ display:'flex', gap:20, position:'relative' }}>
                      {[{label:'Completed',value:completedThisWeek,sub:`${completionPct}% done`},{label:'Remaining',value:Math.max(0,scheduledThisWeek-completedThisWeek),sub:'this week'},{label:'Clinicians',value:csvData.staffList?.length||'—',sub:'on schedule'},{label:'Patients',value:csvData.uniquePatients||'—',sub:'this week'}].map((s,i)=>(
                        <div key={s.label} style={{ textAlign:'center', paddingLeft:i>0?20:0, borderLeft:i>0?'1px solid rgba(255,255,255,0.2)':'none' }}>
                          <div style={{ fontSize:24, fontWeight:800, color:'#fff', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.label}</div>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:1 }}>{s.sub}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {hasPariox&&<div style={{ position:'absolute', top:10, right:14, fontSize:10, color:'rgba(255,255,255,0.5)', background:'rgba(0,0,0,0.15)', borderRadius:6, padding:'3px 8px' }}>{dataSource}</div>}
                </div>
              );
            })()}

            <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:18, padding:'24px 32px', marginBottom:20, display:'flex', alignItems:'center', gap:32, flexWrap:'wrap', boxShadow:'0 1px 6px rgba(139,26,16,0.06)' }}>
              <div style={{ flex:1, minWidth:280 }}>
                <div style={{ fontSize:11, color:B.lightGray, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8 }}>Weekly Visit Target {hasPariox&&<span style={{ color:B.green, fontWeight:700 }}>· {dataSource}</span>}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:12 }}>
                  <div style={{ fontSize:36, fontWeight:800, color:B.red, fontFamily:"'DM Mono',monospace" }}>{displayVisits}</div>
                  <span style={{ fontSize:16, color:B.lightGray }}>/ {CFG.visitTarget} visits/wk</span>
                </div>
                <div style={{ height:8, background:'#F5EDEB', borderRadius:4 }}>
                  <div style={{ height:'100%', width:`${visitPct}%`, borderRadius:4, background:visitPct>=100?B.green:`linear-gradient(90deg,${B.darkRed},${B.red},${B.orange})`, transition:'width 0.5s ease' }} />
                </div>
                <div style={{ fontSize:11, color:B.gray, marginTop:6 }}>{visitPct}% of target — {visitGap>0?`${visitGap} visits to reach sustainability`:'🎯 Target reached!'}</div>
              </div>
              {[{label:'Reports In',value:`${reportsIn}/${coordinators.length}`,color:reportsIn<coordinators.length?B.danger:B.green},{label:`Gap to ${CFG.visitTarget}`,value:visitGap>0?visitGap:'✓',color:visitGap>0?B.yellow:B.green},{label:'Auths Expiring',value:totalAuthsExpiring,color:totalAuthsExpiring>5?B.danger:B.yellow}].map(s=>(
                <div key={s.label} style={{ textAlign:'center', borderLeft:`1px solid ${B.border}`, paddingLeft:28 }}>
                  <div style={{ fontSize:32, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace" }}>{s.value}</div>
                  <div style={{ fontSize:10, color:B.lightGray, letterSpacing:'0.1em', textTransform:'uppercase', marginTop:4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:14 }}>
              <StatCard icon="👥" label="Patient Census" value={totalPatients||'—'} sub={hasPariox?`${totalPatients} unique patients (Pariox)`:"Total from coordinator reports"} color={B.red} />
              <StatCard icon="✅" label={hasPariox?"Completed This Week":"Visits Today"} value={totalCompleted||'—'} sub={hasPariox?`${csvData?.missedVisits||0} missed · ${csvData?.rawCount||0} raw rows`:`of ${totalScheduled||'—'} scheduled today`} color={B.green} />
              <StatCard icon="⚠️" label="Missed Visits" value={totalMissed||0} sub={hasPariox?"Cancelled/no-show this week":"Require same-day reschedule"} color={totalMissed>5?B.danger:B.yellow} alert={totalMissed>5?'Above threshold':null} />
              <StatCard icon="📋" label="New Referrals" value={totalReferrals||0} sub="Received today" color={B.darkRed} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
              <StatCard icon="🔒" label="Auths Pending" value={totalAuthsPending||0} sub="Awaiting approval" color={B.yellow} />
              <StatCard icon="⏰" label="Auths Expiring" value={totalAuthsExpiring||0} sub="Within 7 days" color={totalAuthsExpiring>3?B.danger:B.yellow} alert={totalAuthsExpiring>3?'Action required today':null} />
              <StatCard icon="📌" label="Open Tasks" value={totalOpenTasks||0} sub="Team total" color={B.orange} />
              <StatCard icon="📊" label="Morning Reports" value={`${reportsIn}/${coordinators.length}`} sub="Submitted by 9 AM" color={reportsIn<coordinators.length?B.danger:B.green} alert={reportsIn<coordinators.length?`${coordinators.length-reportsIn} missing`:null} />
            </div>

            {activeNotSeen!=null&&activeNotSeen>0&&(
              <div style={{ background:activeNotSeen>50?'#FEF2F2':'#FFFBEB', border:`1px solid ${activeNotSeen>50?'#FECACA':'#FDE68A'}`, borderRadius:14, padding:'16px 22px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:activeNotSeen>50?B.danger:B.yellow, marginBottom:4 }}>{activeNotSeen>50?'🚨':'⚠️'} {activeNotSeen} Active Patients Not Scheduled This Week</div>
                  <div style={{ fontSize:12, color:activeNotSeen>50?'#7F1D1D':'#92400E', lineHeight:1.6 }}>These patients are marked Active in your census but have no visits on the current Pariox schedule.</div>
                  <div style={{ fontSize:11, color:B.lightGray, marginTop:6 }}>Estimated revenue at risk: ~${(activeNotSeen*CFG.authRiskVisitsPerWeek*CFG.avgReimbursement/1000).toFixed(1)}K/week</div>
                </div>
                <div style={{ textAlign:'center', marginLeft:24, flexShrink:0, background:'rgba(255,255,255,0.6)', borderRadius:12, padding:'14px 20px' }}>
                  <div style={{ fontSize:40, fontWeight:800, color:activeNotSeen>50?B.danger:B.yellow, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{activeNotSeen}</div>
                  <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:4 }}>unscheduled</div>
                </div>
              </div>
            )}

            {/* Census section */}
            {(()=>{
              const totalCensus=hasCensus?censusData.total:null;
              const activeCensus=hasCensus?censusData.activeCensus:null;
              const regionKeys=hasCensus?Object.keys(censusData.byRegion||{}).sort():[];
              const displayCounts=hasCensus&&selectedCensusRegion!=='all'&&censusData.byRegion[selectedCensusRegion]?censusData.byRegion[selectedCensusRegion]:(hasCensus?censusData.counts:null);
              const displayTotal=hasCensus&&selectedCensusRegion!=='all'&&censusData.byRegion[selectedCensusRegion]?censusData.byRegion[selectedCensusRegion].total:totalCensus;
              const displayActive=hasCensus&&selectedCensusRegion!=='all'&&censusData.byRegion[selectedCensusRegion]?censusData.byRegion[selectedCensusRegion].activeCensus:activeCensus;
              return (
                <div style={{ marginBottom:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:B.black, letterSpacing:'0.06em', textTransform:'uppercase' }}>Patient Census</div>
                      {hasCensus&&<div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, color:B.green }}>{displayActive} Active Census</div>}
                      {hasCensus&&<div style={{ fontSize:11, color:B.lightGray }}>{displayTotal} total · {censusData.lastUpdated} · <span style={{ color:'#0369A1' }}>Live sync active</span></div>}
                    </div>
                    <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' }}>
                      {hasCensus&&<span style={{ fontSize:11, color:B.lightGray, marginRight:2 }}>Region:</span>}
                      {hasCensus&&['all',...regionKeys].map(r=>(
                        <button key={r} onClick={()=>setSelectedCensusRegion(r)} style={{ padding:'4px 9px', borderRadius:6, border:`1px solid ${selectedCensusRegion===r?B.red:B.border}`, background:selectedCensusRegion===r?'#FFF5F2':'transparent', color:selectedCensusRegion===r?B.red:B.gray, fontSize:11, fontWeight:selectedCensusRegion===r?700:400, cursor:'pointer', fontFamily:'inherit' }}>{r==='all'?'All':r}</button>
                      ))}
                      {!hasCensus&&<button onClick={()=>setActiveTab('data')} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:7, color:B.gray, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Upload Census →</button>}
                    </div>
                  </div>
                  {hasCensus?(
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                      {Object.entries(STATUS_META_OV).map(([key,meta])=>{
                        const count=(displayCounts&&displayCounts[key])||0;
                        const pct=displayTotal>0?Math.round(count/displayTotal*100):0;
                        return (
                          <div key={key} style={{ background:meta.bg, border:`1px solid ${meta.border}`, borderRadius:12, padding:'12px 14px', position:'relative', overflow:'hidden' }}>
                            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:meta.color }} />
                            <div style={{ fontSize:10, color:meta.color, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:4 }}>{meta.icon} {meta.label}</div>
                            <div style={{ fontSize:26, fontWeight:800, color:meta.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{count}</div>
                            <div style={{ fontSize:10, color:meta.color, opacity:0.7, marginTop:3 }}>{pct}%</div>
                            <div style={{ fontSize:10, color:'#6B7280', marginTop:1 }}>{meta.desc}</div>
                            <div style={{ marginTop:6, height:3, background:'rgba(0,0,0,0.08)', borderRadius:2 }}><div style={{ height:'100%', width:`${pct}%`, background:meta.color, borderRadius:2 }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  ):(
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
                      {Object.entries(STATUS_META_OV).map(([key,meta])=>(
                        <div key={key} style={{ background:'#FAFAFA', border:`1px solid ${B.border}`, borderRadius:12, padding:'14px 16px', opacity:0.6 }}>
                          <div style={{ fontSize:10, color:B.lightGray, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6 }}>{meta.icon} {meta.label}</div>
                          <div style={{ fontSize:30, fontWeight:800, color:B.lightGray, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>—</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:16, padding:'20px 24px', boxShadow:'0 1px 6px rgba(139,26,16,0.06)' }}>
              <div style={{ fontSize:12, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:B.lightGray, marginBottom:14 }}>Live Alerts</div>
              {coordinators.filter(c=>!morningReports.find(r=>r.coordinator_id===c.id)).map(c=><AlertItem key={c.id} text={`${c.name} — Morning report not submitted`} severity="critical" />)}
              {totalAuthsExpiring>3&&<AlertItem text={`${totalAuthsExpiring} authorizations expiring within 7 days — action required today`} severity="critical" />}
              {visitGap>100&&<AlertItem text={`Weekly visit pace is ${visitGap} below the ${CFG.visitTarget}-visit sustainability threshold`} severity="warning" />}
              {totalMissed>5&&<AlertItem text={`${totalMissed} missed visits today — verify same-day reschedule documentation`} severity="warning" />}
              {reportsIn===coordinators.length&&totalAuthsExpiring<=3&&totalMissed<=5&&visitGap<=100&&coordinators.length>0&&<AlertItem text="No critical alerts — team is operating within thresholds" severity="info" />}
              {activeNotSeen!=null&&activeNotSeen>20&&<AlertItem text={`${activeNotSeen} active patients not scheduled this week — review coordinator caseload assignments`} severity="critical" />}
              {hasCensus&&(censusData.counts.on_hold||0)+(censusData.counts.on_hold_facility||0)>80&&<AlertItem text={`${(censusData.counts.on_hold||0)+(censusData.counts.on_hold_facility||0)} patients on hold — recovery needed to reach visit target`} severity="warning" />}
              {hasCensus&&(censusData.counts.auth_pending||0)+(censusData.counts.active_auth_pending||0)>10&&<AlertItem text={`${(censusData.counts.auth_pending||0)+(censusData.counts.active_auth_pending||0)} patients with auth issues — estimated $${(((censusData.counts.auth_pending||0)+(censusData.counts.active_auth_pending||0))*CFG.authRiskVisitsPerWeek*CFG.avgReimbursement/1000).toFixed(1)}K/wk revenue blocked`} severity="warning" />}
            </div>
          </>
        )}

        {/* ── TEAM ── */}
        {activeTab==='team'&&(
          <div>
            <div style={{ marginBottom:20 }}><div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Team Performance</div><div style={{ fontSize:13, color:B.gray }}>Live coordinator metrics</div></div>
            <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 1px 6px rgba(139,26,16,0.06)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'180px 80px 80px 80px 80px 80px 80px 80px 1fr', padding:'12px 20px', borderBottom:`1px solid ${B.border}`, background:'#FBF7F6' }}>
                {['Coordinator','Patients','Sched','Done','Missed','Auth ⚠','Referrals','Tasks','Completion'].map((h,i)=>(
                  <div key={i} style={{ fontSize:10, color:B.lightGray, letterSpacing:'0.1em', textTransform:'uppercase', textAlign:i>0&&i<8?'center':'left' }}>{h}</div>
                ))}
              </div>
              {coordinators.length===0?<div style={{ padding:'40px 20px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No coordinator data yet.</div>
                :coordinators.map(c=><CoordRow key={c.id} coordinator={c} report={morningReports.find(r=>r.coordinator_id===c.id)} />)}
            </div>
          </div>
        )}

        {/* ── TRENDS ── */}
        {activeTab==='trends'&&(
          <div>
            <div style={{ marginBottom:20 }}><div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Visit Trend</div><div style={{ fontSize:13, color:B.gray }}>{csvData?'Showing Pariox import data':'Upload Pariox data in the Data tab for full detail'}</div></div>
            <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', marginBottom:20, boxShadow:'0 1px 6px rgba(139,26,16,0.06)' }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trendData} barSize={32}>
                  <XAxis dataKey="day" tick={{ fill:B.lightGray, fontSize:11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:B.lightGray, fontSize:11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill:'rgba(217,79,43,0.04)' }} />
                  <ReferenceLine y={160} stroke={B.border} strokeDasharray="4 4" label={{ value:'Daily Target', fill:B.lightGray, fontSize:11 }} />
                  <Bar dataKey="visits" name="Visits Completed" radius={[4,4,0,0]}>
                    {trendData.map((entry,i)=><Cell key={i} fill={entry.visits>=150?B.green:entry.visits>=120?B.yellow:entry.visits>0?B.red:'#F5EDEB'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
              <StatCard label="7-Day Total" value={trendData.reduce((s,d)=>s+d.visits,0)} sub="Completed visits" color={B.red} />
              <StatCard label="Daily Average" value={Math.round(trendData.reduce((s,d)=>s+d.visits,0)/Math.max(trendData.filter(d=>d.visits>0).length,1))} sub="Per active day" color={B.green} />
              <StatCard label="Days On Target" value={trendData.filter(d=>d.visits>=150).length} sub={`of ${trendData.filter(d=>d.visits>0).length} reported days`} color={B.darkRed} />
            </div>
          </div>
        )}

        {/* ── DATA ── */}
        {activeTab==='data'&&(
          <div>
            <div style={{ marginBottom:20 }}><div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Data & Integrations</div><div style={{ fontSize:13, color:B.gray }}>Upload Pariox data — census syncs to all users in real time via Supabase</div></div>
            <CSVUploadPanel onDataLoaded={handleCSV} csvData={csvData} />
            <CensusUploadPanel censusData={censusData} onDataLoaded={saveCensusData} parseCensusFile={parseCensusFile} error={censusUploadError} setError={setCensusUploadError} processing={censusProcessing} setProcessing={setCensusProcessing} />
            <GoogleDriveLinkPanel driveLinks={driveLinks} onAddLink={addDriveLink} onRemoveLink={removeDriveLink} />
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeTab==='⚙️'&&(()=>{
          const draft=settingsDraft||CFG;
          return (
            <div style={{ maxWidth:720, margin:'0 auto' }}>
              <div style={{ marginBottom:24 }}><div style={{ fontSize:18, fontWeight:800, color:B.black, marginBottom:4 }}>⚙️ Director Settings</div><div style={{ fontSize:13, color:B.gray }}>Edit dashboard targets, rates, and thresholds</div></div>
              {!adminUnlocked?(
                <div style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:16, padding:'40px', textAlign:'center', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>🔐</div>
                  <div style={{ fontSize:16, fontWeight:700, color:B.black, marginBottom:6 }}>Director Access Required</div>
                  <div style={{ fontSize:13, color:B.gray, marginBottom:24 }}>Enter your 4-digit PIN to edit settings</div>
                  <div style={{ display:'flex', gap:10, justifyContent:'center', alignItems:'center' }}>
                    <input type="password" maxLength={4} value={adminPinInput}
                      onChange={e=>{ setAdminPinInput(e.target.value); setAdminPinError(false); }}
                      onKeyDown={e=>{ if (e.key==='Enter') { if (adminPinInput===CFG.adminPin) { setAdminUnlocked(true); setSettingsDraft({...CFG}); setAdminPinInput(''); } else { setAdminPinError(true); setAdminPinInput(''); } }}}
                      placeholder="PIN" style={{ width:100, padding:'12px', textAlign:'center', fontSize:20, letterSpacing:'0.3em', border:`2px solid ${adminPinError?B.danger:B.border}`, borderRadius:10, outline:'none', fontFamily:"'DM Mono',monospace" }} />
                    <button onClick={()=>{ if (adminPinInput===CFG.adminPin) { setAdminUnlocked(true); setSettingsDraft({...CFG}); setAdminPinInput(''); } else { setAdminPinError(true); setAdminPinInput(''); }}}
                      style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:10, color:'#fff', padding:'12px 20px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Unlock</button>
                  </div>
                  {adminPinError&&<div style={{ color:B.danger, fontSize:12, marginTop:10 }}>Incorrect PIN</div>}
                  <div style={{ fontSize:11, color:B.lightGray, marginTop:16 }}>Default PIN: 1234</div>
                </div>
              ):(
                <div>
                  {[
                    { section:'📅 Visit Targets', fields:[{key:'visitTarget',label:'Weekly Visit Target',sub:'Sustainability threshold',type:'number',suffix:'visits/wk'}] },
                    { section:'💰 Revenue', fields:[{key:'revenueTarget',label:'Weekly Revenue Target',sub:'Company weekly goal',type:'number',prefix:'$',suffix:'/week'},{key:'avgReimbursement',label:'Avg Reimbursement Per Visit',sub:'Used for all revenue estimates',type:'number',prefix:'$',suffix:'/visit'},{key:'authRiskVisitsPerWeek',label:'Avg Visits Per Patient / Week',sub:'For risk calculations',type:'number',suffix:'visits/wk'}] },
                    { section:'👥 Census Targets', fields:[{key:'activeCensusTarget',label:'Active Census Target',sub:'Active + Active-Auth Pending goal',type:'number',suffix:'patients'},{key:'coordinatorCap',label:'Coordinator Caseload Cap',sub:'Max patients per coordinator',type:'number',suffix:'patients'}] },
                    { section:'🔐 Security', fields:[{key:'adminPin',label:'Director PIN',sub:'Change your 4-digit settings PIN',type:'text',maxLength:4}] },
                  ].map(section=>(
                    <div key={section.section} style={{ background:B.cardBg, border:`1px solid ${B.border}`, borderRadius:16, padding:'22px 24px', marginBottom:16, boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
                      <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:16 }}>{section.section}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                        {section.fields.map(field=>(
                          <div key={field.key} style={{ display:'grid', gridTemplateColumns:'1fr 200px', gap:16, alignItems:'center' }}>
                            <div><div style={{ fontSize:13, fontWeight:600, color:B.black }}>{field.label}</div><div style={{ fontSize:11, color:B.gray, marginTop:2 }}>{field.sub}</div></div>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              {field.prefix&&<span style={{ fontSize:13, color:B.gray }}>{field.prefix}</span>}
                              <input type={field.type} value={draft[field.key]} maxLength={field.maxLength}
                                onChange={e=>setSettingsDraft(prev=>({...prev,[field.key]:field.type==='number'?(parseFloat(e.target.value)||0):e.target.value}))}
                                style={{ flex:1, padding:'10px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:14, fontFamily:"'DM Mono',monospace", fontWeight:700, color:B.red, outline:'none', textAlign:'right' }} />
                              {field.suffix&&<span style={{ fontSize:11, color:B.gray, whiteSpace:'nowrap' }}>{field.suffix}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                    <button onClick={()=>{ setAdminUnlocked(false); setSettingsDraft(null); }} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:10, color:B.gray, padding:'12px 20px', fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                    <button onClick={()=>{ saveSettings(draft); setAdminUnlocked(false); setSettingsDraft(null); }} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:10, color:'#fff', padding:'12px 24px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Save Settings</button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626',
  blue:'#1D4ED8', purple:'#7C3AED',
};

const PAYER_COLORS = {
  'Humana':'#0066CC','CarePlus':'#009B77','Medicare/Devoted':'#1565C0',
  'FL Health Care Plans':'#2E7D32','Aetna':'#7B1FA2',
  'Cigna':'#E65100','HealthFirst':'#00838F','Other':'#6B7280',
};
const PAYER_PHONES = {
  'Humana':'1-800-448-6262','CarePlus':'1-800-794-5907',
  'Medicare/Devoted':'1-800-338-6833','FL Health Care Plans':'1-800-955-8771',
  'Aetna':'1-800-624-0756','Cigna':'1-800-244-6224','HealthFirst':'1-800-935-5465',
};
const ALL_REGIONS = ['A','B','C','G','H','I','J','L','M','N','T','V','V1-B','V2-MD'];
const TEAM_MEMBERS = ['Ethel Camposano','Gerilyn Bayson','Uriel Sarabosing'];

// ── Helper: parse date strings flexibly ──────────────────────
function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  for (const fmt of [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
  ]) {
    const m = s.match(fmt);
    if (m) {
      const year = m[3].length === 2 ? '20' + m[3] : m[3];
      return `${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    }
  }
  return null;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr+'T12:00:00') - new Date()) / 86400000);
}

function priorityOf(rec) {
  if (!rec) return 'no_auth';
  const exp = daysUntil(rec.auth_thru);
  const followToday = rec.next_follow_up && new Date(rec.next_follow_up+'T12:00:00').toDateString() === new Date().toDateString();
  const overdue = rec.next_follow_up && new Date(rec.next_follow_up+'T12:00:00') < new Date(new Date().setHours(0,0,0,0));
  const txRem = (rec.tx_approved||0) - (rec.tx_used||0);
  if (exp !== null && exp < 0) return 'expired';
  if (exp !== null && exp <= 7) return 'expiring_critical';
  if (txRem > 0 && txRem <= 3) return 'visits_low';
  if (followToday || overdue) return 'followup_due';
  if (exp !== null && exp <= 30) return 'expiring_soon';
  if (rec.auth_status === 'pending') return 'pending';
  return 'ok';
}

const PRIORITY_META = {
  no_auth:          { label:'No Auth',          color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨', order:0 },
  expiring_critical:{ label:'Expiring ≤7d',     color:'#EA580C', bg:'#FFF7ED', border:'#FED7AA', icon:'⚠️', order:1 },
  visits_low:       { label:'≤3 Visits Left',   color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', icon:'🔢', order:2 },
  followup_due:     { label:'Follow-Up Due',     color:B.purple,  bg:'#F5F3FF', border:'#DDD6FE', icon:'📞', order:3 },
  expiring_soon:    { label:'Expiring ≤30d',     color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'🕐', order:4 },
  expired:          { label:'Expired',           color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB', icon:'⏰', order:5 },
  pending:          { label:'Pending Review',    color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE', icon:'🔄', order:6 },
  ok:               { label:'Active',            color:B.green,   bg:'#F0FDF4', border:'#BBF7D0', icon:'✅', order:7 },
};

// ── Excel import parser ───────────────────────────────────────
function parseAuthExcel(XLSX, arrayBuffer, payer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type:'array', cellDates:true });
  const patients = [];

  const isPatientName = (val) => {
    if (!val || typeof val !== 'string') return false;
    const v = val.trim();
    if (v.length < 4) return false;
    const skip = ['patient name','careplus','humana','lymphedema','ppo','no-careplus',
      'auth#','auth #','medicare','medicaid','bcbs','aetna','region','note:','sheet',
      'galindo','tab','visit','eval','maintenance'];
    const low = v.toLowerCase();
    if (skip.some(s => low.includes(s))) return false;
    return v.includes(',') || (v === v.toUpperCase() && v.includes(' '));
  };

  const parseAuthStr = (s) => {
    const r = { raw_auth_string: s?.slice(0,300) || '' };
    if (!s) return r;
    const an = s.match(/[Aa][Uu][Tt][Hh]\s*#?\s*([0-9A-Za-z*]+)/);
    if (an) r.auth_number = an[1].replace(/\*PO$/,'').trim();
    const dr = s.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (dr) { r.auth_from = parseDate(dr[1]); r.auth_thru = parseDate(dr[2]); }
    const tx = s.match(/(\d+)\s*(?:TX|MT)\s*\((\d+)-used\)/i);
    if (tx) { r.tx_approved = parseInt(tx[1]); r.tx_used = parseInt(tx[2]); }
    const ra = s.match(/(\d+)\s*RA\s*\((\d+)-used\)/i);
    if (ra) { r.ra_approved = parseInt(ra[1]); r.ra_used = parseInt(ra[2]); }
    const ev = s.match(/(\d+)\s*EVAL\s*\((\d*)-?used\)/i);
    if (ev) { r.eval_approved = parseInt(ev[1]); r.eval_used = ev[2] ? parseInt(ev[2]) : 0; }
    return r;
  };

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().includes('no-')) continue;
    const regionMatch = sheetName.match(/^([A-Z0-9\-V]+)/);
    const region = regionMatch ? regionMatch[1].replace(/-$/,'') : '?';
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:null });

    let current = null;
    let authData = {};

    for (const row of rows) {
      const cells = row.filter(c => c !== null && c !== '');
      if (!cells.length) {
        if (current) {
          patients.push({ ...current, ...authData, payer, region, assigned_to:'Ethel Camposano' });
          current = null; authData = {};
        }
        continue;
      }
      const a = row[0];
      const b = row[1];
      if (a === 'Patient Name') continue;
      if (a && typeof a === 'string' && /[Aa][Uu][Tt][Hh]/i.test(a)) {
        authData = parseAuthStr(a); continue;
      }
      if (b && typeof b === 'string' && /visit|eval|maintenance/i.test(b)) continue;
      if (isPatientName(a)) {
        if (current) patients.push({ ...current, ...authData, payer, region, assigned_to:'Ethel Camposano' });
        current = { patient_name: a.trim().replace(/-\s*(DISCHARGED|discharged).*/i,'').trim() };
        authData = {};
      }
    }
    if (current) patients.push({ ...current, ...authData, payer, region, assigned_to:'Ethel Camposano' });
  }

  // Deduplicate — keep most complete record per patient+payer
  const seen = new Map();
  for (const p of patients) {
    const key = `${p.patient_name?.toLowerCase().trim()}|${payer}`;
    const existing = seen.get(key);
    if (!existing || (p.auth_number && !existing.auth_number)) seen.set(key, p);
  }
  return [...seen.values()];
}

// ── Import Panel Component ────────────────────────────────────
function ImportPanel({ onImportComplete }) {
  const [humanaFile, setHumanaFile] = useState(null);
  const [careplusFile, setCareplusFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const humanaRef = useRef(); const careplusRef = useRef();

  const loadXLSX = () => new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });

  const readFile = (file) => new Promise((resolve) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsArrayBuffer(file);
  });

  const runImport = async () => {
    if (!humanaFile && !careplusFile) { setError('Please select at least one file.'); return; }
    setImporting(true); setError(''); setProgress('Loading Excel parser...');
    try {
      const XLSX = await loadXLSX();
      let allRecords = [];

      if (humanaFile) {
        setProgress('Parsing Humana file...');
        const buf = await readFile(humanaFile);
        const records = parseAuthExcel(XLSX, buf, 'Humana');
        allRecords = allRecords.concat(records);
        setProgress(`Humana: ${records.length} records parsed`);
      }
      if (careplusFile) {
        setProgress('Parsing CarePlus file...');
        const buf = await readFile(careplusFile);
        const records = parseAuthExcel(XLSX, buf, 'CarePlus');
        allRecords = allRecords.concat(records);
        setProgress(`CarePlus: ${records.length} records parsed`);
      }

      setProgress(`Uploading ${allRecords.length} records to Supabase...`);

      // Clear existing Ethel records first
      await supabase.from('auth_records').delete().eq('assigned_to','Ethel Camposano');

      // Batch insert
      const BATCH = 100;
      let inserted = 0;
      for (let i = 0; i < allRecords.length; i += BATCH) {
        // Validate date — reject anything with invalid month/day
        const safeDate = (d) => {
          if (!d) return null;
          const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return null;
          const [,y,mo,dy] = m;
          if (parseInt(mo)<1||parseInt(mo)>12||parseInt(dy)<1||parseInt(dy)>31) return null;
          try { const dt = new Date(d); return isNaN(dt.getTime()) ? null : d; } catch { return null; }
        };
        const batch = allRecords.slice(i, i + BATCH).map(r => ({
          patient_name: r.patient_name || '',
          payer: r.payer || '',
          region: r.region || '',
          assigned_to: r.assigned_to || 'Ethel Camposano',
          auth_number: r.auth_number || null,
          auth_from: safeDate(r.auth_from),
          auth_thru: safeDate(r.auth_thru),
          tx_approved: r.tx_approved || 0,
          tx_used: r.tx_used || 0,
          ra_approved: r.ra_approved || 0,
          ra_used: r.ra_used || 0,
          eval_approved: r.eval_approved || 0,
          eval_used: r.eval_used || 0,
          auth_status: 'active',
          raw_auth_string: r.raw_auth_string || null,
          updated_at: new Date().toISOString(),
        }));
        const { error: err } = await supabase.from('auth_records').insert(batch);
        if (err) throw new Error(err.message);
        inserted += batch.length;
        setProgress(`Uploading... ${inserted}/${allRecords.length}`);
      }

      setDone({ total: allRecords.length, humana: allRecords.filter(r=>r.payer==='Humana').length, careplus: allRecords.filter(r=>r.payer==='CarePlus').length });
      setProgress('');
      setImporting(false);
      onImportComplete();
    } catch(e) {
      setError('Import failed: ' + e.message);
      setImporting(false);
      setProgress('');
    }
  };

  return (
    <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', marginBottom:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>📥 Import Ethel's Auth Tracking Files</div>
      <div style={{ fontSize:12, color:B.gray, marginBottom:20 }}>Upload the Humana and CarePlus Excel files to replace the spreadsheets. Data is stored in Supabase — accessible by all team members and exportable to Excel/CSV.</div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        {[
          { label:'Humana Auth Tracking', payer:'Humana', file:humanaFile, ref:humanaRef, setter:setHumanaFile, color:'#0066CC' },
          { label:'CarePlus Auth Tracking', payer:'CarePlus', file:careplusFile, ref:careplusRef, setter:setCareplusFile, color:'#009B77' },
        ].map(f => (
          <div key={f.payer} style={{ border:`2px dashed ${f.file?f.color:B.border}`, borderRadius:12, padding:'20px', textAlign:'center', background:f.file?`${f.color}08`:'#FAFAFA', cursor:'pointer' }} onClick={() => f.ref.current.click()}>
            <input ref={f.ref} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={e => { f.setter(e.target.files[0]); e.target.value=''; }} />
            <div style={{ fontSize:24, marginBottom:8 }}>{f.file ? '✅' : '📊'}</div>
            <div style={{ fontSize:13, fontWeight:600, color:f.file?f.color:B.black }}>{f.file ? f.file.name : f.label}</div>
            <div style={{ fontSize:11, color:B.lightGray, marginTop:4 }}>{f.file ? 'Click to change' : 'Click to select .xlsx file'}</div>
          </div>
        ))}
      </div>

      {progress && <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', fontSize:12, color:B.blue, marginBottom:12 }}>⏳ {progress}</div>}
      {error && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:B.danger, marginBottom:12 }}>❌ {error}</div>}

      {done && (
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'14px 18px', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:B.green, marginBottom:6 }}>✅ Import Complete</div>
          <div style={{ fontSize:12, color:B.green }}>
            {done.total} total records imported — {done.humana} Humana · {done.careplus} CarePlus<br/>
            All data is now stored in Supabase. The spreadsheets are no longer needed.
          </div>
        </div>
      )}

      <button onClick={runImport} disabled={importing || (!humanaFile && !careplusFile)}
        style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:10, color:'#fff', padding:'11px 24px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:importing||(!humanaFile&&!careplusFile)?0.5:1 }}>
        {importing ? 'Importing...' : '📥 Import Files to Supabase'}
      </button>
    </div>
  );
}

// ── Export function ───────────────────────────────────────────
async function exportToExcel(records, filename) {
  const XLSX = await new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX); s.onerror = reject;
    document.head.appendChild(s);
  });
  const rows = records.map(r => ({
    'Patient Name': r.patient_name,
    'Payer': r.payer,
    'Region': r.region,
    'Assigned To': r.assigned_to,
    'Auth Number': r.auth_number,
    'Auth From': r.auth_from,
    'Auth Thru': r.auth_thru,
    'TX Approved': r.tx_approved,
    'TX Used': r.tx_used,
    'TX Remaining': (r.tx_approved||0)-(r.tx_used||0),
    'RA Approved': r.ra_approved,
    'RA Used': r.ra_used,
    'Eval Approved': r.eval_approved,
    'Eval Used': r.eval_used,
    'Auth Status': r.auth_status,
    'PCP': r.pcp,
    'Date Submitted': r.date_submitted,
    'Last Call Date': r.last_call_date,
    'Last Call Notes': r.last_call_notes,
    'Next Follow Up': r.next_follow_up,
    'VOB Verified': r.vob_verified ? 'Yes' : 'No',
    'Notes': r.notes,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Auth Records');
  XLSX.writeFile(wb, filename);
}

// ── Main Component ────────────────────────────────────────────
export default function AuthTracker() {
  const { isSuperAdmin, isDirector, isTeamLeader, profile } = useAuth();
  const isLeaderOrAbove = isSuperAdmin || isDirector || isTeamLeader;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [showImport, setShowImport] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterPayer, setFilterPayer] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [showExpired, setShowExpired] = useState(false);
  const setField = (k,v) => setEditForm(p=>({...p,[k]:v}));

  const loadRecords = async () => {
    const { data } = await supabase.from('auth_records').select('*').order('patient_name');
    setRecords(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadRecords();
    const sub = supabase.channel('auth-records-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'auth_records' }, loadRecords)
      .subscribe();
    return () => sub.unsubscribe();
  }, []);

  // Augment records with priority
  const augmented = useMemo(() => records.map(r => ({
    ...r,
    priority: priorityOf(r),
    txRemaining: (r.tx_approved||0) - (r.tx_used||0),
    daysLeft: daysUntil(r.auth_thru),
  })).sort((a,b) => (PRIORITY_META[a.priority]?.order||9) - (PRIORITY_META[b.priority]?.order||9)), [records]);

  const visible = useMemo(() => {
    let list = augmented;
    if (!showExpired) list = list.filter(r => r.priority !== 'expired');
    if (filterPayer !== 'all') list = list.filter(r => r.payer === filterPayer);
    if (filterRegion !== 'all') list = list.filter(r => r.region === filterRegion);
    if (filterPriority !== 'all') list = list.filter(r => r.priority === filterPriority);
    if (filterAssignee !== 'all') list = list.filter(r => r.assigned_to === filterAssignee);
    if (search) list = list.filter(r => (r.patient_name||'').toLowerCase().includes(search.toLowerCase()) || (r.auth_number||'').toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [augmented, showExpired, filterPayer, filterRegion, filterPriority, filterAssignee, search]);

  // KPIs (exclude expired from active counts)
  const active = augmented.filter(r => r.priority !== 'expired');
  const kpis = {
    noAuth:    active.filter(r => !r.auth_number).length,
    critical:  active.filter(r => ['expiring_critical','visits_low'].includes(r.priority)).length,
    followup:  active.filter(r => r.priority === 'followup_due').length,
    expiring:  active.filter(r => r.priority === 'expiring_soon').length,
    expired:   augmented.filter(r => r.priority === 'expired').length,
    total:     active.length,
  };

  // Follow-up queue — due today + overdue
  const followupQueue = useMemo(() => augmented.filter(r => {
    if (!r.next_follow_up) return false;
    return new Date(r.next_follow_up+'T12:00:00') <= new Date(new Date().setHours(23,59,59));
  }).sort((a,b) => new Date(a.next_follow_up) - new Date(b.next_follow_up)), [augmented]);

  // Upcoming this week
  const upcomingFollowups = useMemo(() => {
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate()+7);
    return augmented.filter(r => {
      if (!r.next_follow_up) return false;
      const d = new Date(r.next_follow_up+'T12:00:00');
      return d > new Date() && d <= weekEnd;
    }).sort((a,b) => new Date(a.next_follow_up) - new Date(b.next_follow_up));
  }, [augmented]);

  // Per-member metrics
  const memberMetrics = useMemo(() => TEAM_MEMBERS.map(name => {
    const pts = active.filter(r => r.assigned_to === name);
    return {
      name,
      total: pts.length,
      noAuth: pts.filter(r => !r.auth_number).length,
      critical: pts.filter(r => ['expiring_critical','visits_low'].includes(r.priority)).length,
      followToday: pts.filter(r => r.priority === 'followup_due').length,
      expiring: pts.filter(r => r.priority === 'expiring_soon').length,
    };
  }), [active]);

  // Payer breakdown
  const payerBreakdown = useMemo(() => {
    const map = {};
    active.forEach(r => {
      if (!map[r.payer]) map[r.payer] = { total:0, noAuth:0, critical:0, expiring:0 };
      map[r.payer].total++;
      if (!r.auth_number) map[r.payer].noAuth++;
      if (['expiring_critical','visits_low'].includes(r.priority)) map[r.payer].critical++;
      if (r.priority === 'expiring_soon') map[r.payer].expiring++;
    });
    return Object.entries(map).sort(([,a],[,b]) => b.total - a.total);
  }, [active]);

  const startEdit = (rec) => {
    setEditingRecord(rec);
    setEditForm({ ...rec });
    setView('edit');
  };

  const saveRecord = async () => {
    setSaving(true);
    const payload = {
      patient_name: editForm.patient_name,
      payer: editForm.payer,
      region: editForm.region,
      assigned_to: editForm.assigned_to,
      auth_number: editForm.auth_number || null,
      auth_from: editForm.auth_from || null,
      auth_thru: editForm.auth_thru || null,
      tx_approved: parseInt(editForm.tx_approved)||0,
      tx_used: parseInt(editForm.tx_used)||0,
      ra_approved: parseInt(editForm.ra_approved)||0,
      ra_used: parseInt(editForm.ra_used)||0,
      eval_approved: parseInt(editForm.eval_approved)||0,
      eval_used: parseInt(editForm.eval_used)||0,
      auth_status: editForm.auth_status || 'active',
      pcp: editForm.pcp || null,
      date_submitted: editForm.date_submitted || null,
      last_call_date: editForm.last_call_date || null,
      last_call_notes: editForm.last_call_notes || null,
      next_follow_up: editForm.next_follow_up || null,
      denial_reason: editForm.denial_reason || null,
      notes: editForm.notes || null,
      vob_verified: editForm.vob_verified || false,
      claim_paid: editForm.claim_paid || false,
      updated_at: new Date().toISOString(),
    };
    if (editForm.id) {
      await supabase.from('auth_records').update(payload).eq('id', editForm.id);
    } else {
      await supabase.from('auth_records').insert(payload);
    }
    await loadRecords();
    setSaving(false);
    setEditingRecord(null);
    setView('list');
  };

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>Loading auth records...</div>;

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>🔒 Authorization Tracker</h1>
          <p style={{ fontSize:13, color:B.gray, margin:0 }}>{active.length} active patients · {records.length} total · Live sync · Exportable</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {isLeaderOrAbove && <button onClick={()=>setShowImport(p=>!p)} style={{ padding:'7px 14px', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${showImport?B.red:B.border}`, background:showImport?'#FFF5F2':'transparent', color:showImport?B.red:B.gray }}>📥 Import Files</button>}
          <button onClick={()=>exportToExcel(visible,'auth_records_export.xlsx')} style={{ padding:'7px 14px', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${B.border}`, background:'transparent', color:B.gray }}>⬇️ Export Excel</button>
          {['dashboard','list','calendar'].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{ padding:'7px 14px', borderRadius:8, fontSize:12, cursor:'pointer', fontFamily:'inherit', border:`1px solid ${view===v?B.red:B.border}`, background:view===v?'#FFF5F2':'transparent', color:view===v?B.red:B.gray, fontWeight:view===v?700:400 }}>
              {v==='dashboard'?'📊 Overview':v==='list'?'📋 Patient List':'📅 Follow-Up Calendar'}
            </button>
          ))}
        </div>
      </div>

      {/* Import Panel */}
      {showImport && isLeaderOrAbove && <ImportPanel onImportComplete={()=>{ loadRecords(); setShowImport(false); }} />}

      {/* Edit Form */}
      {view==='edit' && editingRecord && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', marginBottom:20, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:2 }}>{editingRecord.id?'Update':'Add'} Auth Record — {editForm.patient_name}</div>
              <div style={{ fontSize:12, color:B.gray }}>
                <span style={{ color:PAYER_COLORS[editForm.payer]||B.gray, fontWeight:700 }}>{editForm.payer}</span> · Region {editForm.region}
                {PAYER_PHONES[editForm.payer]&&<span style={{ marginLeft:12, color:B.lightGray }}>📞 {PAYER_PHONES[editForm.payer]}</span>}
              </div>
            </div>
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:B.gray, cursor:'pointer' }}>
                <input type="checkbox" checked={!!editForm.vob_verified} onChange={e=>setField('vob_verified',e.target.checked)} /> VOB Verified
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:B.gray, cursor:'pointer' }}>
                <input type="checkbox" checked={!!editForm.claim_paid} onChange={e=>setField('claim_paid',e.target.checked)} /> Claim Paid
              </label>
            </div>
          </div>

          {/* Auth details */}
          <div style={{ fontSize:12, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Authorization Details</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
            {[
              {label:'Auth Number',key:'auth_number',type:'text',ph:'e.g. 222027872'},
              {label:'Auth Start Date',key:'auth_from',type:'date'},
              {label:'Auth Expiry Date',key:'auth_thru',type:'date'},
            ].map(f=>(
              <div key={f.key}>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{f.label}</label>
                <input type={f.type} value={editForm[f.key]||''} placeholder={f.ph}
                  onChange={e=>setField(f.key,e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
              </div>
            ))}
          </div>

          {/* Visit counts */}
          <div style={{ fontSize:12, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Visit Allowance</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
            {[
              {label:'TX Approved',key:'tx_approved',type:'number'},{label:'TX Used',key:'tx_used',type:'number'},
              {label:'RA Approved',key:'ra_approved',type:'number'},{label:'RA Used',key:'ra_used',type:'number'},
              {label:'Eval Approved',key:'eval_approved',type:'number'},{label:'Eval Used',key:'eval_used',type:'number'},
            ].map(f=>(
              <div key={f.key}>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{f.label}</label>
                <input type="number" value={editForm[f.key]||0} onChange={e=>setField(f.key,parseInt(e.target.value)||0)}
                  style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
              </div>
            ))}
          </div>

          {/* TX remaining visual */}
          {(editForm.tx_approved||0) > 0 && (() => {
            const rem = (editForm.tx_approved||0)-(editForm.tx_used||0);
            const pct = Math.max(0,Math.min(100,rem/(editForm.tx_approved)*100));
            const color = rem<=3?B.danger:rem<=9?B.yellow:B.green;
            return (
              <div style={{ background:B.bg, borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, color:B.gray }}>TX Visits Remaining</span>
                  <span style={{ fontSize:14, fontWeight:800, color, fontFamily:'monospace' }}>{rem} / {editForm.tx_approved}</span>
                </div>
                <div style={{ height:6, background:'rgba(0,0,0,0.08)', borderRadius:3 }}><div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3 }} /></div>
                {rem<=3&&rem>=0&&<div style={{ fontSize:11, color:B.danger, marginTop:4, fontWeight:700 }}>⚠️ Renew now — only {rem} visit{rem!==1?'s':''} remaining</div>}
              </div>
            );
          })()}

          {/* Tracking fields */}
          <div style={{ fontSize:12, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Tracking</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:14 }}>
            {[
              {label:'Auth Status',key:'auth_status',type:'select',opts:['active','pending','approved','denied','expired','renewal_submitted']},
              {label:'Assigned To',key:'assigned_to',type:'select_team'},
              {label:'PCP',key:'pcp',type:'text',ph:'e.g. conviva, centerwell'},
              {label:'Date Submitted',key:'date_submitted',type:'date'},
              {label:'Last Call Date',key:'last_call_date',type:'date'},
              {label:'Next Follow-Up',key:'next_follow_up',type:'date'},
            ].map(f=>(
              <div key={f.key}>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{f.label}</label>
                {f.type==='select'?<select value={editForm[f.key]||''} onChange={e=>setField(f.key,e.target.value)} style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>{f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                :f.type==='select_team'?<select value={editForm[f.key]||''} onChange={e=>setField(f.key,e.target.value)} style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}><option value="">Unassigned</option>{TEAM_MEMBERS.map(n=><option key={n} value={n}>{n}</option>)}</select>
                :<input type={f.type} value={editForm[f.key]||''} placeholder={f.ph} onChange={e=>setField(f.key,e.target.value)} style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />}
              </div>
            ))}
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Last Call Notes</label>
            <textarea value={editForm.last_call_notes||''} onChange={e=>setField('last_call_notes',e.target.value)} placeholder="Who you spoke with, reference number, outcome..." rows={3}
              style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
          </div>
          {editForm.auth_status==='denied'&&<div style={{ marginBottom:14 }}><label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Denial Reason</label><textarea value={editForm.denial_reason||''} onChange={e=>setField('denial_reason',e.target.value)} rows={2} style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} /></div>}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Auth Notes</label>
            <textarea value={editForm.notes||''} onChange={e=>setField('notes',e.target.value)} placeholder="Auth status details, dr's approval, visits left, returning/new patient..." rows={2}
              style={{ width:'100%', padding:'9px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={()=>{setEditingRecord(null);setView('list');}} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'9px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={saveRecord} disabled={saving} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              {saving?'Saving...':'Save Record'}
            </button>
          </div>
        </div>
      )}

      {/* Dashboard */}
      {view==='dashboard' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:20 }}>
            {[
              {label:'No Auth',count:kpis.noAuth,color:B.danger,bg:'#FEF2F2',border:'#FECACA',f:'no_auth'},
              {label:'Critical',count:kpis.critical,color:'#EA580C',bg:'#FFF7ED',border:'#FED7AA',f:'expiring_critical'},
              {label:'Follow-Up Due',count:kpis.followup,color:B.purple,bg:'#F5F3FF',border:'#DDD6FE',f:'followup_due'},
              {label:'Expiring ≤30d',count:kpis.expiring,color:B.yellow,bg:'#FFFBEB',border:'#FDE68A',f:'expiring_soon'},
              {label:'Expired',count:kpis.expired,color:'#6B7280',bg:'#F9FAFB',border:'#E5E7EB',f:'expired'},
              {label:'Active',count:kpis.total,color:B.green,bg:'#F0FDF4',border:'#BBF7D0',f:'all'},
            ].map(m=>(
              <div key={m.label} onClick={()=>{setFilterPriority(m.f==='all'?'all':m.f);if(m.f==='expired')setShowExpired(true);setView('list');}}
                style={{ background:m.bg, border:`1px solid ${m.border}`, borderRadius:12, padding:'12px', textAlign:'center', cursor:'pointer' }}>
                <div style={{ fontSize:26, fontWeight:800, color:m.color, fontFamily:'monospace', lineHeight:1 }}>{m.count}</div>
                <div style={{ fontSize:10, color:m.color, textTransform:'uppercase', letterSpacing:'0.06em', marginTop:4 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Team queue cards */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:12 }}>👥 Team Queues</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {memberMetrics.map(m=>(
                <div key={m.name} style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'16px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:32, height:32, borderRadius:'50%', background:'#FFF5F2', border:`2px solid ${B.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:B.red }}>{m.name.split(' ').map(n=>n[0]).join('')}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{m.name.split(' ')[0]}</div>
                    </div>
                    <button onClick={()=>{setFilterAssignee(m.name);setView('list');}} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>View Queue →</button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
                    {[{label:'Total',value:m.total,color:B.black},{label:'No Auth',value:m.noAuth,color:m.noAuth>0?B.danger:B.green},{label:'Expiring',value:m.expiring,color:m.expiring>0?B.yellow:B.green},{label:'Call Today',value:m.followToday,color:m.followToday>0?B.purple:B.green}].map(s=>(
                      <div key={s.label} style={{ textAlign:'center', padding:'8px 4px', background:B.bg, borderRadius:8 }}>
                        <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
                        <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {m.total===0&&<div style={{ marginTop:8, fontSize:11, color:B.lightGray, fontStyle:'italic' }}>No patients assigned</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Payer breakdown */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:14 }}>🏥 Auth Status by Payer</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
              {payerBreakdown.map(([payer,data])=>{
                const col=PAYER_COLORS[payer]||B.gray;
                const pct=data.total>0?Math.round((data.total-data.noAuth)/data.total*100):0;
                return (
                  <div key={payer} onClick={()=>{setFilterPayer(payer);setView('list');}} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:B.bg, borderRadius:8, cursor:'pointer', border:`1px solid ${B.border}` }}>
                    <div style={{ width:8, height:40, background:col, borderRadius:2, flexShrink:0 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:B.black, marginBottom:4 }}>{payer}</div>
                      <div style={{ height:4, background:'rgba(0,0,0,0.08)', borderRadius:2 }}><div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:2 }} /></div>
                      <div style={{ fontSize:10, color:B.lightGray, marginTop:3 }}>{pct}% have auth · {data.expiring} expiring soon</div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:col, fontFamily:'monospace' }}>{data.total}</div>
                      {data.noAuth>0&&<div style={{ fontSize:10, color:B.danger, fontWeight:700 }}>{data.noAuth} no auth</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Calendar */}
      {view==='calendar' && (
        <>
          {followupQueue.length>0&&(
            <div style={{ background:B.card, border:'1.5px solid #DDD6FE', borderRadius:14, padding:'18px 20px', marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:800, color:B.purple, marginBottom:12 }}>📞 Due Today & Overdue — {followupQueue.length} patients</div>
              {followupQueue.map(r=>{
                const isOverdue=new Date(r.next_follow_up+'T12:00:00')<new Date(new Date().setHours(0,0,0,0));
                return (
                  <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:isOverdue?'#FEF2F2':'#F5F3FF', borderRadius:8, border:`1px solid ${isOverdue?'#FECACA':'#DDD6FE'}`, marginBottom:8 }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{r.patient_name}</div>
                        {isOverdue&&<span style={{ fontSize:10, color:B.danger, fontWeight:700, background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'1px 6px' }}>OVERDUE</span>}
                      </div>
                      <div style={{ fontSize:11, color:B.gray, marginTop:2 }}>
                        <span style={{ color:PAYER_COLORS[r.payer]||B.gray, fontWeight:600 }}>{r.payer}</span> · Region {r.region}
                        {r.assigned_to&&<span style={{ color:B.lightGray, marginLeft:8 }}>→ {r.assigned_to.split(' ')[0]}</span>}
                        {PAYER_PHONES[r.payer]&&<span style={{ color:B.lightGray, marginLeft:8 }}>📞 {PAYER_PHONES[r.payer]}</span>}
                      </div>
                      {r.last_call_notes&&<div style={{ fontSize:11, color:B.lightGray, marginTop:2, fontStyle:'italic' }}>Last note: {r.last_call_notes.slice(0,80)}{r.last_call_notes.length>80?'...':''}</div>}
                    </div>
                    <button onClick={()=>startEdit(r)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'7px 14px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', marginLeft:12 }}>Update</button>
                  </div>
                );
              })}
            </div>
          )}
          {upcomingFollowups.length>0&&(
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'18px 20px', marginBottom:20 }}>
              <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:12 }}>📅 Upcoming This Week — {upcomingFollowups.length} patients</div>
              {upcomingFollowups.map(r=>{
                const daysAway=Math.ceil((new Date(r.next_follow_up+'T12:00:00')-new Date())/86400000);
                return (
                  <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', background:B.bg, borderRadius:8, border:`1px solid ${B.border}`, marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{r.patient_name}</div>
                      <div style={{ fontSize:11, color:B.gray, marginTop:1 }}>
                        <span style={{ color:PAYER_COLORS[r.payer]||B.gray, fontWeight:600 }}>{r.payer}</span> · Region {r.region}
                        {r.assigned_to&&<span style={{ color:B.lightGray, marginLeft:8 }}>→ {r.assigned_to.split(' ')[0]}</span>}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:12, fontWeight:700, color:daysAway<=2?B.orange:B.gray }}>{new Date(r.next_follow_up+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
                        <div style={{ fontSize:10, color:B.lightGray }}>in {daysAway} day{daysAway!==1?'s':''}</div>
                      </div>
                      <button onClick={()=>startEdit(r)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {followupQueue.length===0&&upcomingFollowups.length===0&&<div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:14, padding:'40px', textAlign:'center' }}><div style={{ fontSize:24, marginBottom:8 }}>✅</div><div style={{ fontSize:15, fontWeight:700, color:B.green }}>No follow-ups due this week</div></div>}
        </>
      )}

      {/* Patient List */}
      {view==='list' && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search patient or auth#..."
              style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:200 }} />
            <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Priorities</option>
              {Object.entries(PRIORITY_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filterPayer} onChange={e=>setFilterPayer(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Payers</option>
              <option value="Humana">Humana</option>
              <option value="CarePlus">CarePlus</option>
            </select>
            <select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Regions</option>
              {ALL_REGIONS.map(r=><option key={r} value={r}>Region {r}</option>)}
            </select>
            <select value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)} style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Team Members</option>
              {TEAM_MEMBERS.map(n=><option key={n} value={n}>{n.split(' ')[0]}</option>)}
            </select>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:B.gray, cursor:'pointer', padding:'7px 10px', border:`1px solid ${B.border}`, borderRadius:8, background:showExpired?'#F9FAFB':'transparent' }}>
              <input type="checkbox" checked={showExpired} onChange={e=>setShowExpired(e.target.checked)} /> Show Expired
            </label>
            <button onClick={()=>{setSearch('');setFilterPriority('all');setFilterPayer('all');setFilterRegion('all');setFilterAssignee('all');}} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'7px 10px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Clear</button>
            <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visible.length} patients</span>
          </div>

          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'180px 100px 55px 80px 120px 60px 50px 50px 80px 80px 1fr', padding:'9px 14px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {['Patient','Payer','Rgn','Assigned','Auth #','Expiry','TX App','TX Used','TX Rem','Priority',''].map(h=>(
                <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
              ))}
            </div>
            {visible.slice(0,200).map(r=>{
              const meta=PRIORITY_META[r.priority]||PRIORITY_META.ok;
              const payCol=PAYER_COLORS[r.payer]||B.gray;
              return (
                <div key={r.id} style={{ display:'grid', gridTemplateColumns:'180px 100px 55px 80px 120px 60px 50px 50px 80px 80px 1fr', padding:'8px 14px', borderBottom:'1px solid #FAF4F2', alignItems:'center', background:['expiring_critical','visits_low','no_auth'].includes(r.priority)?'#FFFBEB':r.priority==='followup_due'?'#FFF5F2':'transparent' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.patient_name}</div>
                  <div style={{ fontSize:11, fontWeight:600, color:payCol, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.payer}</div>
                  <div style={{ fontSize:11, color:B.gray }}>{r.region}</div>
                  <div style={{ fontSize:10, color:B.gray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.assigned_to?r.assigned_to.split(' ')[0]:<span style={{ color:B.lightGray, fontStyle:'italic' }}>—</span>}</div>
                  <div style={{ fontSize:11, color:r.auth_number?B.black:B.lightGray, fontFamily:'monospace' }}>{r.auth_number||'—'}</div>
                  <div style={{ fontSize:11, color:r.daysLeft!=null?(r.daysLeft<=7?B.danger:r.daysLeft<=30?B.yellow:B.green):B.lightGray, fontWeight:r.daysLeft!=null&&r.daysLeft<=30?700:400 }}>
                    {r.auth_thru?new Date(r.auth_thru+'T12:00:00').toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'}):'—'}
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:B.black, fontFamily:'monospace' }}>{r.tx_approved||'—'}</div>
                  <div style={{ fontSize:12, color:B.gray, fontFamily:'monospace' }}>{r.tx_used||'—'}</div>
                  <div style={{ fontSize:13, fontWeight:800, color:r.txRemaining<=3?B.danger:r.txRemaining<=9?B.yellow:B.green, fontFamily:'monospace' }}>{r.auth_number?(r.txRemaining>=0?r.txRemaining:'—'):'—'}</div>
                  <div><span style={{ fontSize:9, fontWeight:700, color:meta.color, background:meta.bg, border:`1px solid ${meta.border}`, borderRadius:10, padding:'2px 6px', whiteSpace:'nowrap' }}>{meta.icon} {meta.label}</span></div>
                  <div><button onClick={()=>startEdit(r)} style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:6, color:'#fff', padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Edit</button></div>
                </div>
              );
            })}
            {visible.length===0&&<div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No records match — try adjusting filters or enabling "Show Expired"</div>}
            {visible.length>200&&<div style={{ padding:'12px', textAlign:'center', fontSize:12, color:B.lightGray, borderTop:`1px solid ${B.border}` }}>Showing 200 of {visible.length} — use filters to narrow</div>}
          </div>
        </>
      )}
    </div>
  );
}

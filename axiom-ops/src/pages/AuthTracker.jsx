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
const IMPORT_CONFIGS = [
  { key:'ethel_humana',   label:"Ethel — Humana",               assignTo:'Ethel Camposano', color:'#0066CC', hint:'HUMANA_AUTH_TRACKING.xlsx' },
  { key:'ethel_careplus', label:"Ethel — CarePlus",              assignTo:'Ethel Camposano', color:'#009B77', hint:'CAREPLUS_AUTH_TRACKING.xlsx' },
  { key:'carla',          label:"Carla — Weekly Auth Report",    assignTo:'Carla Smith',     color:'#D94F2B', hint:"Carla_s_Weekly_Auth_Report.xlsx" },
  { key:'carla_multi',    label:"Carla — Multi-Payer (CP/FHCP)", assignTo:'Carla Smith',     color:'#B45309', hint:'CP_SH_FHCP_DE_AUTH_TRACKING_2024.xlsx' },
  { key:'gerilyn',        label:"Gerilyn — Humana/CarePlus",     assignTo:'Gerilyn Bayson',  color:'#7C3AED', hint:'HUMANA_A_G_M_CAREPLUS_G_M-GERILYN.xlsx' },
];

// Insurance code → payer name mapping for Carla's file
const INS_CODE_MAP = {
  'HUG':'Humana','HUM':'Humana','HUMA':'Humana','HUMG':'Humana','HUMM':'Humana',
  'HUB':'Humana','HUV':'Humana','HUN':'Humana','HUT':'Humana','HUI':'Humana',
  'HUJ':'Humana','HUC':'Humana','HUH':'Humana','HUMANA':'Humana',
  'HumA':'Humana','HumG':'Humana','HumV':'Humana','HumM':'Humana','HumN':'Humana',
  'CPA':'CarePlus','CPB':'CarePlus','CPC':'CarePlus','CPG':'CarePlus','CPH':'CarePlus',
  'CPI':'CarePlus','CPJ':'CarePlus','CPM':'CarePlus','CPN':'CarePlus','CPT':'CarePlus',
  'CPV':'CarePlus','CAREPLUS':'CarePlus','CAREP':'CarePlus',
  'ACA':'Aetna','ACB':'Aetna','ACG':'Aetna','ACH':'Aetna','ACJ':'Aetna',
  'ACN':'Aetna','ACT':'Aetna','ACV':'Aetna','AETNA':'Aetna',
  'AMA':'Aetna','AMB':'Aetna','AMG':'Aetna','AMH':'Aetna','AMM':'Aetna','AMN':'Aetna',
  'FHCC':'FL Health Care Plans','FHCG':'FL Health Care Plans','FHCA':'FL Health Care Plans',
  'FHCB':'FL Health Care Plans','FHCH':'FL Health Care Plans','FHCJ':'FL Health Care Plans',
  'FHCP':'FL Health Care Plans',
  'DHA':'Medicare/Devoted','DHG':'Medicare/Devoted','DHV':'Medicare/Devoted','DHB':'Medicare/Devoted',
  'DEVOTED':'Medicare/Devoted',
  'MEDA':'Medicare','MEDB':'Medicare','MEDC':'Medicare','MEDG':'Medicare',
  'MEDH':'Medicare','MEDJ':'Medicare','MEDM':'Medicare','MEDN':'Medicare',
  'MEDT':'Medicare','MEDV':'Medicare','MED':'Medicare','MEDICARE':'Medicare',
  'MedA':'Medicare','MedB':'Medicare','MedG':'Medicare','MedJ':'Medicare','MedM':'Medicare',
  'SV':'Simply','SH':'Simply','SIMPLY':'Simply',
  'HFA':'HealthFirst','HFG':'HealthFirst','HFJ':'HealthFirst','HFB':'HealthFirst',
  'HEALTHFIRST':'HealthFirst',
  'CIG':'Cigna','CIGA':'Cigna','CIGB':'Cigna','CIGG':'Cigna','CIGT':'Cigna',
  'CIGNA':'Cigna','HCIG':'Cigna','CMA':'Cigna',
  'PPA':'Other','PPB':'Other','PPG':'Other',
};

function resolveRegion(code) {
  if (!code) return '';
  const s = String(code).trim();
  // "A - HUMANA" → "A", "G - CAREPLUS" → "G"
  const m = s.match(/^([A-Z0-9\-V]+)\s*[-–]/i);
  if (m) return m[1].trim();
  // Single letter/code
  if (s.length <= 3) return s.toUpperCase();
  return s;
}

function resolveInsCode(code) {
  if (!code) return 'Other';
  const s = String(code).trim();
  // Direct lookup
  if (INS_CODE_MAP[s]) return INS_CODE_MAP[s];
  // Case-insensitive
  const upper = s.toUpperCase();
  const found = Object.entries(INS_CODE_MAP).find(([k]) => k.toUpperCase() === upper);
  if (found) return found[1];
  // Prefix match
  if (upper.startsWith('HU') || upper.startsWith('HUM')) return 'Humana';
  if (upper.startsWith('CP') || upper.startsWith('CAR')) return 'CarePlus';
  if (upper.startsWith('AC') || upper.startsWith('AET')) return 'Aetna';
  if (upper.startsWith('FHC')) return 'FL Health Care Plans';
  if (upper.startsWith('DH') || upper.startsWith('DEV')) return 'Medicare/Devoted';
  if (upper.startsWith('SV') || upper.startsWith('SIM')) return 'Simply';
  if (upper.startsWith('HF') || upper.startsWith('HEALTH')) return 'HealthFirst';
  if (upper.startsWith('CIG')) return 'Cigna';
  if (upper.startsWith('MED')) return 'Medicare';
  return s;
}

function safeISODate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const d = val.toISOString().split('T')[0];
    const [y,m,dy] = d.split('-').map(Number);
    if (m < 1 || m > 12 || dy < 1 || dy > 31) return null;
    return d;
  }
  if (typeof val === 'string') {
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const yr = m[3].length === 2 ? '20'+m[3] : m[3];
      const mo = parseInt(m[1]), dy = parseInt(m[2]);
      if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
      return `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
    }
  }
  return null;
}

function isPatientName(val) {
  if (!val || typeof val !== 'string') return false;
  const v = val.trim();
  if (v.length < 4) return false;
  const skip = ['patient name','careplus','humana','lymphedema','ppo','no-careplus',
    'auth#','auth #','medicare','medicaid','bcbs','aetna','region','note:','sheet',
    'galindo','tab','visit','eval','maintenance','summary','task tracker',
    'auth tracker','auth denied','appeal','new auth'];
  if (skip.some(s => v.toLowerCase().includes(s))) return false;
  return v.includes(',') || (v === v.toUpperCase() && v.includes(' ') && v.length > 5);
}

// ── Parser: Ethel format (region sheets, auth# rows) ──────────
function parseEthelFormat(XLSX, arrayBuffer, payer, assignTo) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type:'array', cellDates:true });
  const patients = [];
  const parseAuthStr = (s) => {
    const r = { raw_auth_string: s?.slice(0,300)||'' };
    if (!s) return r;
    const an = s.match(/[Aa][Uu][Tt][Hh]\s*#?\s*([0-9A-Za-z*]+)/);
    if (an) r.auth_number = an[1].replace(/\*PO$/,'').trim();
    const dr = s.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (dr) { r.auth_from = safeISODate(dr[1]); r.auth_thru = safeISODate(dr[2]); }
    const tx = s.match(/(\d+)\s*(?:TX|MT)\s*\((\d+)-used\)/i);
    if (tx) { r.tx_approved=parseInt(tx[1]); r.tx_used=parseInt(tx[2]); }
    const ra = s.match(/(\d+)\s*RA\s*\((\d+)-used\)/i);
    if (ra) { r.ra_approved=parseInt(ra[1]); r.ra_used=parseInt(ra[2]); }
    const ev = s.match(/(\d+)\s*EVAL\s*\((\d*)-?used\)/i);
    if (ev) { r.eval_approved=parseInt(ev[1]); r.eval_used=ev[2]?parseInt(ev[2]):0; }
    return r;
  };
  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().includes('no-')) continue;
    const regionMatch = sheetName.match(/^([A-Z0-9\-V]+)/);
    const region = regionMatch ? regionMatch[1].replace(/-$/,'') : '?';
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:null });
    let current = null; let authData = {};
    for (const row of rows) {
      const cells = row.filter(c => c !== null && c !== '');
      if (!cells.length) {
        if (current) { patients.push({...current,...authData,payer,region,assigned_to:assignTo}); current=null; authData={}; }
        continue;
      }
      const a = row[0]; const b = row[1];
      if (a === 'Patient Name') continue;
      if (a && typeof a === 'string' && /[Aa][Uu][Tt][Hh]/i.test(a)) { authData=parseAuthStr(a); continue; }
      if (b && typeof b === 'string' && /visit|eval|maintenance/i.test(b)) continue;
      if (isPatientName(a)) {
        if (current) patients.push({...current,...authData,payer,region,assigned_to:assignTo});
        current = { patient_name: a.trim().replace(/-\s*(DISCHARGED|discharged).*/i,'').trim() };
        authData = {};
      }
    }
    if (current) patients.push({...current,...authData,payer,region,assigned_to:assignTo});
  }
  const seen = new Map();
  for (const p of patients) {
    const key = `${p.patient_name?.toLowerCase().trim()}|${payer}`;
    if (!seen.has(key) || (p.auth_number && !seen.get(key).auth_number)) seen.set(key, p);
  }
  return [...seen.values()];
}

// ── Parser: Carla's weekly report ─────────────────────────────
// Two column formats exist across sheets:
// Old (Feb 2-15):  [name, address, disc, ins_code, soc, pcp, status, comments]
// New (Feb 16+):   [name, address, disc, region, ref_source, soc, insurance, status, comments]
function parseCarlaFormat(XLSX, arrayBuffer, assignTo) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type:'array', cellDates:true });
  const allRecords = [];

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:null });
    if (!rows.length) continue;

    const header = (rows[0] || []).map(c => String(c||'').toLowerCase().trim());
    const isNewFmt = header.includes('region') || header.includes('insurance');

    for (const row of rows) {
      if (!row[0] || typeof row[0] !== 'string') continue;
      if (!row[0].includes(',') || row[0].startsWith('Patient Name')) continue;

      let insCode, region, statusVal, notesVal, fullPayerName;

      if (isNewFmt) {
        region = String(row[3]||'').replace(/=right.*$/i,'').trim().toUpperCase();
        if (region.length > 4 || region.includes('=')) region = '';
        insCode = String(row[4]||'').trim();
        fullPayerName = String(row[6]||'').trim().toLowerCase();
        statusVal = String(row[7]||'').trim();
        notesVal = String(row[8]||'').trim();
      } else {
        insCode = String(row[3]||'').trim();
        region = '';
        fullPayerName = '';
        statusVal = String(row[6]||'').trim();
        notesVal = String(row[7]||'').trim();
      }

      let payer = resolveInsCode(insCode);

      // If payer is still short/unknown, try the spelled-out name in col 6
      if ((payer === 'Unknown' || payer.length <= 2) && fullPayerName) {
        if (fullPayerName.includes('humana') || fullPayerName.includes('metro')) payer = 'Humana';
        else if (fullPayerName.includes('careplus')) payer = 'CarePlus';
        else if (fullPayerName.includes('aetna')) payer = 'Aetna';
        else if (fullPayerName.includes('devoted')) payer = 'Medicare/Devoted';
        else if (fullPayerName.includes('cigna')) payer = 'Cigna';
        else if (fullPayerName.includes('fhcp') || fullPayerName.includes('health care')) payer = 'FL Health Care Plans';
        else if (fullPayerName.includes('healthfirst')) payer = 'HealthFirst';
        else if (fullPayerName.includes('simply')) payer = 'Simply';
        else if (fullPayerName.includes('medicare')) payer = 'Medicare';
        else if (fullPayerName.includes('conviva') || fullPayerName.includes('wellmed') || fullPayerName.includes('optum') || fullPayerName.includes('vip')) payer = 'Humana';
      }
      if (payer.length <= 2) payer = 'Unknown';

      // Extract region from ins code suffix if not already set
      if (!region) {
        const rc = insCode.replace(/^[A-Za-z]{2,3}/, '').replace(/[^A-Z0-9]/g, '').toUpperCase();
        if (rc && rc.length <= 3) region = rc;
      }

      allRecords.push({
        patient_name: row[0].trim(),
        payer,
        region: region || '',
        assigned_to: assignTo,
        auth_status: statusVal.toLowerCase().includes('active') ? 'active' : 'pending',
        notes: notesVal || null,
        raw_auth_string: ('Week:' + sheetName + ' Ins:' + insCode + ' Status:' + statusVal + ' ' + notesVal).slice(0,300),
      });
    }
  }

  const seen = new Map();
  for (const r of allRecords) seen.set(r.patient_name.toLowerCase().trim(), r);
  return [...seen.values()];
}

// ── Parser: Gerilyn's format ───────────────────────────────────
function parseGerielynFormat(XLSX, arrayBuffer, assignTo) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type:'array', cellDates:true });
  const patients = new Map();

  // First pass: AUTH TRACKER sheet (primary data)
  if (wb.SheetNames.includes('AUTH TRACKER')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['AUTH TRACKER'], { header:1, defval:null });
    let headerFound = false;
    for (const row of rows) {
      if (row[2] === 'PATIENTS') { headerFound = true; continue; }
      if (!headerFound) continue;
      if (!row[2] || typeof row[2] !== 'string' || !row[2].includes(',')) continue;
      const name = row[2].trim();
      const regionRaw = String(row[1]||'').trim();
      const region = resolveRegion(regionRaw);
      const payerRaw = regionRaw.toLowerCase().includes('careplus') ? 'CarePlus' : 'Humana';
      const eoc = safeISODate(row[6]);
      const soc = safeISODate(row[5]);
      const visitsRem = row[7] ? parseInt(row[7]) : null;
      patients.set(name.toLowerCase(), {
        patient_name: name,
        payer: payerRaw,
        region,
        assigned_to: assignTo,
        auth_thru: eoc,
        auth_from: soc,
        tx_approved: visitsRem != null ? visitsRem + (row[8] ? parseInt(row[8]) : 0) : 0,
        tx_used: visitsRem != null ? Math.max(0, (row[7+1] ? parseInt(row[7+1]) : 0)) : 0,
        notes: String(row[4]||'').trim() || null, // frequency/LOC
        raw_auth_string: `AUTH TRACKER | Region: ${regionRaw} | Freq: ${row[4]||''} | EOC: ${row[6]||''} | Rem: ${row[7]||''}`.slice(0,300),
      });
    }
  }

  // Second pass: TASK TRACKER (adds VOB + MID info)
  if (wb.SheetNames.includes('TASK TRACKER')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['TASK TRACKER'], { header:1, defval:null });
    let headerFound = false;
    for (const row of rows) {
      if (row[1] === 'REGION ') { headerFound = true; continue; }
      if (!headerFound) continue;
      if (!row[2] || typeof row[2] !== 'string' || !row[2].includes(',')) continue;
      const name = row[2].trim();
      const key = name.toLowerCase();
      const regionRaw = String(row[1]||'').trim();
      const region = resolveRegion(regionRaw);
      const payerRaw = regionRaw.toLowerCase().includes('careplus') ? 'CarePlus' : 'Humana';
      const existing = patients.get(key) || { patient_name: name, payer: payerRaw, region, assigned_to: assignTo };
      patients.set(key, {
        ...existing,
        vob_verified: row[0] === true || row[0] === 'TRUE',
        raw_auth_string: (existing.raw_auth_string||'') + ` | MID: ${row[3]||''} | PCP: ${row[6]||''}`.slice(0,300),
      });
    }
  }

  // Third pass: per-payer region sheets (same format as Ethel)
  const regionSheets = wb.SheetNames.filter(s =>
    !['TASK TRACKER','AUTH TRACKER','AUTH DENIED','HUMANA A PATIENT SUMMARY','CAREPLUS G & M PATIENT SUMMARY'].includes(s)
  );
  for (const sheetName of regionSheets) {
    const payer = sheetName.toUpperCase().includes('CAREPLUS') ? 'CarePlus' : 'Humana';
    const regionMatch = sheetName.match(/([A-Z]+)\s*$/i);
    const region = regionMatch ? regionMatch[1].toUpperCase() : '';
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:null });
    let current = null; let authData = {};
    const parseAuthStr = (s) => {
      const r = { raw_auth_string: s?.slice(0,300)||'' };
      if (!s) return r;
      const an = s.match(/[Aa][Uu][Tt][Hh]\s*#?\s*([0-9A-Za-z*]+)/);
      if (an) r.auth_number = an[1].replace(/\*PO$/,'').trim();
      const dr = s.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (dr) { r.auth_from = safeISODate(dr[1]); r.auth_thru = safeISODate(dr[2]); }
      const tx = s.match(/(\d+)\s*(?:TX|MT|Units?)\s*\((\d+)-used\)/i);
      if (tx) { r.tx_approved=parseInt(tx[1]); r.tx_used=parseInt(tx[2]); }
      return r;
    };
    for (const row of rows) {
      if (!row.some(c => c !== null)) {
        if (current) {
          const key = current.patient_name.toLowerCase();
          if (!patients.has(key) || (authData.auth_number && !patients.get(key)?.auth_number)) {
            patients.set(key, {...(patients.get(key)||{}), ...current, ...authData, payer, region, assigned_to: assignTo});
          }
          current=null; authData={};
        }
        continue;
      }
      const a = row[0]; const b = row[1];
      if (a === 'Patient Name') continue;
      if (a && typeof a === 'string' && /[Aa][Uu][Tt][Hh]/i.test(a)) { authData=parseAuthStr(a); continue; }
      if (b && typeof b === 'string' && /visit|eval|maintenance/i.test(b)) continue;
      if (isPatientName(a)) {
        if (current) {
          const key = current.patient_name.toLowerCase();
          if (!patients.has(key)) patients.set(key, {...current,...authData,payer,region,assigned_to:assignTo});
        }
        current = { patient_name: a.trim().replace(/-\s*(DISCHARGED|discharged).*/i,'').trim() };
        authData = {};
      }
    }
  }

  return [...patients.values()];
}

// ── Parser: Uriel's multi-payer format ────────────────────────
function parseUrielFormat(XLSX, arrayBuffer, assignTo) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type:'array', cellDates:true });
  const patients = new Map();

  // Read AUTH PENDING sheet first
  if (wb.SheetNames.includes('AUTH PENDING')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['AUTH PENDING'], { header:1, defval:null });
    let headerFound = false;
    for (const row of rows) {
      if (row[0] === 'Patient Name') { headerFound = true; continue; }
      if (!headerFound) continue;
      if (!row[0] || typeof row[0] !== 'string' || !row[0].includes(',')) continue;
      const name = row[0].trim();
      patients.set(name.toLowerCase(), {
        patient_name: name,
        payer: resolveInsCode(String(row[1]||'')),
        region: String(row[2]||'').trim(),
        assigned_to: assignTo,
        date_submitted: safeISODate(row[5]),
        next_follow_up: safeISODate(row[6]),
        auth_status: 'pending',
        notes: String(row[7]||'').trim() || null,
        raw_auth_string: `AUTH PENDING | ${row[1]||''} | ${row[7]||''}`.slice(0,300),
      });
    }
  }

  // Read all SUMMARY sheets
  const summarySheets = wb.SheetNames.filter(s => s.toUpperCase().includes('SUMMARY'));
  for (const sheetName of summarySheets) {
    const payerFromSheet = sheetName.toUpperCase().includes('CAREPLUS') ? 'CarePlus'
      : sheetName.toUpperCase().includes('FHCP') ? 'FL Health Care Plans'
      : sheetName.toUpperCase().includes('DEVOTED') ? 'Medicare/Devoted'
      : sheetName.toUpperCase().includes('SIMPLY') ? 'Simply'
      : sheetName.toUpperCase().includes('HEALTH') ? 'HealthFirst'
      : sheetName.toUpperCase().includes('CIGNA') ? 'Cigna'
      : 'Medicare';

    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:null });
    let nameIdx=1, statusIdx=5, regionIdx=4, expiryIdx=7;
    let headerFound = false;

    for (const row of rows) {
      // Find header row
      if (!headerFound) {
        const rowStr = row.map(c => String(c||'').toUpperCase());
        if (rowStr.some(c => c.includes('NAME'))) {
          headerFound = true;
          nameIdx = rowStr.findIndex(c => c.includes('NAME'));
          statusIdx = rowStr.findIndex(c => c.includes('STATUS'));
          regionIdx = rowStr.findIndex(c => c.includes('REGION'));
          expiryIdx = rowStr.findIndex(c => c.includes('EXPIRE') || c.includes('AUTH EXP'));
          if (nameIdx < 0) nameIdx = 1;
          continue;
        }
        continue;
      }
      const name = row[nameIdx];
      if (!name || typeof name !== 'string' || !name.includes(',') || name.length < 4) continue;
      const key = name.trim().toLowerCase();
      const existing = patients.get(key) || {};
      patients.set(key, {
        ...existing,
        patient_name: name.trim(),
        payer: payerFromSheet,
        region: regionIdx >= 0 ? String(row[regionIdx]||'').trim() : existing.region || '',
        assigned_to: assignTo,
        auth_thru: expiryIdx >= 0 ? safeISODate(row[expiryIdx]) : existing.auth_thru,
        auth_status: statusIdx >= 0 ? (String(row[statusIdx]||'').toLowerCase().includes('active') ? 'active' : 'pending') : 'active',
        raw_auth_string: `${sheetName} | Status: ${row[statusIdx]||''} | Expiry: ${row[expiryIdx]||''}`.slice(0,300),
      });
    }
  }

  // Also parse per-payer/region sheets (same format as Ethel)
  const detailSheets = wb.SheetNames.filter(s => {
    const su = s.toUpperCase();
    return !su.includes('SUMMARY') && !su.includes('AUTH PENDING') && !su.includes('DENIED')
      && !su.includes('ACTIVE CONVIVA') && !su.includes('MEDICARE REG')
      && !su.includes('NO-') && !su.includes('FENYX');
  });

  for (const sheetName of detailSheets) {
    const su = sheetName.toUpperCase();
    const payer = su.includes('CAREPLUS') ? 'CarePlus'
      : su.includes('FHCP') ? 'FL Health Care Plans'
      : su.includes('DEVOTED') ? 'Medicare/Devoted'
      : su.includes('SIMPLY') ? 'Simply'
      : su.includes('HEALTH') ? 'HealthFirst'
      : su.includes('CIGNA') ? 'Cigna'
      : su.includes('AETNA') ? 'Aetna'
      : 'Other';
    const regionMatch = sheetName.match(/[-–\s]([A-Z])[\s🌹🍓🌺💥🍈🌋🍄☂️🌟]?$/i);
    const region = regionMatch ? regionMatch[1].toUpperCase() : '';
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, defval:null });
    let current = null; let authData = {};
    const parseAuthStr = (s) => {
      const r = { raw_auth_string: s?.slice(0,300)||'' };
      if (!s) return r;
      const an = s.match(/[Aa][Uu][Tt][Hh]\s*#?\s*([0-9A-Za-z*]+)/);
      if (an) r.auth_number = an[1].replace(/\*PO$/,'').trim();
      const dr = s.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (dr) { r.auth_from = safeISODate(dr[1]); r.auth_thru = safeISODate(dr[2]); }
      const tx = s.match(/(\d+)\s*(?:TX|MT|Units?)\s*\((\d+)-used\)/i);
      if (tx) { r.tx_approved=parseInt(tx[1]); r.tx_used=parseInt(tx[2]); }
      const ra = s.match(/(\d+)\s*RA\s*\((\d+)-used\)/i);
      if (ra) { r.ra_approved=parseInt(ra[1]); r.ra_used=parseInt(ra[2]); }
      return r;
    };
    for (const row of rows) {
      if (!row.some(c => c !== null)) {
        if (current) {
          const key = current.patient_name.toLowerCase();
          const ex = patients.get(key);
          if (!ex || (authData.auth_number && !ex.auth_number)) {
            patients.set(key, {...(ex||{}), ...current, ...authData, payer, region, assigned_to: assignTo});
          }
          current=null; authData={};
        }
        continue;
      }
      const a = row[0]; const b = row[1];
      if (a === 'Patient Name') continue;
      if (a && typeof a === 'string' && /[Aa][Uu][Tt][Hh]/i.test(a)) { authData=parseAuthStr(a); continue; }
      if (b && typeof b === 'string' && /visit|eval|maintenance/i.test(b)) continue;
      if (isPatientName(a)) {
        if (current) { const key = current.patient_name.toLowerCase(); if (!patients.has(key)) patients.set(key, {...current,...authData,payer,region,assigned_to:assignTo}); }
        current = { patient_name: a.trim().replace(/-\s*(DISCHARGED|discharged).*/i,'').trim() }; authData = {};
      }
    }
  }

  return [...patients.values()];
}

function ImportPanel({ onImportComplete }) {
  const [files, setFiles] = useState({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const fileRefs = useRef({});

  const loadXLSX = () => new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX); s.onerror = reject;
    document.head.appendChild(s);
  });

  const readFile = f => new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsArrayBuffer(f); });

  const runImport = async () => {
    const selectedFiles = Object.entries(files).filter(([,f]) => f);
    if (!selectedFiles.length) { setError('Please select at least one file.'); return; }
    setImporting(true); setError(''); setProgress('Loading Excel parser...');
    try {
      const XLSX = await loadXLSX();
      let allRecords = [];

      for (const [key, file] of selectedFiles) {
        const cfg = IMPORT_CONFIGS.find(c => c.key === key);
        setProgress(`Parsing ${cfg.label}...`);
        const buf = await readFile(file);
        let records = [];
        if (key === 'ethel_humana') records = parseEthelFormat(XLSX, buf, 'Humana', cfg.assignTo);
        else if (key === 'ethel_careplus') records = parseEthelFormat(XLSX, buf, 'CarePlus', cfg.assignTo);
        else if (key === 'carla') records = parseCarlaFormat(XLSX, buf, cfg.assignTo);
        else if (key === 'carla_multi') records = parseUrielFormat(XLSX, buf, cfg.assignTo);
        else if (key === 'gerilyn') records = parseGerielynFormat(XLSX, buf, cfg.assignTo);
        allRecords = allRecords.concat(records);
        setProgress(`${cfg.label}: ${records.length} records parsed`);
      }

      setProgress(`Clearing previous records for selected staff...`);
      const assignees = [...new Set(selectedFiles.map(([key]) => IMPORT_CONFIGS.find(c=>c.key===key)?.assignTo).filter(Boolean))];
      for (const assignee of assignees) {
        await supabase.from('auth_records').delete().eq('assigned_to', assignee);
      }

      setProgress(`Uploading ${allRecords.length} records to Supabase...`);
      const BATCH = 100;
      let inserted = 0;
      const safeDate = (d) => {
        if (!d) return null;
        const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const [,y,mo,dy] = m;
        if (parseInt(mo)<1||parseInt(mo)>12||parseInt(dy)<1||parseInt(dy)>31) return null;
        try { return isNaN(new Date(d).getTime()) ? null : d; } catch { return null; }
      };
      for (let i = 0; i < allRecords.length; i += BATCH) {
        const batch = allRecords.slice(i, i+BATCH).map(r => ({
          patient_name: r.patient_name||'',
          payer: r.payer||'',
          region: r.region||'',
          assigned_to: r.assigned_to||'',
          auth_number: r.auth_number||null,
          auth_from: safeDate(r.auth_from),
          auth_thru: safeDate(r.auth_thru),
          tx_approved: parseInt(r.tx_approved)||0,
          tx_used: parseInt(r.tx_used)||0,
          ra_approved: parseInt(r.ra_approved)||0,
          ra_used: parseInt(r.ra_used)||0,
          eval_approved: parseInt(r.eval_approved)||0,
          eval_used: parseInt(r.eval_used)||0,
          auth_status: r.auth_status||'active',
          pcp: r.pcp||null,
          date_submitted: safeDate(r.date_submitted),
          next_follow_up: safeDate(r.next_follow_up),
          notes: r.notes||null,
          vob_verified: r.vob_verified||false,
          raw_auth_string: r.raw_auth_string||null,
          updated_at: new Date().toISOString(),
        }));
        const { error: err } = await supabase.from('auth_records').insert(batch);
        if (err) throw new Error(err.message);
        inserted += batch.length;
        setProgress(`Uploading... ${inserted}/${allRecords.length}`);
      }

      const summary = {};
      allRecords.forEach(r => { summary[r.assigned_to] = (summary[r.assigned_to]||0)+1; });
      setDone({ total: allRecords.length, summary });
      setProgress(''); setImporting(false);
      onImportComplete();
    } catch(e) {
      setError('Import failed: ' + e.message);
      setImporting(false); setProgress('');
    }
  };

  return (
    <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'24px', marginBottom:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>📥 Import Auth Tracking Files</div>
      <div style={{ fontSize:12, color:B.gray, marginBottom:20 }}>Upload tracking files for any team member. Select only the files you want to update — unselected members' data is preserved.</div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
        {IMPORT_CONFIGS.map(cfg => {
          const file = files[cfg.key];
          return (
            <div key={cfg.key}
              style={{ border:`2px dashed ${file?cfg.color:B.border}`, borderRadius:12, padding:'16px', textAlign:'center', background:file?`${cfg.color}08`:'#FAFAFA', cursor:'pointer', transition:'all 0.15s' }}
              onClick={() => { if (!fileRefs.current[cfg.key]) fileRefs.current[cfg.key] = document.createElement('input'); const inp = fileRefs.current[cfg.key]; inp.type='file'; inp.accept='.xlsx,.xls'; inp.onchange=e=>{ setFiles(p=>({...p,[cfg.key]:e.target.files[0]})); }; inp.click(); }}>
              <div style={{ fontSize:20, marginBottom:6 }}>{file ? '✅' : '📊'}</div>
              <div style={{ fontSize:12, fontWeight:700, color:file?cfg.color:B.black }}>{cfg.label}</div>
              <div style={{ fontSize:11, color:file?cfg.color:B.lightGray, marginTop:3 }}>{file ? file.name : cfg.hint}</div>
              {file && <div style={{ fontSize:10, color:B.lightGray, marginTop:2 }}>Click to change</div>}
            </div>
          );
        })}
      </div>

      {progress && <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', fontSize:12, color:B.blue, marginBottom:12 }}>⏳ {progress}</div>}
      {error && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:12, color:B.danger, marginBottom:12 }}>❌ {error}</div>}

      {done && (
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'14px 18px', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:B.green, marginBottom:8 }}>✅ Import Complete — {done.total} total records</div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            {Object.entries(done.summary).map(([name, count]) => (
              <div key={name} style={{ fontSize:12, color:B.green }}><span style={{ fontWeight:700 }}>{name.split(' ')[0]}:</span> {count} records</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        <button onClick={runImport} disabled={importing||!Object.values(files).some(Boolean)}
          style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:10, color:'#fff', padding:'11px 24px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:importing||!Object.values(files).some(Boolean)?0.5:1 }}>
          {importing?'Importing...':'📥 Import Selected Files'}
        </button>
        <span style={{ fontSize:11, color:B.lightGray }}>{Object.values(files).filter(Boolean).length} file{Object.values(files).filter(Boolean).length!==1?'s':''} selected</span>
      </div>
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
    if (filterPayer !== 'all') {
      if (filterPayer === 'Unknown') {
        list = list.filter(r => !r.payer || r.payer === 'Unknown' || r.payer.length <= 2);
      } else {
        list = list.filter(r => r.payer === filterPayer);
      }
    }
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
  const KNOWN_PAYERS = new Set(['Humana','CarePlus','Medicare/Devoted','FL Health Care Plans',
    'Aetna','Cigna','HealthFirst','Simply','Medicare','Other','Unknown']);

  const payerBreakdown = useMemo(() => {
    const map = {};
    active.forEach(r => {
      // Normalize payer — single letters are regions, not payers
      const payer = (!r.payer || r.payer.length <= 2 || r.payer === 'Unknown') ? 'Unknown'
        : KNOWN_PAYERS.has(r.payer) ? r.payer
        : r.payer.length > 2 ? r.payer : 'Unknown';
      if (!map[payer]) map[payer] = { total:0, noAuth:0, critical:0, expiring:0 };
      map[payer].total++;
      if (!r.auth_number) map[payer].noAuth++;
      if (['expiring_critical','visits_low'].includes(r.priority)) map[payer].critical++;
      if (r.priority === 'expiring_soon') map[payer].expiring++;
    });
    // Only show known payers + anything with 5+ patients
    return Object.entries(map)
      .filter(([p, d]) => KNOWN_PAYERS.has(p) || d.total >= 5)
      .sort(([,a],[,b]) => b.total - a.total);
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
              {label:'Payer',key:'payer',type:'select_payer'},
              {label:'Assigned To',key:'assigned_to',type:'select_team'},
              {label:'PCP',key:'pcp',type:'text',ph:'e.g. conviva, centerwell'},
              {label:'Date Submitted',key:'date_submitted',type:'date'},
              {label:'Last Call Date',key:'last_call_date',type:'date'},
              {label:'Next Follow-Up',key:'next_follow_up',type:'date'},
            ].map(f=>(
              <div key={f.key}>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>{f.label}</label>
                {f.type==='select'?<select value={editForm[f.key]||''} onChange={e=>setField(f.key,e.target.value)} style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>{f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                :f.type==='select_payer'?<select value={editForm[f.key]||''} onChange={e=>setField(f.key,e.target.value)} style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}><option value="">Select payer...</option>{['Humana','CarePlus','Medicare/Devoted','FL Health Care Plans','Aetna','Cigna','HealthFirst','Simply','Medicare','Other'].map(o=><option key={o} value={o}>{o}</option>)}</select>
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
          {/* KPI Row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:24 }}>
            {[
              { label:'No Auth on File',  count:kpis.noAuth,    color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨', f:'no_auth',           desc:'Active — no auth number' },
              { label:'Critical',         count:kpis.critical,  color:'#EA580C', bg:'#FFF7ED', border:'#FED7AA', icon:'⚠️', f:'expiring_critical',  desc:'Expiring ≤7d or ≤3 visits' },
              { label:'Follow-Up Due',    count:kpis.followup,  color:B.purple,  bg:'#F5F3FF', border:'#DDD6FE', icon:'📞', f:'followup_due',       desc:'Today + overdue' },
              { label:'Expiring ≤30d',    count:kpis.expiring,  color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'🕐', f:'expiring_soon',      desc:'Needs renewal attention' },
              { label:'Expired',          count:kpis.expired,   color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', icon:'⏰', f:'expired',            desc:'Auth past end date' },
              { label:'Active',           count:kpis.total,     color:B.green,   bg:'#F0FDF4', border:'#BBF7D0', icon:'✅', f:'all',                desc:'Total active patients' },
            ].map(m => (
              <div key={m.label} onClick={()=>{ setFilterPriority(m.f==='all'?'all':m.f); if(m.f==='expired') setShowExpired(true); setView('list'); }}
                style={{ background:m.bg, border:`1.5px solid ${m.border}`, borderRadius:14, padding:'16px 14px', textAlign:'center', cursor:'pointer', transition:'transform 0.1s', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:m.color, borderRadius:'14px 14px 0 0' }} />
                <div style={{ fontSize:11, marginBottom:6 }}>{m.icon}</div>
                <div style={{ fontSize:30, fontWeight:800, color:m.color, fontFamily:"'DM Mono',monospace", lineHeight:1, marginBottom:5 }}>{m.count}</div>
                <div style={{ fontSize:11, fontWeight:700, color:m.color, marginBottom:3 }}>{m.label}</div>
                <div style={{ fontSize:10, color:B.lightGray, lineHeight:1.3 }}>{m.desc}</div>
              </div>
            ))}
          </div>

          {/* Team Queues */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:13, fontWeight:700, color:B.black, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
              👥 Team Queues
              <span style={{ fontSize:11, color:B.lightGray, fontWeight:400 }}>Click "View Queue" to filter patient list by team member</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
              {memberMetrics.map(m => {
                const hasIssues = m.critical > 0 || m.followToday > 0;
                return (
                  <div key={m.name} style={{ background:B.card, border:`1.5px solid ${hasIssues?'#FED7AA':B.border}`, borderRadius:16, padding:'18px 20px', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
                    {/* Header */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:36, height:36, borderRadius:'50%', background:'#FFF5F2', border:`2px solid ${B.red}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:B.red, flexShrink:0 }}>{m.name.split(' ').map(n=>n[0]).join('')}</div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:800, color:B.black }}>{m.name.split(' ')[0]} {m.name.split(' ')[1]}</div>
                          <div style={{ fontSize:10, color:B.lightGray }}>Auth Team</div>
                        </div>
                      </div>
                      <button onClick={()=>{ setFilterAssignee(m.name); setView('list'); }} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'5px 12px', fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>View Queue →</button>
                    </div>

                    {/* Stats grid */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                      {[
                        { label:'Total',      value:m.total,      color:B.black,  bg:'#F9FAFB' },
                        { label:'No Auth',    value:m.noAuth,     color:m.noAuth>0?B.danger:B.green,    bg:m.noAuth>0?'#FEF2F2':'#F0FDF4' },
                        { label:'Expiring',   value:m.expiring,   color:m.expiring>0?B.yellow:B.green,  bg:m.expiring>0?'#FFFBEB':'#F0FDF4' },
                        { label:'Call Today', value:m.followToday,color:m.followToday>0?B.purple:B.green,bg:m.followToday>0?'#F5F3FF':'#F0FDF4' },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign:'center', padding:'10px 6px', background:s.bg, borderRadius:10 }}>
                          <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
                          <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em', marginTop:4 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Alert banners */}
                    {m.followToday > 0 && <div style={{ marginTop:10, padding:'6px 10px', background:'#F5F3FF', borderRadius:8, fontSize:11, color:B.purple, fontWeight:700 }}>📞 {m.followToday} follow-up{m.followToday>1?'s':''} due today</div>}
                    {m.critical > 0 && <div style={{ marginTop:6, padding:'6px 10px', background:'#FFF7ED', borderRadius:8, fontSize:11, color:'#EA580C', fontWeight:700 }}>⚠️ {m.critical} critical — expiring or visits low</div>}
                    {m.total === 0 && <div style={{ marginTop:10, fontSize:11, color:B.lightGray, fontStyle:'italic', textAlign:'center' }}>No patients assigned</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payer Breakdown */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'20px 24px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:13, fontWeight:700, color:B.black, marginBottom:16 }}>🏥 Auth Coverage by Payer</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {payerBreakdown.map(([payer, data]) => {
                const col = PAYER_COLORS[payer] || B.gray;
                const covered = data.total - data.noAuth;
                const pct = data.total > 0 ? Math.round(covered / data.total * 100) : 0;
                const urgentColor = data.critical > 0 ? B.danger : data.expiring > 0 ? B.yellow : B.green;
                return (
                  <div key={payer} onClick={()=>{ setFilterPayer(payer); setView('list'); }}
                    style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'#FAFAFA', borderRadius:12, cursor:'pointer', border:`1px solid ${B.border}`, transition:'background 0.1s' }}>
                    {/* Color bar */}
                    <div style={{ width:4, height:44, background:col, borderRadius:2, flexShrink:0 }} />
                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{payer}</div>
                        <div style={{ fontSize:13, fontWeight:800, color:col, fontFamily:"'DM Mono',monospace" }}>{data.total}</div>
                      </div>
                      {/* Progress bar */}
                      <div style={{ height:5, background:'rgba(0,0,0,0.07)', borderRadius:3, marginBottom:5 }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:3 }} />
                      </div>
                      {/* Sub-stats */}
                      <div style={{ display:'flex', gap:12, fontSize:10 }}>
                        <span style={{ color:B.green, fontWeight:600 }}>✓ {covered} with auth</span>
                        {data.noAuth > 0 && <span style={{ color:B.danger, fontWeight:700 }}>⚠ {data.noAuth} no auth</span>}
                        {data.expiring > 0 && <span style={{ color:B.yellow, fontWeight:600 }}>🕐 {data.expiring} expiring</span>}
                        {data.critical > 0 && <span style={{ color:'#EA580C', fontWeight:700 }}>🔴 {data.critical} critical</span>}
                      </div>
                    </div>
                    {/* Coverage % */}
                    <div style={{ textAlign:'center', flexShrink:0, minWidth:44 }}>
                      <div style={{ fontSize:18, fontWeight:800, color:pct>=80?B.green:pct>=50?B.yellow:B.danger, fontFamily:"'DM Mono',monospace" }}>{pct}%</div>
                      <div style={{ fontSize:9, color:B.lightGray }}>covered</div>
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
              <option value="Medicare/Devoted">Medicare/Devoted</option>
              <option value="FL Health Care Plans">FL Health Care Plans</option>
              <option value="Aetna">Aetna</option>
              <option value="Cigna">Cigna</option>
              <option value="HealthFirst">HealthFirst</option>
              <option value="Simply">Simply</option>
              <option value="Unknown">⚠ Unknown Payer</option>
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
                  <div style={{ fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {r.payer === 'Unknown'
                      ? <span style={{ color:B.orange, background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:6, padding:'2px 6px', fontSize:10, fontWeight:700, cursor:'pointer' }} onClick={()=>startEdit(r)}>⚠ Set Payer</span>
                      : <span style={{ color:payCol }}>{r.payer}</span>
                    }
                  </div>
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

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar';
import UserManagement from './UserManagement';
import DirectorDashboard from './DirectorDashboard';
import CoordinatorApp from './CoordinatorApp';
import LiveAlerts from './LiveAlerts';
import PatientCensus from './PatientCensus';
import VisitSchedule from './VisitSchedule';
import ExecutiveReport from './ExecutiveReport';
import ActionList from './ActionList';
import AuthTracker from './AuthTracker';
import SuperAdminPanel from './SuperAdminPanel';
import GlobalSearch from './GlobalSearch';
import CareCoordApp from './CareCoordApp';
import CareCoordDashboard from './CareCoordDashboard';
import AuthTimeline from './AuthTimeline';
import OnHoldRecovery from './OnHoldRecovery';
import DailyReports from './DailyReports';
import RevenueDashboard from './RevenueDashboard';
import GrowthTracker from './GrowthTracker';
import Scorecard from './Scorecard';
import StaffDirectory from './StaffDirectory';
import RegionalBreakdown from './RegionalBreakdown';
import ExpansionTracker from './ExpansionTracker';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', lightGray:'#BBA8A4', gray:'#8B6B64',
  border:'#F0E4E0', bg:'#F6F0EE', card:'#fff',
  green:'#2E7D32', danger:'#DC2626',
};
 
const PAGE_TO_TAB = {
  overview:'overview', trends:'trends', team:'team',
  reports:'reports', executive:'executive',
  recovery:'recovery', data:'data', settings:'⚙️',
};
 
const PAGE_TITLES = {
  overview:'Command Center', alerts:'Live Alerts', census:'Patient Census',
  visits:'Visit Schedule', revenue:'Revenue Dashboard', growth:'Growth Tracker',
  scorecard:'Operations Scorecard', trends:'Visit Trends', staff:'Staff Directory',
  regions:'Regional Breakdown', team:'Team Performance', expansion:'Expansion Tracker',
  reports:'Daily Reports', executive:'Executive Report', recovery:'On-Hold Recovery', data:'Data & Integrations', settings:'Settings',
  users:'User Management', actions:'Director Action List', authtrack:'Authorization Tracker',
  superadmin:'Super Admin Panel',
  authtimeline:'Authorization Timeline',
};
 
const ROLE_VIEWS = [
  { role:'super_admin', label:'My View',        icon:'🔑', color:'#D94F2B' },
  { role:'auth',        label:'Authorization',  icon:'📑', color:'#1565C0' },
  { role:'care_coord',  label:'Care Coord',     icon:'🏥', color:'#059669' },
];
 
function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign:'right', fontFamily:"'DM Mono', monospace" }}>
      <div style={{ fontSize:13, fontWeight:700, color:B.red }}>
        {time.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
      </div>
      <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        {time.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
      </div>
    </div>
  );
}
 
// ── Preview wrappers for Super Admin role switcher ─────────
function AuthTeamPreview() {
  const censusData = (() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} })();
  const hasCensus  = !!(censusData?.counts);
  return <AuthTracker censusData={censusData} hasCensus={hasCensus} />;
}
 
function CareCoordPreview() {
  return <CareCoordDashboard />;
}
 
export default function Dashboard() {
  const { isSuperAdmin } = useAuth();
  const [currentPage, setCurrentPage] = useState('overview');
  const [previewRole, setPreviewRole] = useState(null);
 
  const [csvData]    = useState(() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} });
  const [censusData] = useState(() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} });
  const [settings]   = useState(() => { try { const s=localStorage.getItem('axiom_settings'); return s?JSON.parse(s):null; } catch{return null;} });
 
  const hasPariox = !!(csvData?.scheduledVisits > 0);
  const hasCensus = !!(censusData?.counts);
  const CFG = settings || { visitTarget:800, revenueTarget:200000, avgReimbursement:90, activeCensusTarget:500, authRiskVisitsPerWeek:3 };
 
  const tab   = PAGE_TO_TAB[currentPage] || 'overview';
  const title = previewRole
    ? `👁 Previewing: ${ROLE_VIEWS.find(r=>r.role===previewRole)?.label || previewRole} view`
    : (PAGE_TITLES[currentPage] || 'AxiomHealth');
 
  const exitPreview = () => { setPreviewRole(null); setCurrentPage('overview'); };
 
  const renderContent = () => {
    if (previewRole === 'auth')       return <AuthTeamPreview />;
    if (previewRole === 'care_coord') return <CareCoordPreview />;
    if (currentPage === 'users')      return <UserManagement />;
    if (currentPage === 'alerts')     return <LiveAlerts censusData={censusData} csvData={csvData} hasCensus={hasCensus} hasPariox={hasPariox} CFG={CFG} />;
    if (currentPage === 'census')     return <PatientCensus censusData={censusData} hasCensus={hasCensus} CFG={CFG} />;
    if (currentPage === 'visits')     return <VisitSchedule csvData={csvData} hasPariox={hasPariox} />;
    if (currentPage === 'executive')  return <ExecutiveReport csvData={csvData} censusData={censusData} hasPariox={hasPariox} hasCensus={hasCensus} CFG={CFG} />;
    if (currentPage === 'actions')    return <ActionList censusData={censusData} hasCensus={hasCensus} />;
    if (currentPage === 'authtrack')  return <AuthTracker censusData={censusData} hasCensus={hasCensus} />;
    if (currentPage === 'superadmin') return <SuperAdminPanel />;
    if (currentPage === 'authtimeline') return <AuthTimeline />;
    if (currentPage === 'recovery') return <OnHoldRecovery />;
    if (currentPage === 'reports') return <DailyReports />;
    if (currentPage === 'data')      return <DirectorDashboard key="data"     initialTab="data" />;
    if (currentPage === 'settings')  return <DirectorDashboard key="settings" initialTab="⚙️" />;
    if (currentPage === 'revenue')   return <RevenueDashboard />;
    if (currentPage === 'growth')    return <GrowthTracker />;
    if (currentPage === 'scorecard') return <Scorecard />;
    if (currentPage === 'staff')     return <StaffDirectory />;
    if (currentPage === 'regions')   return <RegionalBreakdown />;
    if (currentPage === 'expansion') return <ExpansionTracker />;
    if (currentPage === 'team')      return <DirectorDashboard key="team"  initialTab="team" />;
    if (currentPage === 'trends')    return <DirectorDashboard key="trends" initialTab="trends" />;
    return <DirectorDashboard key="overview" initialTab="overview" />;
  };
 
  return (
    <div style={{ display:'flex', minHeight:'100vh', background:B.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <Sidebar activePage={previewRole ? '__preview__' : currentPage} onNavigate={(page) => { setPreviewRole(null); setCurrentPage(page); }} />
 
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
 
        {/* Top bar */}
        <div style={{
          background:B.card, borderBottom:`1px solid ${B.border}`, padding:'10px 24px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, zIndex:40, boxShadow:'0 1px 4px rgba(139,26,16,0.06)', gap:12,
        }}>
 
          {/* Left — title */}
          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flexShrink:0 }}>
            {previewRole && (
              <span style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:6,
                color:B.danger, padding:'3px 8px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
                👁 PREVIEW MODE
              </span>
            )}
            <div style={{ fontSize:14, fontWeight:700, color:previewRole?B.danger:B.black,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {title}
            </div>
          </div>
 
          {/* Center — role switcher + global search */}
          <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, justifyContent:'center' }}>
            {isSuperAdmin && (
              <div style={{ display:'flex', gap:3, background:'#F9FAFB', border:'1px solid #E5E7EB',
                borderRadius:10, padding:'3px', flexShrink:0 }}>
                {ROLE_VIEWS.map(r => {
                  const isActive = previewRole === r.role || (!previewRole && r.role === 'super_admin');
                  return (
                    <button key={r.role}
                      onClick={() => r.role === 'super_admin' ? exitPreview() : setPreviewRole(r.role)}
                      style={{
                        padding:'5px 11px', borderRadius:7, border:'none', fontSize:11,
                        fontWeight:isActive?700:500, cursor:'pointer', fontFamily:'inherit',
                        transition:'all 0.15s', whiteSpace:'nowrap',
                        background:isActive?r.color:'transparent',
                        color:isActive?'#fff':B.gray,
                      }}>
                      {r.icon} {r.label}
                    </button>
                  );
                })}
              </div>
            )}
 
            {/* Global patient search */}
            <GlobalSearch />
          </div>
 
          {/* Right — clock + upload */}
          <div style={{ display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
            <Clock />
            {!previewRole && (
              <button onClick={() => setCurrentPage('data')}
                style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none',
                  borderRadius:8, color:'#fff', padding:'7px 14px', fontSize:12, fontWeight:700,
                  cursor:'pointer', fontFamily:'inherit' }}>
                📤 Upload Data
              </button>
            )}
            {previewRole && (
              <button onClick={exitPreview}
                style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8,
                  color:B.gray, padding:'7px 14px', fontSize:12, fontWeight:600,
                  cursor:'pointer', fontFamily:'inherit' }}>
                ✕ Exit Preview
              </button>
            )}
          </div>
        </div>
 
        {/* Page content */}
        <div style={{ flex:1, padding:'24px 28px', overflowY:'auto' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
 

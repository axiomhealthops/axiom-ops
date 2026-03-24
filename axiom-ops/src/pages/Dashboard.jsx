import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar';
import UserManagement from './UserManagement';
import DirectorDashboard from './DirectorDashboard';
import LiveAlerts from './LiveAlerts';
import PatientCensus from './PatientCensus';
import VisitSchedule from './VisitSchedule';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#F6F0EE', card:'#fff',
};

const PAGE_TO_TAB = {
  overview:   'overview',
  revenue:    'revenue',
  growth:     'growth',
  scorecard:  'scorecard',
  trends:     'trends',
  staff:      'staff',
  regions:    'regions',
  team:       'team',
  expansion:  'expansion',
  reports:    'reports',
  executive:  'scorecard',
  recovery:   'recovery',
  auths:      'auths',
  data:       'data',
  settings:   '⚙️',
};

// Pages handled by DirectorDashboard
const DD_PAGES = new Set(Object.keys(PAGE_TO_TAB));

const PAGE_TITLES = {
  overview:'Command Center', alerts:'Live Alerts', census:'Patient Census',
  visits:'Visit Schedule', revenue:'Revenue Dashboard', growth:'Growth Tracker',
  scorecard:'Operations Scorecard', trends:'Visit Trends', staff:'Staff Directory',
  regions:'Regional Breakdown', team:'Team Performance', expansion:'Expansion Tracker',
  reports:'Daily Reports', executive:'Executive Report', recovery:'On-Hold Recovery',
  auths:'Authorization Pipeline', data:'Data & Integrations', settings:'Settings',
  users:'User Management',
};

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

export default function Dashboard() {
  const { isSuperAdmin } = useAuth();
  const [currentPage, setCurrentPage] = useState('overview');

  // Shared data state — loaded once, passed to all pages that need it
  const [csvData, setCsvData]       = useState(() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} });
  const [censusData, setCensusData] = useState(() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} });
  const [settings]                  = useState(() => { try { const s=localStorage.getItem('axiom_settings'); return s?JSON.parse(s):null; } catch{return null;} });

  const hasPariox = !!(csvData && csvData.scheduledVisits > 0);
  const hasCensus = !!(censusData && censusData.counts);
  const CFG = settings || { visitTarget:800, revenueTarget:200000, avgReimbursement:90, activeCensusTarget:500, authRiskVisitsPerWeek:3 };

  const tab = PAGE_TO_TAB[currentPage] || 'overview';
  const title = PAGE_TITLES[currentPage] || 'AxiomHealth';
  const isStandalonePage = ['alerts','census','visits','users'].includes(currentPage);

  const renderContent = () => {
    if (currentPage === 'users' && isSuperAdmin) return <UserManagement />;
    if (currentPage === 'alerts')  return <LiveAlerts  censusData={censusData} csvData={csvData} hasCensus={hasCensus} hasPariox={hasPariox} CFG={CFG} />;
    if (currentPage === 'census')  return <PatientCensus censusData={censusData} hasCensus={hasCensus} CFG={CFG} />;
    if (currentPage === 'visits')  return <VisitSchedule csvData={csvData} hasPariox={hasPariox} />;
    // All other pages → DirectorDashboard with the right tab
    return <DirectorDashboard key={tab} initialTab={tab} />;
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:B.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <Sidebar activePage={currentPage} onNavigate={setCurrentPage} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Top bar */}
        <div style={{ background:B.card, borderBottom:`1px solid ${B.border}`, padding:'12px 28px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, zIndex:40, boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
          <div style={{ fontSize:15, fontWeight:700, color:B.black }}>{title}</div>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <Clock />
            <button onClick={() => setCurrentPage('data')}
              style={{ background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none',
                borderRadius:8, color:'#fff', padding:'7px 14px', fontSize:12, fontWeight:700,
                cursor:'pointer', fontFamily:'inherit' }}>
              📤 Upload Data
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:'24px 28px', overflowY:'auto' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

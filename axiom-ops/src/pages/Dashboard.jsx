import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar';
import UserManagement from './UserManagement';
import DirectorDashboard from './DirectorDashboard';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#F6F0EE', card:'#fff',
};

const PAGE_TO_TAB = {
  overview:   'overview',
  alerts:     'overview',
  census:     'overview',
  visits:     'overview',
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
  const { isSuperAdmin, role } = useAuth();
  const [currentPage, setCurrentPage] = useState('overview');

  const tab = PAGE_TO_TAB[currentPage] || 'overview';
  const title = PAGE_TITLES[currentPage] || 'AxiomHealth';

  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:B.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <Sidebar activePage={currentPage} onNavigate={handleNavigate} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Top bar */}
        <div style={{ background:B.card, borderBottom:`1px solid ${B.border}`, padding:'12px 28px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          position:'sticky', top:0, zIndex:40, boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
          <div style={{ fontSize:15, fontWeight:700, color:B.black }}>{title}</div>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <Clock />
            <button onClick={() => handleNavigate('data')}
              style={{ background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none',
                borderRadius:8, color:'#fff', padding:'7px 14px', fontSize:12, fontWeight:700,
                cursor:'pointer', fontFamily:'inherit' }}>
              📤 Upload Data
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, padding:'24px 28px', overflowY:'auto' }}>
          {currentPage === 'users' && isSuperAdmin
            ? <UserManagement />
            : <DirectorDashboard key={tab} initialTab={tab} />
          }
        </div>
      </div>
    </div>
  );
}

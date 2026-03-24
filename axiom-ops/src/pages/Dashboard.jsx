import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar';
import UserManagement from './UserManagement';
import CoordinatorApp from './CoordinatorApp';

// ── Import all page content from the existing DirectorDashboard
// (we pull the tab content out and use it as standalone page components)
import DirectorDashboard from './DirectorDashboard';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#F6F0EE', card:'#fff',
  green:'#2E7D32', yellow:'#D97706', danger:'#DC2626', blue:'#1565C0',
};

// Page-to-tab mapping for DirectorDashboard
const PAGE_TO_TAB = {
  overview:  'overview',
  census:    'overview',   // census is on overview
  visits:    'overview',   // visits on overview
  revenue:   'revenue',
  growth:    'growth',
  scorecard: 'scorecard',
  trends:    'trends',
  staff:     'staff',
  regions:   'regions',
  team:      'team',
  expansion: 'expansion',
  reports:   'reports',
  executive: 'scorecard',
  recovery:  'recovery',
  auths:     'auths',
  data:      'data',
  settings:  '⚙️',
  alerts:    'overview',
};

export default function Dashboard() {
  const { profile, role, isSuperAdmin, canViewDashboard } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive current page from URL
  const currentPage = location.pathname.replace('/', '') || 'overview';

  // Alert counts for sidebar badges
  const [alertCounts, setAlertCounts] = useState({ critical: 0, onHold: 0, authPending: 0 });

  const handleNavigate = (page) => {
    navigate(`/${page}`);
  };

  // CEO gets a simplified executive view
  if (role === 'ceo') {
    return (
      <div style={{ display:'flex', minHeight:'100vh', background: B.bg, fontFamily:"'DM Sans', sans-serif" }}>
        <Sidebar activePage={currentPage} onNavigate={handleNavigate} alerts={alertCounts} />
        <main style={{ flex:1, padding:'28px 32px', overflowY:'auto' }}>
          <CEOView />
        </main>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background: B.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <Sidebar activePage={currentPage} onNavigate={handleNavigate} alerts={alertCounts} />
      <main style={{ flex:1, overflowY:'auto', minWidth:0 }}>
        {/* Top bar */}
        <div style={{ background: B.card, borderBottom:`1px solid ${B.border}`, padding:'12px 28px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:40, boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
          <div style={{ fontSize:14, fontWeight:700, color:B.black }}>
            {getPageTitle(currentPage)}
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <Clock />
            {(role === 'super_admin' || role === 'director') && (
              <button onClick={() => handleNavigate('data')} style={{ background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                📤 Upload Data
              </button>
            )}
          </div>
        </div>

        {/* Page content */}
        <div style={{ padding:'24px 28px' }}>
          {currentPage === 'users' && isSuperAdmin ? (
            <UserManagement />
          ) : currentPage === 'coordinator-portal' ? (
            <CoordinatorApp adminView />
          ) : (
            /* Render DirectorDashboard with the correct tab pre-selected */
            <DirectorDashboard initialTab={PAGE_TO_TAB[currentPage] || 'overview'} />
          )}
        </div>
      </main>
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign:'right', fontFamily:"'DM Mono', monospace" }}>
      <div style={{ fontSize:13, fontWeight:700, color: B.red }}>{time.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
      <div style={{ fontSize:9, color: B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>{time.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
    </div>
  );
}

function getPageTitle(page) {
  const titles = {
    overview:'Command Center', census:'Patient Census', visits:'Visit Schedule',
    revenue:'Revenue Dashboard', growth:'Growth Tracker', scorecard:'Operations Scorecard',
    trends:'Visit Trends', staff:'Staff Directory', regions:'Regional Breakdown',
    team:'Team Performance', expansion:'Expansion Tracker', reports:'Daily Reports',
    executive:'Executive Report', recovery:'On-Hold Recovery', auths:'Authorization Pipeline',
    data:'Data & Integrations', settings:'Settings', users:'User Management', alerts:'Live Alerts',
  };
  return titles[page] || 'AxiomHealth Operations';
}

function CEOView() {
  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>Executive Dashboard</h1>
        <p style={{ color:B.gray, fontSize:13, margin:0 }}>Read-only operational summary</p>
      </div>
      <DirectorDashboard initialTab="overview" readOnly />
    </div>
  );
}

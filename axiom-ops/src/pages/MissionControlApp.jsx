import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AuthDashboard } from './TeamDashboard';
import CareCoordApp from './CareCoordApp';
import CareCoordDashboard from './CareCoordDashboard';
import CareCoordPatientQueue from './CareCoordPatientQueue';
import CareCoordVisitSchedule from './CareCoordVisitSchedule';
import AuthTracker from './AuthTracker';
import PatientCensus from './PatientCensus';
import VisitSchedule from './VisitSchedule';
import CoordinatorApp from './CoordinatorApp';
import GlobalSearch from './GlobalSearch';
import AuthTimeline from './AuthTimeline';
import OnHoldRecovery from './OnHoldRecovery';
import DailyReports from './DailyReports';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#F6F0EE', card:'#fff',
  bg_dark:'#0F1117', surface_dark:'#161B26',
};
 
const TEAM_META = {
  auth:       { label:'Authorization Team',     color:'#0369A1', icon:'🔒', accent:'#EFF6FF' },
  care_coord: { label:'Care Coordination Team', color:'#059669', icon:'🏥', accent:'#F0FDF4' },
  intake:     { label:'Intake Team',            color:'#7C3AED', icon:'📥', accent:'#F5F3FF' },
};
 
function getAllowedPages(role, team) {
  if (role === 'team_member') {
    const base = ['home', 'census', 'visits'];
    if (team === 'auth')       return [...base, 'authtrack', 'authtimeline', 'submit'];
    if (team === 'care_coord') return ['home', 'patients', 'myvisits', 'recovery', 'reports', 'actions'];
    if (team === 'intake')     return [...base, 'submit'];
    return base;
  }
  if (role === 'team_leader') {
    return ['home', 'census', 'visits', 'authtrack', 'reports', 'actions', 'authtimeline', 'recovery'];
  }
  if (role === 'pod_leader') {
    return ['home', 'census', 'visits', 'authtrack', 'authtimeline', 'recovery', 'patients', 'myvisits', 'reports', 'actions'];
  }
  return [];
}
 
const ALL_PAGES = [
  { id:'home',     label:'Dashboard',        icon:'🏠', section:'Home'       },
  { id:'census',   label:'Patient Census',   icon:'👥', section:'Operations' },
  { id:'visits',   label:'Visit Schedule',   icon:'📅', section:'Operations' },
  { id:'authtrack',label:'Auth Tracker',     icon:'📑', section:'Operations' },
  { id:'actions',  label:'Action List',      icon:'📋', section:'Operations' },
  { id:'reports',    label:'Daily Reports',         icon:'📝', section:'Reports'    },
  { id:'authtimeline',label:'Auth Timeline',           icon:'⏱️', section:'Reports'    },
  { id:'recovery',    label:'On-Hold Recovery',       icon:'⏸️', section:'Operations' },
  { id:'patients',    label:'Patient Queue',           icon:'👥', section:'Operations' },
  { id:'myvisits',    label:'Visit Schedule',          icon:'📅', section:'Operations' },
  { id:'submit',   label:'Submit Report',    icon:'✏️', section:'Reports'    },
];
 
// ── Sidebar ────────────────────────────────────────────────────────────────
function MCsidebar({ activePage, onNavigate, allowedPages, teamMeta, profile, onSignOut }) {
  const visiblePages = ALL_PAGES.filter(p => allowedPages.includes(p.id));
  const sections = [...new Set(visiblePages.map(p => p.section))];
 
  return (
    <div style={{
      width: 220, background: B.bg_dark, display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0, flexShrink: 0,
    }}>
      {/* Logo + team badge */}
      <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 8, letterSpacing: '-0.01em' }}>
          AxiomHealth
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: `${teamMeta.color}25`, border: `1px solid ${teamMeta.color}50`,
          borderRadius: 20, padding: '3px 10px',
        }}>
          <span style={{ fontSize: 12 }}>{teamMeta.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: teamMeta.color }}>{teamMeta.label}</span>
        </div>
      </div>
 
      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        <style>{`.mc-nav-item:hover { background: rgba(217,79,43,0.1) !important; } .mc-nav-item.active { background: rgba(217,79,43,0.15) !important; border-right: 2px solid #D94F2B; }`}</style>
        {sections.map(section => (
          <div key={section} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)',
              textTransform: 'uppercase', letterSpacing: '0.12em', padding: '0 8px', marginBottom: 4 }}>
              {section}
            </div>
            {visiblePages.filter(p => p.section === section).map(page => {
              const isActive = activePage === page.id;
              return (
                <button key={page.id}
                  className={`mc-nav-item${isActive ? ' active' : ''}`}
                  onClick={() => onNavigate(page.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'transparent', fontFamily: 'inherit', textAlign: 'left',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                    fontSize: 13, fontWeight: isActive ? 700 : 400,
                    transition: 'all 0.15s', marginBottom: 2,
                  }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{page.icon}</span>
                  {page.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
 
      {/* User footer */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid rgba(255,255,255,0.07)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: teamMeta.color, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, color: '#fff',
          }}>
            {profile?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.name || 'User'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
              {profile?.role === 'team_leader' ? 'Team Leader' : 'Team Member'}
            </div>
          </div>
        </div>
        <button onClick={onSignOut}
          style={{ width: '100%', background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
            color: 'rgba(255,255,255,0.5)', padding: '7px 12px',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
 
// ── Top bar with global search ─────────────────────────────────────────────
function TopBar({ title, teamMeta }) {
  const [time, setTime] = useState(new Date());
  useState(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  });
 
  return (
    <div style={{
      background: B.card, borderBottom: `1px solid ${B.border}`,
      padding: '10px 24px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40,
      boxShadow: '0 1px 4px rgba(139,26,16,0.06)', gap: 16,
    }}>
      {/* Page title */}
      <div style={{ fontSize: 14, fontWeight: 700, color: B.black, flexShrink: 0 }}>{title}</div>
 
      {/* Global patient search — center */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <GlobalSearch />
      </div>
 
      {/* Clock — right */}
      <div style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: B.red }}>
          {time.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
        </div>
        <div style={{ fontSize: 9, color: B.lightGray, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {time.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
        </div>
      </div>
    </div>
  );
}
 
const PAGE_TITLES = {
  home:     'Dashboard',
  census:   'Patient Census',
  visits:   'Visit Schedule',
  authtrack:'Authorization Tracker',
  authtimeline:'Authorization Timeline',
  recovery:'On-Hold Recovery',
  actions:  'Action List',
  reports:  'Daily Reports',
  submit:   'Submit Report',
};
 
// ── Main ───────────────────────────────────────────────────────────────────
// ── Pod Leader Home ───────────────────────────────────────────
function PodLeaderHome({ onNavigate }) {
  const csvData    = (() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} })();
  const censusData = (() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} })();
 
  const completedVisits = csvData?.completedVisits || 0;
  const scheduledVisits = csvData?.scheduledVisits || 0;
  const missedVisits    = csvData?.missedVisits    || 0;
  const completionRate  = scheduledVisits > 0 ? Math.round(completedVisits/scheduledVisits*100) : 0;
  const activeCensus    = censusData?.activeCensus || 0;
  const onHold          = Object.entries(censusData?.counts||{}).filter(([k])=>k.startsWith('on_hold')).reduce((s,[,v])=>s+v,0);
  const authRisk        = (censusData?.counts?.auth_pending||0) + (censusData?.counts?.active_auth_pending||0);
  const socPending      = censusData?.counts?.soc_pending || 0;
  const evalPending     = censusData?.counts?.eval_pending || 0;
 
  const B2 = { red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A', black:'#1A1A1A', gray:'#6B7280', border:'#E5E7EB', bg:'#F9FAFB', card:'#fff', green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8' };
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B2.black }}>
      <div style={{ background:`linear-gradient(135deg,${B2.darkRed},${B2.red},${B2.orange})`, borderRadius:16, padding:'20px 24px', marginBottom:20, boxShadow:'0 4px 16px rgba(139,26,16,0.2)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:0.05, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
        <div style={{ position:'relative' }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>Mission Control</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:2 }}>Good {new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'}, Hervylie 👋</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)' }}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · Pod Leader Overview</div>
        </div>
      </div>
 
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Active Census',   value:activeCensus,    color:B2.green,  icon:'✅' },
          { label:'Visit Completion',value:`${completionRate}%`, color:completionRate>=85?B2.green:completionRate>=70?B2.yellow:B2.danger, icon:'📅' },
          { label:'Missed Visits',   value:missedVisits,    color:missedVisits>0?B2.danger:B2.green, icon:'❌' },
          { label:'Auth Risk',       value:authRisk,        color:authRisk>0?B2.orange:B2.green, icon:'🔒' },
        ].map(k=>(
          <div key={k.label} style={{ background:B2.card, border:`1.5px solid ${B2.border}`, borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:18, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:B2.gray, marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
 
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
        <div style={{ background:B2.card, border:`1.5px solid ${B2.border}`, borderRadius:14, padding:'18px 20px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>📊 Visit Summary</div>
          {[
            { label:'Scheduled', value:scheduledVisits },
            { label:'Completed', value:completedVisits, color:B2.green },
            { label:'Missed',    value:missedVisits,    color:missedVisits>0?B2.danger:B2.gray },
          ].map(r=>(
            <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #FAF4F2' }}>
              <span style={{ fontSize:12, color:B2.gray }}>{r.label}</span>
              <span style={{ fontSize:13, fontWeight:700, color:r.color||B2.black, fontFamily:'monospace' }}>{r.value}</span>
            </div>
          ))}
        </div>
        <div style={{ background:B2.card, border:`1.5px solid ${B2.border}`, borderRadius:14, padding:'18px 20px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:12 }}>👥 Census Status</div>
          {[
            { label:'Active',      value:activeCensus, color:B2.green },
            { label:'On Hold',     value:onHold,       color:B2.gray  },
            { label:'SOC Pending', value:socPending,   color:B2.blue  },
            { label:'Eval Pending',value:evalPending,  color:B2.blue  },
          ].map(r=>(
            <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #FAF4F2' }}>
              <span style={{ fontSize:12, color:B2.gray }}>{r.label}</span>
              <span style={{ fontSize:13, fontWeight:700, color:r.color, fontFamily:'monospace' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
 
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
        {[
          { label:'📅 Visit Schedule', page:'visits'   },
          { label:'📑 Auth Tracker',   page:'authtrack' },
          { label:'👥 Patient Census', page:'census'    },
          { label:'⏸️ On-Hold Recovery',page:'recovery' },
          { label:'📝 Daily Reports',  page:'reports'   },
          { label:'📋 Action List',    page:'actions'   },
        ].map(b=>(
          <button key={b.page} onClick={()=>onNavigate(b.page)}
            style={{ background:B2.card, border:`1.5px solid ${B2.border}`, borderRadius:10, padding:'12px', fontSize:13, fontWeight:600, color:B2.black, cursor:'pointer', fontFamily:'inherit', textAlign:'center' }}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
 
export default function MissionControlApp() {
  const { profile, role, team, signOut } = useAuth();
  const teamMeta = TEAM_META[team] || TEAM_META.auth;
  const allowedPages = getAllowedPages(role, team);
  const [currentPage, setCurrentPage] = useState('home');
 
  if (!team) {
    return (
      <div style={{ minHeight: '100vh', background: B.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: B.black, marginBottom: 8 }}>No Team Assigned</div>
          <div style={{ fontSize: 13, color: B.gray, marginBottom: 20 }}>
            Your account hasn't been assigned to a team yet.<br />Please contact your administrator.
          </div>
          <button onClick={signOut} style={{ background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`,
            border: 'none', borderRadius: 8, color: '#fff', padding: '10px 20px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }
 
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        if (role === 'pod_leader') return <PodLeaderHome onNavigate={setCurrentPage} />;
        if (team === 'auth')       return <AuthDashboard />;
        if (team === 'care_coord') return <CareCoordDashboard onNavigate={setCurrentPage} />;
        return <AuthDashboard />;
      case 'census':    return <PatientCensus />;
      case 'visits':    return <VisitSchedule />;
      case 'authtrack': return <AuthTracker />;
      case 'submit':    return <CoordinatorApp previewMode={false} />;
      case 'reports':   return <DailyReports />;
      case 'authtimeline': return <AuthTimeline />;
      case 'recovery':  return <OnHoldRecovery />;
      case 'patients':  return <CareCoordPatientQueue />;
      case 'myvisits':  return <CareCoordVisitSchedule />;
      case 'actions':  return <ActionList />;
      default:
        return null;
    }
  };
 
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: B.bg,
      fontFamily: "'DM Sans', sans-serif" }}>
      <MCsidebar
        activePage={currentPage}
        onNavigate={setCurrentPage}
        allowedPages={allowedPages}
        teamMeta={teamMeta}
        profile={profile}
        onSignOut={signOut}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar title={PAGE_TITLES[currentPage] || currentPage} teamMeta={teamMeta} />
        <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
 

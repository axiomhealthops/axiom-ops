import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  bg:'#0F1117', surface:'#161B26', border:'rgba(255,255,255,0.07)',
  text:'#F0EDE9', muted:'rgba(255,255,255,0.45)', accent:'#D94F2B',
  green:'#22C55E', yellow:'#F59E0B',
};

const NAV = [
  {
    section: 'Command Center',
    icon: '⚡',
    items: [
      { id: 'overview',    label: 'Overview',      icon: '🏠', roles: ['super_admin','ceo','director','regional_mgr','admin'] },
      { id: 'alerts',      label: 'Live Alerts',   icon: '🔔', roles: ['super_admin','director','regional_mgr'], badge: 'alerts' },
    ],
  },
  {
    section: 'Operations',
    icon: '🏥',
    items: [
      { id: 'census',      label: 'Patient Census',    icon: '👥', roles: ['super_admin','ceo','director','regional_mgr'] },
      { id: 'visits',      label: 'Visit Schedule',    icon: '📅', roles: ['super_admin','ceo','director','regional_mgr'] },
      { id: 'recovery',    label: 'On-Hold Recovery',  icon: '⏸️', roles: ['super_admin','director','regional_mgr'], badge: 'onhold' },
      { id: 'auths',       label: 'Authorizations',    icon: '🔒', roles: ['super_admin','director','regional_mgr'], badge: 'auths' },
    ],
  },
  {
    section: 'Performance',
    icon: '📊',
    items: [
      { id: 'revenue',     label: 'Revenue',           icon: '💰', roles: ['super_admin','ceo','director'] },
      { id: 'growth',      label: 'Growth Tracker',    icon: '📈', roles: ['super_admin','ceo','director'] },
      { id: 'scorecard',   label: 'Scorecard',         icon: '🎯', roles: ['super_admin','ceo','director','regional_mgr'] },
      { id: 'trends',      label: 'Trends',            icon: '〰️', roles: ['super_admin','director','regional_mgr'] },
    ],
  },
  {
    section: 'People',
    icon: '👤',
    items: [
      { id: 'staff',       label: 'Staff Directory',   icon: '🏷️', roles: ['super_admin','director','regional_mgr'] },
      { id: 'regions',     label: 'Regions',           icon: '🗺️', roles: ['super_admin','director','regional_mgr'] },
      { id: 'team',        label: 'Team',              icon: '🤝', roles: ['super_admin','director','regional_mgr'] },
    ],
  },
  {
    section: 'Planning',
    icon: '🚀',
    items: [
      { id: 'expansion',   label: 'Expansion',         icon: '🌎', roles: ['super_admin','ceo','director'] },
    ],
  },
  {
    section: 'Reports',
    icon: '📋',
    items: [
      { id: 'reports',     label: 'Daily Reports',     icon: '📝', roles: ['super_admin','director','regional_mgr'] },
      { id: 'executive',   label: 'Executive Report',  icon: '📊', roles: ['super_admin','ceo','director'] },
    ],
  },
  {
    section: 'Admin',
    icon: '⚙️',
    adminOnly: true,
    items: [
      { id: 'users',       label: 'User Management',   icon: '👤', roles: ['super_admin'] },
      { id: 'data',        label: 'Data Uploads',      icon: '📤', roles: ['super_admin','director'] },
      { id: 'settings',    label: 'Settings',          icon: '⚙️', roles: ['super_admin','director'] },
    ],
  },
];

export default function Sidebar({ activePage, onNavigate, alerts = {} }) {
  const { profile, role, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = (section) => {
    setCollapsedSections(p => ({ ...p, [section]: !p[section] }));
  };

  const getRoleBadge = (r) => {
    const map = {
      super_admin: { label: 'Super Admin', color: '#D94F2B' },
      ceo:         { label: 'CEO',         color: '#7C3AED' },
      director:    { label: 'Director',    color: '#1565C0' },
      regional_mgr:{ label: 'Reg. Manager',color: '#059669' },
      coordinator: { label: 'Coordinator', color: '#D97706' },
      admin:       { label: 'Admin',       color: '#6B7280' },
    };
    return map[r] || { label: r, color: '#6B7280' };
  };

  const roleBadge = getRoleBadge(role);

  // Filter nav items by role
  const visibleNav = NAV.map(section => ({
    ...section,
    items: section.items.filter(item => item.roles.includes(role))
  })).filter(section => section.items.length > 0);

  const getBadgeCount = (badgeKey) => {
    if (badgeKey === 'alerts') return alerts.critical || 0;
    if (badgeKey === 'onhold') return alerts.onHold || 0;
    if (badgeKey === 'auths') return alerts.authPending || 0;
    return 0;
  };

  return (
    <div style={{
      width: collapsed ? 64 : 240,
      minHeight: '100vh',
      background: B.bg,
      borderRight: `1px solid ${B.border}`,
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.25s ease',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@500;700&display=swap');
        .nav-item:hover { background: rgba(217,79,43,0.1) !important; }
        .nav-item.active { background: rgba(217,79,43,0.15) !important; border-right: 2px solid #D94F2B; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      {/* Logo + collapse */}
      <div style={{ padding: '16px 14px', borderBottom: `1px solid ${B.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="" style={{ height: 28, objectFit: 'contain' }} onError={e => { e.target.style.display='none'; }} />
            <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: B.text, letterSpacing: '-0.02em' }}>AxiomHealth</div>
              <div style={{ fontSize: 9, color: B.muted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Operations</div>
            </div>
          </div>
        )}
        <button onClick={() => setCollapsed(p => !p)} style={{
          background: 'none', border: `1px solid ${B.border}`, borderRadius: 6,
          color: B.muted, cursor: 'pointer', padding: '4px 7px', fontSize: 12,
          marginLeft: collapsed ? 'auto' : 0,
        }}>{collapsed ? '→' : '←'}</button>
      </div>

      {/* User pill */}
      {!collapsed && (
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${B.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${roleBadge.color}25`, border: `1.5px solid ${roleBadge.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: roleBadge.color, flexShrink: 0, fontFamily: "'DM Sans', sans-serif" }}>
              {(profile?.name || 'U')[0]}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: B.text, fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.name || 'User'}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: roleBadge.color, fontFamily: "'DM Sans', sans-serif" }}>{roleBadge.label}</div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '8px 0', fontFamily: "'DM Sans', sans-serif" }}>
        {visibleNav.map(section => (
          <div key={section.section} style={{ marginBottom: 4 }}>
            {/* Section header */}
            {!collapsed && (
              <button onClick={() => toggleSection(section.section)} style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: B.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  {section.icon} {section.section}
                </span>
                <span style={{ color: B.muted, fontSize: 10 }}>{collapsedSections[section.section] ? '▶' : '▾'}</span>
              </button>
            )}

            {/* Items */}
            {!collapsedSections[section.section] && section.items.map(item => {
              const isActive = activePage === item.id;
              const badgeCount = item.badge ? getBadgeCount(item.badge) : 0;
              return (
                <button key={item.id}
                  className={`nav-item${isActive ? ' active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                  style={{
                    width: '100%', background: 'none', border: 'none', borderRight: '2px solid transparent',
                    cursor: 'pointer', padding: collapsed ? '10px 0' : '8px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 400, color: isActive ? B.text : B.muted, flex: 1, textAlign: 'left' }}>
                        {item.label}
                      </span>
                      {badgeCount > 0 && (
                        <span style={{ background: B.red, color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                          {badgeCount}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom — sign out */}
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${B.border}`, flexShrink: 0 }}>
        <button onClick={signOut} style={{
          width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${B.border}`,
          borderRadius: 8, color: B.muted, padding: '8px', fontSize: 12, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start', gap: 8,
        }}>
          <span>🚪</span>
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );
}


import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import CoordinatorApp from './CoordinatorApp';
import DirectorDashboard from './DirectorDashboard';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#F6F0EE', card:'#fff',
  green:'#2E7D32', danger:'#DC2626', blue:'#1565C0',
  purple:'#7C3AED', teal:'#059669', amber:'#D97706',
};

const ROLE_META = {
  super_admin:  { label: 'Super Admin',   color: B.red,    icon: '🔑' },
  ceo:          { label: 'CEO',           color: B.purple, icon: '👔' },
  director:     { label: 'Director',      color: B.blue,   icon: '📊' },
  regional_mgr: { label: 'Regional Mgr', color: B.teal,   icon: '🗺️' },
  coordinator:  { label: 'Coordinator',  color: B.amber,  icon: '📋' },
  admin:        { label: 'Admin',         color: B.gray,   icon: '⚙️' },
};

// ─── Renders the correct dashboard shell for any given profile ───────────────
function ImpersonatedView({ targetProfile, onExit }) {
  const role = targetProfile?.role || 'coordinator';

  const renderDashboard = () => {
    switch (role) {
      case 'coordinator':
        return <CoordinatorApp previewMode impersonatedProfile={targetProfile} />;
      case 'regional_mgr':
        return <DirectorDashboard key="regional" initialTab="regions" impersonatedProfile={targetProfile} />;
      case 'director':
      case 'admin':
      case 'super_admin':
      case 'ceo':
      default:
        return <DirectorDashboard key="director" initialTab="overview" impersonatedProfile={targetProfile} />;
    }
  };

  const meta = ROLE_META[role] || ROLE_META.coordinator;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Impersonation banner */}
      <div style={{
        background: `linear-gradient(135deg, ${B.darkRed}, ${B.red})`,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(139,26,16,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: 'rgba(255,255,255,0.15)', borderRadius: 6,
            padding: '3px 10px', fontSize: 11, fontWeight: 800,
            color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            👁 IMPERSONATING
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: meta.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {targetProfile?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {targetProfile?.name || 'Unknown User'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                {meta.icon} {meta.label}
                {targetProfile?.region ? ` · Region ${targetProfile.region}` : ''}
                {targetProfile?.email ? ` · ${targetProfile.email}` : ''}
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={onExit}
          style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8, color: '#fff', padding: '7px 16px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.25)'}
          onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.15)'}
        >
          ✕ Exit Impersonation
        </button>
      </div>

      {/* Rendered dashboard */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {renderDashboard()}
      </div>
    </div>
  );
}

// ─── User card ────────────────────────────────────────────────────────────────
function UserCard({ user, onImpersonate }) {
  const meta = ROLE_META[user.role] || ROLE_META.coordinator;
  const isActive = user.status !== 'inactive';

  return (
    <div style={{
      background: B.card, borderRadius: 12,
      border: `1px solid ${B.border}`,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      transition: 'box-shadow 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(217,79,43,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: isActive ? meta.color : B.lightGray,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0,
      }}>
        {user.name?.[0]?.toUpperCase() || '?'}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: B.black }}>
            {user.name}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
            background: `${meta.color}18`, color: meta.color,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {meta.icon} {meta.label}
          </span>
          {user.region && (
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 20,
              background: '#F3F4F6', color: B.gray, fontWeight: 600,
            }}>
              Region {user.region}
            </span>
          )}
          {!isActive && (
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 20,
              background: '#FEE2E2', color: B.danger, fontWeight: 700,
            }}>
              INACTIVE
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: B.gray, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.email || 'No email on file'}
        </div>
      </div>

      {/* Impersonate button */}
      <button
        onClick={() => onImpersonate(user)}
        style={{
          background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`,
          border: 'none', borderRadius: 8,
          color: '#fff', padding: '8px 14px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', flexShrink: 0,
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => e.target.style.opacity = '0.85'}
        onMouseLeave={e => e.target.style.opacity = '1'}
      >
        👁 View As
      </button>
    </div>
  );
}

// ─── Role preview card ────────────────────────────────────────────────────────
function RolePreviewCard({ meta, roleKey, onPreview }) {
  return (
    <button
      onClick={() => onPreview(roleKey)}
      style={{
        background: B.card, border: `1.5px solid ${B.border}`,
        borderRadius: 12, padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer', textAlign: 'left', width: '100%',
        fontFamily: 'inherit', transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = meta.color;
        e.currentTarget.style.boxShadow = `0 4px 16px ${meta.color}20`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = B.border;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: `${meta.color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>
        {meta.icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: B.black }}>{meta.label}</div>
        <div style={{ fontSize: 12, color: B.gray, marginTop: 2 }}>
          Preview {meta.label.toLowerCase()} dashboard layout
        </div>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 16, color: B.lightGray }}>→</div>
    </button>
  );
}

// ─── Role preview wrapper (uses synthetic profile) ────────────────────────────
function RolePreviewView({ roleKey, onExit }) {
  const syntheticProfile = { role: roleKey, name: `${ROLE_META[roleKey]?.label} Preview`, region: null };
  return <ImpersonatedView targetProfile={syntheticProfile} onExit={onExit} />;
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function SuperAdminPanel() {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterRole, setFilterRole]     = useState('all');
  const [impersonating, setImpersonating] = useState(null); // profile object
  const [previewRole, setPreviewRole]   = useState(null);   // role string
  const [activeTab, setActiveTab]       = useState('users'); // 'users' | 'roles'

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    const { data } = await supabase
      .from('coordinators')
      .select('*')
      .order('name');
    setUsers(data || []);
    setLoading(false);
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 300, color: B.danger, fontSize: 14, fontWeight: 600 }}>
        🔒 Super Admin access required
      </div>
    );
  }

  // ── Impersonating a specific user ──────────────────────────────────────────
  if (impersonating) {
    return <ImpersonatedView targetProfile={impersonating} onExit={() => setImpersonating(null)} />;
  }

  // ── Previewing a role ──────────────────────────────────────────────────────
  if (previewRole) {
    return <RolePreviewView roleKey={previewRole} onExit={() => setPreviewRole(null)} />;
  }

  // ── Panel UI ───────────────────────────────────────────────────────────────
  const filtered = users
    .filter(u => filterRole === 'all' || u.role === filterRole)
    .filter(u => !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    );

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: B.black }}>
          🔑 Super Admin Panel
        </div>
        <div style={{ fontSize: 13, color: B.gray, marginTop: 4 }}>
          Impersonate any user account or preview any role's dashboard
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {Object.entries(roleCounts).map(([role, count]) => {
          const meta = ROLE_META[role] || { label: role, color: B.gray, icon: '👤' };
          return (
            <div key={role} style={{
              background: B.card, borderRadius: 10, border: `1px solid ${B.border}`,
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${meta.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}>
                {meta.icon}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: B.black }}>{count}</div>
                <div style={{ fontSize: 11, color: B.gray }}>{meta.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${B.border}`, paddingBottom: 0 }}>
        {[
          { key: 'users', label: '👤 User Impersonation', count: users.length },
          { key: 'roles', label: '🎭 Role Previews', count: Object.keys(ROLE_META).length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', padding: '10px 18px',
              fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? B.red : B.gray,
              borderBottom: activeTab === tab.key ? `2px solid ${B.red}` : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: 8, fontSize: 10, fontWeight: 700,
              background: activeTab === tab.key ? `${B.red}18` : '#F3F4F6',
              color: activeTab === tab.key ? B.red : B.gray,
              padding: '1px 7px', borderRadius: 20,
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── USER IMPERSONATION TAB ── */}
      {activeTab === 'users' && (
        <div>
          {/* Search + filter */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              style={{
                flex: 1, minWidth: 200,
                padding: '9px 14px', borderRadius: 8,
                border: `1px solid ${B.border}`, fontSize: 13,
                fontFamily: 'inherit', outline: 'none',
                background: B.card, color: B.black,
              }}
            />
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              style={{
                padding: '9px 14px', borderRadius: 8,
                border: `1px solid ${B.border}`, fontSize: 13,
                fontFamily: 'inherit', background: B.card,
                color: B.black, cursor: 'pointer',
              }}
            >
              <option value="all">All Roles</option>
              {Object.entries(ROLE_META).map(([key, m]) => (
                <option key={key} value={key}>{m.icon} {m.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: B.gray, fontSize: 13 }}>
              Loading users…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: B.lightGray, fontSize: 13 }}>
              No users match your search
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(user => (
                <UserCard
                  key={user.id}
                  user={user}
                  onImpersonate={setImpersonating}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ROLE PREVIEWS TAB ── */}
      {activeTab === 'roles' && (
        <div>
          <div style={{ fontSize: 13, color: B.gray, marginBottom: 16 }}>
            Preview how each role's dashboard looks — uses a synthetic profile, not a real user account.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(ROLE_META)
              .filter(([key]) => key !== 'super_admin') // no point previewing your own role
              .map(([key, meta]) => (
                <RolePreviewCard
                  key={key}
                  roleKey={key}
                  meta={meta}
                  onPreview={setPreviewRole}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

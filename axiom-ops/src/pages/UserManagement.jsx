import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#FBF7F6', card:'#fff',
  green:'#2E7D32', danger:'#DC2626', blue:'#1565C0',
  amber:'#B45309',
};

const ROLES = [
  { value:'super_admin',  label:'Super Admin',  color:'#D94F2B', group:'platform',       desc:'Full platform access + user management' },
  { value:'ceo',          label:'CEO',          color:'#7C3AED', group:'platform',       desc:'Executive read-only dashboard' },
  { value:'director',     label:'Director',     color:'#1565C0', group:'platform',       desc:'Full operations dashboard' },
  { value:'regional_mgr', label:'Regional Mgr', color:'#059669', group:'platform',       desc:'Regional view + team management' },
  { value:'admin',        label:'Admin',        color:'#6B7280', group:'platform',       desc:'Limited dashboard access' },
  { value:'pod_leader',   label:'Pod Leader',   color:'#B45309', group:'mission_control',desc:'Oversees Auth, Care Coord & Intake teams' },
  { value:'team_leader',  label:'Team Leader',  color:'#0369A1', group:'mission_control',desc:'Leads a team — sees reports, auth tracker, census, schedule' },
  { value:'team_member',  label:'Team Member',  color:'#6B7280', group:'mission_control',desc:'Submit reports, read-only census/schedule/auth' },
  { value:'coordinator',  label:'Coordinator',  color:'#D97706', group:'legacy',         desc:'Legacy — daily report submission' },
];

const TEAMS = [
  { value:'auth',       label:'Authorization Team',     color:'#0369A1', icon:'🔒' },
  { value:'care_coord', label:'Care Coordination Team', color:'#059669', icon:'🏥' },
  { value:'intake',     label:'Intake Team',            color:'#7C3AED', icon:'📥' },
];

const REGIONS = ['A','B','C','G','H','J','M','N','T','V'];
const EMPTY_FORM = { name:'', email:'', password:'', role:'team_member', team:'', region:'', phone:'', notes:'' };

// ─── Org Chart ─────────────────────────────────────────────────────────────
function OrgChart({ users }) {
  const podLeader    = users.find(u => u.role === 'pod_leader');
  const authLeader   = users.find(u => u.role === 'team_leader' && u.team === 'auth');
  const ccLeader     = users.find(u => u.role === 'team_leader' && u.team === 'care_coord');
  const authMembers  = users.filter(u => u.role === 'team_member' && u.team === 'auth');
  const ccMembers    = users.filter(u => u.role === 'team_member' && u.team === 'care_coord');
  const intakeMembers= users.filter(u => u.role === 'team_member' && u.team === 'intake');

  const Avatar = ({ name, color, size = 28 }) => (
    <div style={{ width:size, height:size, borderRadius:'50%', background:color, flexShrink:0,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize: size * 0.4, fontWeight:800, color:'#fff' }}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );

  const MemberPill = ({ user }) => (
    <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:8,
      padding:'7px 12px', display:'flex', alignItems:'center', gap:8 }}>
      <Avatar name={user.name} color={B.gray} size={26} />
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:B.black }}>{user.name}</div>
        {user.email && <div style={{ fontSize:10, color:B.lightGray }}>{user.email}</div>}
      </div>
    </div>
  );

  const TeamCol = ({ title, color, icon, leader, members, noLeaderNote }) => (
    <div style={{ flex:1, background:`${color}08`, border:`1.5px solid ${color}30`,
      borderRadius:12, padding:16, minWidth:0 }}>
      <div style={{ fontSize:12, fontWeight:800, color, marginBottom:12,
        textTransform:'uppercase', letterSpacing:'0.06em' }}>
        {icon} {title}
      </div>
      <div style={{ fontSize:10, color:B.lightGray, fontWeight:700, textTransform:'uppercase',
        letterSpacing:'0.08em', marginBottom:6 }}>Team Leader</div>
      {leader ? (
        <div style={{ background:`${color}15`, border:`1.5px solid ${color}40`,
          borderRadius:8, padding:'8px 12px', display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Avatar name={leader.name} color={color} size={30} />
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:B.black }}>{leader.name}</div>
            {leader.email && <div style={{ fontSize:10, color:B.lightGray }}>{leader.email}</div>}
          </div>
        </div>
      ) : (
        <div style={{ background:'#F9FAFB', border:`1.5px dashed ${B.border}`, borderRadius:8,
          padding:'8px 12px', fontSize:12, color:B.lightGray, fontStyle:'italic',
          textAlign:'center', marginBottom:12 }}>
          {noLeaderNote || 'No leader assigned'}
        </div>
      )}
      <div style={{ fontSize:10, color:B.lightGray, fontWeight:700, textTransform:'uppercase',
        letterSpacing:'0.08em', marginBottom:6 }}>Members ({members.length})</div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {members.length === 0
          ? <div style={{ fontSize:12, color:B.lightGray, fontStyle:'italic', textAlign:'center', padding:'6px 0' }}>No members yet</div>
          : members.map(m => <MemberPill key={m.id} user={m} />)
        }
      </div>
    </div>
  );

  return (
    <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16,
      padding:24, marginBottom:24, boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
      <div style={{ fontSize:14, fontWeight:800, color:B.black, marginBottom:20 }}>
        🏢 Mission Control — Org Structure
      </div>
      {/* Pod Leader */}
      <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
        {podLeader ? (
          <div style={{ background:`${B.amber}15`, border:`2px solid ${B.amber}`,
            borderRadius:12, padding:'12px 28px', display:'flex', alignItems:'center', gap:12, minWidth:260 }}>
            <div style={{ width:44, height:44, borderRadius:'50%', background:B.amber, flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:20, fontWeight:800, color:'#fff' }}>
              {podLeader.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:800, color:B.black }}>{podLeader.name}</div>
              <div style={{ fontSize:11, color:B.amber, fontWeight:700 }}>⭐ Pod Leader</div>
              {podLeader.email && <div style={{ fontSize:10, color:B.lightGray }}>{podLeader.email}</div>}
            </div>
          </div>
        ) : (
          <div style={{ background:'#F9FAFB', border:`2px dashed ${B.border}`, borderRadius:12,
            padding:'12px 28px', minWidth:260, textAlign:'center',
            fontSize:12, color:B.lightGray, fontStyle:'italic' }}>
            No Pod Leader assigned
          </div>
        )}
      </div>
      <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
        <div style={{ width:2, height:20, background:B.border }} />
      </div>
      <div style={{ display:'flex', gap:12 }}>
        <TeamCol title="Authorization"      color="#0369A1" icon="🔒" leader={authLeader}  members={authMembers}   noLeaderNote="No leader yet" />
        <TeamCol title="Care Coordination"  color="#059669" icon="🏥" leader={ccLeader}    members={ccMembers}     noLeaderNote="No leader yet" />
        <TeamCol title="Intake"             color="#7C3AED" icon="📥" leader={null}         members={intakeMembers} noLeaderNote="Reports to Pod Leader" />
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function UserManagement() {
  const { isSuperAdmin, profile: myProfile } = useAuth();
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [search, setSearch]     = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [activeTab, setActiveTab]   = useState('list');
  const [resetPassUser, setResetPassUser] = useState(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const { data } = await supabase.from('coordinators').select('*').order('name');
    setUsers(data || []);
    setLoading(false);
  }

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const needsTeam   = ['team_leader','team_member'].includes(form.role);
  const needsRegion = ['coordinator','regional_mgr'].includes(form.role);

  const filtered = users
    .filter(u => filterRole === 'all' || u.role === filterRole)
    .filter(u => filterTeam === 'all' || u.team === filterTeam)
    .filter(u => !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()));

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) { setError('Name, email, and password are required'); return; }
    if (needsTeam && !form.team) { setError('Please select a team for this role'); return; }
    setSaving(true); setError('');
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { name: form.name } }
      });
      if (authErr) throw authErr;
      const roleInfo = ROLES.find(r => r.value === form.role);
      const { error: profErr } = await supabase.from('coordinators').insert({
        user_id: authData.user.id, name: form.name, email: form.email,
        role: form.role, team: form.team || null,
        region: form.region || null, phone: form.phone || null,
        notes: form.notes || null, status: 'active',
        color: roleInfo?.color || B.red,
      });
      if (profErr) throw profErr;
      setSuccess(`✓ Account created for ${form.name}`);
      setForm(EMPTY_FORM); setShowForm(false); loadUsers();
    } catch(e) { setError(e.message || 'Failed to create account'); }
    setSaving(false);
  }

  async function handleUpdate() {
    if (needsTeam && !form.team) { setError('Please select a team for this role'); return; }
    setSaving(true); setError('');
    const roleInfo = ROLES.find(r => r.value === form.role);
    const { error: e } = await supabase.from('coordinators').update({
      name: form.name, role: form.role, team: form.team || null,
      region: form.region || null, phone: form.phone || null,
      notes: form.notes || null, color: roleInfo?.color || B.red,
    }).eq('id', editUser.id);
    if (e) { setError(e.message); setSaving(false); return; }
    setSuccess(`✓ ${form.name}'s profile updated`);
    setEditUser(null); setForm(EMPTY_FORM); setShowForm(false); loadUsers();
    setSaving(false);
  }

  async function toggleStatus(u) {
    const ns = u.status === 'active' ? 'locked' : 'active';
    await supabase.from('coordinators').update({ status: ns }).eq('id', u.id);
    setSuccess(`✓ ${u.name} ${ns === 'locked' ? 'locked' : 'reactivated'}`);
    loadUsers();
  }

  async function handleResetPassword() {
    setSaving(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(resetPassUser.email);
    if (e) { setError(e.message); setSaving(false); return; }
    setSuccess(`✓ Password reset email sent to ${resetPassUser.email}`);
    setResetPassUser(null); setSaving(false);
  }

  const startEdit = (u) => {
    setEditUser(u);
    setForm({ name:u.name, email:u.email||'', password:'', role:u.role,
      team:u.team||'', region:u.region||'', phone:u.phone||'', notes:u.notes||'' });
    setShowForm(true); setActiveTab('list');
  };

  const statusColor = { active:B.green, locked:B.danger, inactive:B.lightGray };
  const roleGroups = [
    { label:'Mission Control', roles: ROLES.filter(r=>r.group==='mission_control') },
    { label:'Platform',        roles: ROLES.filter(r=>r.group==='platform') },
    { label:'Legacy',          roles: ROLES.filter(r=>r.group==='legacy') },
  ];

  if (!isSuperAdmin) return (
    <div style={{ padding:40, textAlign:'center' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🔐</div>
      <div style={{ fontSize:16, fontWeight:700, color:B.black }}>Super Admin Access Required</div>
    </div>
  );

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", color:B.black }}>

      {/* Header */}
      <div style={{ marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, marginBottom:4 }}>👤 User Management</h1>
          <p style={{ fontSize:13, color:B.gray, margin:0 }}>{users.length} accounts · Mission Control + platform roles</p>
        </div>
        <button onClick={() => { setEditUser(null); setForm(EMPTY_FORM); setShowForm(true); setActiveTab('list'); }}
          style={{ background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none', borderRadius:10,
            color:'#fff', padding:'10px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
            boxShadow:'0 2px 8px rgba(217,79,43,0.3)' }}>
          + Add User
        </button>
      </div>

      {/* Alerts */}
      {error   && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 16px', marginBottom:16, fontSize:13, color:B.danger }}>{error} <button onClick={()=>setError('')} style={{ float:'right', background:'none', border:'none', color:B.danger, cursor:'pointer' }}>✕</button></div>}
      {success && <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'10px 16px', marginBottom:16, fontSize:13, color:B.green }}>{success} <button onClick={()=>setSuccess('')} style={{ float:'right', background:'none', border:'none', color:B.green, cursor:'pointer' }}>✕</button></div>}

      {/* Create / Edit form */}
      {showForm && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16,
          padding:24, marginBottom:24, boxShadow:'0 4px 20px rgba(139,26,16,0.1)' }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:20 }}>
            {editUser ? `✏️ Edit ${editUser.name}` : '➕ Create New Account'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

            {[{ label:'Full Name *', key:'name', placeholder:'e.g. Carla Smith', type:'text' },
              { label:'Email Address *', key:'email', placeholder:'name@axiomhealth.com', type:'email', disabled:!!editUser },
              ...(!editUser ? [{ label:'Temporary Password *', key:'password', placeholder:'Min 8 characters', type:'password' }] : []),
              { label:'Phone', key:'phone', placeholder:'(407) 555-0100', type:'text' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={e=>setField(f.key,e.target.value)}
                  placeholder={f.placeholder} disabled={f.disabled}
                  style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8,
                    fontSize:13, fontFamily:'inherit', color:B.black, outline:'none',
                    background: f.disabled ? '#F9FAFB' : '#fff', boxSizing:'border-box' }} />
              </div>
            ))}

            {/* Role */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Role *</label>
              <select value={form.role} onChange={e=>{ setField('role',e.target.value); setField('team',''); }}
                style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                {roleGroups.map(g => (
                  <optgroup key={g.label} label={`── ${g.label} ──`}>
                    {g.roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Team — team_leader and team_member only */}
            {needsTeam && (
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Team *</label>
                <select value={form.team} onChange={e=>setField('team',e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, fontFamily:'inherit',
                    color:B.black, outline:'none', background:'#fff', boxSizing:'border-box',
                    border:`1.5px solid ${needsTeam && !form.team ? B.danger : B.border}` }}>
                  <option value="">Select team…</option>
                  {TEAMS.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>
            )}

            {/* Region — coordinator/regional_mgr only */}
            {needsRegion && (
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Region</label>
                <select value={form.region} onChange={e=>setField('region',e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                  <option value="">All regions</option>
                  {REGIONS.map(r => <option key={r} value={r}>Region {r}</option>)}
                </select>
              </div>
            )}

            {/* Notes */}
            <div style={{ gridColumn:'span 2' }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Notes</label>
              <input value={form.notes} onChange={e=>setField('notes',e.target.value)} placeholder="Optional notes"
                style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff', boxSizing:'border-box' }} />
            </div>
          </div>

          {/* Role callout */}
          <div style={{ marginTop:14, padding:'10px 14px', background:'#F0F9FF', border:'1px solid #BFDBFE', borderRadius:8, fontSize:12, color:'#1565C0' }}>
            <strong>{ROLES.find(r=>r.value===form.role)?.label}:</strong> {ROLES.find(r=>r.value===form.role)?.desc}
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button onClick={()=>{ setShowForm(false); setEditUser(null); setError(''); }}
              style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'9px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={editUser ? handleUpdate : handleCreate} disabled={saving}
              style={{ background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:saving?0.7:1 }}>
              {saving ? 'Saving…' : editUser ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </div>
      )}

      {/* Password reset modal */}
      {resetPassUser && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:B.card, borderRadius:16, padding:28, width:380, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:B.black, marginBottom:6 }}>🔑 Reset Password</div>
            <div style={{ fontSize:13, color:B.gray, marginBottom:20 }}>Send a reset email to <strong>{resetPassUser.name}</strong> at <strong>{resetPassUser.email}</strong></div>
            {error && <div style={{ background:'#FEF2F2', borderRadius:8, padding:'8px 12px', fontSize:12, color:B.danger, marginBottom:12 }}>{error}</div>}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>{ setResetPassUser(null); setError(''); }} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'8px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
              <button onClick={handleResetPassword} disabled={saving}
                style={{ background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                {saving ? 'Sending…' : 'Send Reset Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:`1px solid ${B.border}` }}>
        {[{ key:'list', label:'👤 User List' }, { key:'org', label:'🏢 Org Chart' }].map(t => (
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'inherit',
              padding:'10px 18px', fontSize:13, fontWeight:activeTab===t.key?700:500,
              color:activeTab===t.key?B.red:B.gray,
              borderBottom:activeTab===t.key?`2px solid ${B.red}`:'2px solid transparent',
              marginBottom:-1, transition:'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Org chart */}
      {activeTab === 'org' && <OrgChart users={users} />}

      {/* User list */}
      {activeTab === 'list' && (
        <>
          {/* Stats row */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ background:`${B.amber}10`, border:`1px solid ${B.amber}30`, borderRadius:10, padding:'10px 16px', display:'flex', gap:16 }}>
              {[{label:'Pod Leader',color:B.amber,role:'pod_leader'},{label:'Team Leaders',color:'#0369A1',role:'team_leader'},{label:'Members',color:B.gray,role:'team_member'}].map(s=>(
                <div key={s.role} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{users.filter(u=>u.role===s.role).length}</div>
                  <div style={{ fontSize:10, color:B.gray }}>{s.label}</div>
                </div>
              ))}
            </div>
            {TEAMS.map(t => (
              <div key={t.value} style={{ background:`${t.color}10`, border:`1px solid ${t.color}30`, borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:18 }}>{t.icon}</span>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, color:t.color }}>{users.filter(u=>u.team===t.value).length}</div>
                  <div style={{ fontSize:10, color:B.gray }}>{t.label.split(' ')[0]}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or email…"
              style={{ flex:1, minWidth:200, padding:'8px 14px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black }} />
            <select value={filterRole} onChange={e=>setFilterRole(e.target.value)}
              style={{ padding:'8px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Roles</option>
              {roleGroups.map(g=>(
                <optgroup key={g.label} label={g.label}>
                  {g.roles.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
                </optgroup>
              ))}
            </select>
            <select value={filterTeam} onChange={e=>setFilterTeam(e.target.value)}
              style={{ padding:'8px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Teams</option>
              {TEAMS.map(t=><option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
            <span style={{ fontSize:12, color:B.lightGray }}>{filtered.length} users</span>
          </div>

          {/* Table */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'200px 170px 120px 130px 90px 1fr', padding:'10px 20px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {['Name','Email','Role','Team / Region','Status','Actions'].map(h=>(
                <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.1em' }}>{h}</div>
              ))}
            </div>
            {loading ? (
              <div style={{ padding:32, textAlign:'center', color:B.lightGray }}>Loading users…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:B.lightGray }}>No users found</div>
            ) : filtered.map(u => {
              const ri = ROLES.find(r=>r.value===u.role) || { label:u.role, color:B.gray };
              const ti = TEAMS.find(t=>t.value===u.team);
              const st = u.status || 'active';
              const isMe = u.id === myProfile?.id;
              return (
                <div key={u.id} style={{ display:'grid', gridTemplateColumns:'200px 170px 120px 130px 90px 1fr',
                  padding:'12px 20px', borderBottom:'1px solid #FAF4F2', alignItems:'center',
                  background: st==='locked' ? '#FEF2F2' : 'transparent' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:B.black, display:'flex', alignItems:'center', gap:6 }}>
                      {u.name}
                      {isMe && <span style={{ fontSize:9, background:'#EFF6FF', color:'#1565C0', borderRadius:10, padding:'1px 6px', fontWeight:700 }}>YOU</span>}
                    </div>
                    {u.phone && <div style={{ fontSize:11, color:B.lightGray, marginTop:1 }}>{u.phone}</div>}
                  </div>
                  <div style={{ fontSize:11, color:B.gray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email||'—'}</div>
                  <div>
                    <span style={{ background:`${ri.color}18`, color:ri.color, border:`1px solid ${ri.color}35`, borderRadius:20, padding:'3px 8px', fontSize:11, fontWeight:700 }}>
                      {ri.label}
                    </span>
                  </div>
                  <div>
                    {ti ? (
                      <span style={{ background:`${ti.color}15`, color:ti.color, border:`1px solid ${ti.color}30`, borderRadius:20, padding:'3px 8px', fontSize:11, fontWeight:600 }}>
                        {ti.icon} {ti.label.split(' ')[0]}
                      </span>
                    ) : u.region ? (
                      <span style={{ fontSize:12, color:B.gray }}>Region {u.region}</span>
                    ) : <span style={{ fontSize:12, color:B.lightGray }}>—</span>}
                  </div>
                  <div>
                    <span style={{ background:`${statusColor[st]}18`, color:statusColor[st], border:`1px solid ${statusColor[st]}35`, borderRadius:20, padding:'3px 8px', fontSize:11, fontWeight:700 }}>
                      {st.charAt(0).toUpperCase()+st.slice(1)}
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={()=>startEdit(u)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Edit</button>
                    <button onClick={()=>setResetPassUser(u)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:'#1565C0', padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Reset PW</button>
                    {!isMe && (
                      <button onClick={()=>toggleStatus(u)} style={{ background:'none', border:`1px solid ${st==='locked'?B.green:B.danger}40`, borderRadius:6, color:st==='locked'?B.green:B.danger, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                        {st==='locked'?'Unlock':'Lock'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

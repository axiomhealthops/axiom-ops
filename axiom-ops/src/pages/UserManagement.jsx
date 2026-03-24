import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#8B6B64', lightGray:'#BBA8A4',
  border:'#F0E4E0', bg:'#FBF7F6', card:'#fff',
  green:'#2E7D32', yellow:'#D97706', danger:'#DC2626', blue:'#1565C0',
};

const ROLES = [
  { value: 'super_admin',  label: 'Super Admin',    color: '#D94F2B', desc: 'Full access + user management' },
  { value: 'ceo',          label: 'CEO',            color: '#7C3AED', desc: 'Executive read-only dashboard' },
  { value: 'director',     label: 'Director',       color: '#1565C0', desc: 'Full operations dashboard' },
  { value: 'regional_mgr', label: 'Regional Mgr',  color: '#059669', desc: 'Regional view + team management' },
  { value: 'coordinator',  label: 'Coordinator',    color: '#D97706', desc: 'Daily report submission' },
  { value: 'admin',        label: 'Admin',          color: '#6B7280', desc: 'Limited dashboard access' },
];

const REGIONS = ['A','B','C','G','H','J','M','N','T','V'];

const EMPTY_FORM = { name:'', email:'', password:'', role:'coordinator', region:'', phone:'', notes:'' };

export default function UserManagement() {
  const { isSuperAdmin, profile: myProfile } = useAuth();
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [search, setSearch]       = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [resetPassUser, setResetPassUser] = useState(null);
  const [newPassword, setNewPassword]     = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const { data } = await supabase.from('coordinators').select('*').order('name');
    setUsers(data || []);
    setLoading(false);
  }

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const filtered = users
    .filter(u => filterRole === 'all' || u.role === filterRole)
    .filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) { setError('Name, email and password are required'); return; }
    setSaving(true); setError('');
    try {
      // Create Supabase auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { name: form.name } }
      });
      if (authErr) throw authErr;

      // Insert profile
      const { error: profErr } = await supabase.from('coordinators').insert({
        user_id: authData.user.id,
        name: form.name,
        email: form.email,
        role: form.role,
        region: form.region || null,
        phone: form.phone || null,
        notes: form.notes || null,
        status: 'active',
        color: ROLES.find(r => r.value === form.role)?.color || '#D94F2B',
      });
      if (profErr) throw profErr;

      setSuccess(`✓ Account created for ${form.name} — they can now log in with ${form.email}`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadUsers();
    } catch(e) {
      setError(e.message || 'Failed to create account');
    }
    setSaving(false);
  }

  async function handleUpdate() {
    setSaving(true); setError('');
    const { error: e } = await supabase.from('coordinators').update({
      name: form.name,
      role: form.role,
      region: form.region || null,
      phone: form.phone || null,
      notes: form.notes || null,
      color: ROLES.find(r => r.value === form.role)?.color || '#D94F2B',
    }).eq('id', editUser.id);
    if (e) { setError(e.message); setSaving(false); return; }
    setSuccess(`✓ ${form.name}'s profile updated`);
    setEditUser(null);
    setForm(EMPTY_FORM);
    loadUsers();
    setSaving(false);
  }

  async function toggleStatus(u) {
    const newStatus = u.status === 'active' ? 'locked' : 'active';
    await supabase.from('coordinators').update({ status: newStatus }).eq('id', u.id);
    setSuccess(`✓ ${u.name} ${newStatus === 'locked' ? 'locked' : 'reactivated'}`);
    loadUsers();
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSaving(true);
    // Send password reset email (safest approach with anon key)
    const { error: e } = await supabase.auth.resetPasswordForEmail(resetPassUser.email);
    if (e) { setError(e.message); setSaving(false); return; }
    setSuccess(`✓ Password reset email sent to ${resetPassUser.email}`);
    setResetPassUser(null);
    setNewPassword('');
    setSaving(false);
  }

  const startEdit = (u) => {
    setEditUser(u);
    setForm({ name: u.name, email: u.email || '', password: '', role: u.role, region: u.region || '', phone: u.phone || '', notes: u.notes || '' });
    setShowForm(true);
  };

  const statusColors = { active: B.green, locked: B.danger, inactive: B.lightGray };
  const STATUS_LABELS = { active: 'Active', locked: 'Locked', inactive: 'Inactive' };

  if (!isSuperAdmin) return (
    <div style={{ padding: 40, textAlign: 'center', color: B.lightGray }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: B.black }}>Super Admin Access Required</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: B.black }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 4 }}>👤 User Management</h1>
          <p style={{ fontSize: 13, color: B.gray, margin: 0 }}>{users.length} accounts · Manage access, roles, and permissions</p>
        </div>
        <button onClick={() => { setEditUser(null); setForm(EMPTY_FORM); setShowForm(true); }} style={{
          background: `linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border: 'none', borderRadius: 10,
          color: '#fff', padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 2px 8px rgba(217,79,43,0.3)',
        }}>+ Add User</button>
      </div>

      {/* Alerts */}
      {error && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'10px 16px', marginBottom:16, fontSize:13, color:B.danger }}>{error} <button onClick={() => setError('')} style={{ float:'right', background:'none', border:'none', color:B.danger, cursor:'pointer' }}>✕</button></div>}
      {success && <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'10px 16px', marginBottom:16, fontSize:13, color:B.green }}>{success} <button onClick={() => setSuccess('')} style={{ float:'right', background:'none', border:'none', color:B.green, cursor:'pointer' }}>✕</button></div>}

      {/* Create/Edit Form */}
      {showForm && (
        <div style={{ background: B.card, border: `1px solid ${B.border}`, borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 4px 20px rgba(139,26,16,0.1)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: B.black, marginBottom: 20 }}>
            {editUser ? `✏️ Edit ${editUser.name}` : '➕ Create New Account'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: 'Full Name *', key: 'name', placeholder: 'e.g. Gypsy Martinez', type: 'text' },
              { label: 'Email Address *', key: 'email', placeholder: 'name@axiomhealth.com', type: 'email', disabled: !!editUser },
              ...(!editUser ? [{ label: 'Temporary Password *', key: 'password', placeholder: 'Min 8 characters', type: 'password' }] : []),
              { label: 'Phone', key: 'phone', placeholder: '(407) 555-0100', type: 'text' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} disabled={f.disabled}
                  style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background: f.disabled ? '#F9FAFB' : '#fff', boxSizing:'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Role *</label>
              <select value={form.role} onChange={e => setField('role', e.target.value)}
                style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
              </select>
            </div>
            {['coordinator','regional_mgr'].includes(form.role) && (
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Region</label>
                <select value={form.region} onChange={e => setField('region', e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff', boxSizing:'border-box' }}>
                  <option value="">All regions</option>
                  {REGIONS.map(r => <option key={r} value={r}>Region {r}</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Notes</label>
              <input value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Optional notes about this account"
                style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff', boxSizing:'border-box' }} />
            </div>
          </div>
          {/* Role description */}
          {form.role && (
            <div style={{ marginTop:14, padding:'10px 14px', background:'#F0F9FF', border:'1px solid #BFDBFE', borderRadius:8, fontSize:12, color:'#1565C0' }}>
              <strong>{ROLES.find(r=>r.value===form.role)?.label}:</strong> {ROLES.find(r=>r.value===form.role)?.desc}
            </div>
          )}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
            <button onClick={() => { setShowForm(false); setEditUser(null); setError(''); }} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'9px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={editUser ? handleUpdate : handleCreate} disabled={saving}
              style={{ background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPassUser && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:B.card, borderRadius:16, padding:28, width:380, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:16, fontWeight:800, color:B.black, marginBottom:6 }}>🔑 Reset Password</div>
            <div style={{ fontSize:13, color:B.gray, marginBottom:20 }}>Send a password reset email to {resetPassUser.name} at <strong>{resetPassUser.email}</strong></div>
            {error && <div style={{ background:'#FEF2F2', borderRadius:8, padding:'8px 12px', fontSize:12, color:B.danger, marginBottom:12 }}>{error}</div>}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => { setResetPassUser(null); setError(''); }} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'8px 16px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
              <button onClick={handleResetPassword} disabled={saving}
                style={{ background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                {saving ? 'Sending...' : 'Send Reset Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..."
          style={{ padding:'8px 14px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black, width:240 }} />
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          style={{ padding:'8px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
          <option value="all">All Roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <span style={{ fontSize:12, color:B.lightGray, marginLeft:'auto' }}>{filtered.length} users</span>
      </div>

      {/* Role stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:8, marginBottom:20 }}>
        {ROLES.map(r => {
          const count = users.filter(u => u.role === r.value).length;
          return (
            <div key={r.value} onClick={() => setFilterRole(filterRole === r.value ? 'all' : r.value)}
              style={{ background: filterRole === r.value ? `${r.color}15` : B.card, border:`1px solid ${filterRole === r.value ? r.color : B.border}`, borderRadius:10, padding:'10px 12px', cursor:'pointer', transition:'all 0.15s' }}>
              <div style={{ fontSize:18, fontWeight:800, color: r.color, fontFamily:'monospace' }}>{count}</div>
              <div style={{ fontSize:10, color: B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:2 }}>{r.label}</div>
            </div>
          );
        })}
      </div>

      {/* User table */}
      <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, overflow:'hidden', boxShadow:'0 1px 4px rgba(139,26,16,0.06)' }}>
        {/* Table header */}
        <div style={{ display:'grid', gridTemplateColumns:'220px 140px 100px 120px 100px 1fr', padding:'10px 20px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
          {['Name', 'Email', 'Role', 'Region', 'Status', 'Actions'].map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.1em' }}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding:'32px', textAlign:'center', color:B.lightGray }}>Loading users...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', color:B.lightGray }}>No users found</div>
        ) : filtered.map(u => {
          const roleInfo = ROLES.find(r => r.value === u.role) || { label: u.role, color: B.gray };
          const status   = u.status || 'active';
          const isMe     = u.id === myProfile?.id;
          return (
            <div key={u.id} style={{ display:'grid', gridTemplateColumns:'220px 140px 100px 120px 100px 1fr', padding:'12px 20px', borderBottom:`1px solid #FAF4F2`, alignItems:'center', background: status === 'locked' ? '#FEF2F2' : 'transparent' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:B.black, display:'flex', alignItems:'center', gap:6 }}>
                  {u.name}
                  {isMe && <span style={{ fontSize:9, background:'#EFF6FF', color:'#1565C0', borderRadius:10, padding:'1px 6px', fontWeight:700 }}>YOU</span>}
                </div>
                {u.phone && <div style={{ fontSize:11, color:B.lightGray, marginTop:1 }}>{u.phone}</div>}
              </div>
              <div style={{ fontSize:11, color:B.gray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email || '—'}</div>
              <div>
                <span style={{ background:`${roleInfo.color}18`, color:roleInfo.color, border:`1px solid ${roleInfo.color}35`, borderRadius:20, padding:'3px 8px', fontSize:11, fontWeight:700 }}>
                  {roleInfo.label}
                </span>
              </div>
              <div style={{ fontSize:12, color:B.gray }}>{u.region ? `Region ${u.region}` : 'All'}</div>
              <div>
                <span style={{ background:`${statusColors[status]}18`, color:statusColors[status], border:`1px solid ${statusColors[status]}35`, borderRadius:20, padding:'3px 8px', fontSize:11, fontWeight:700 }}>
                  {STATUS_LABELS[status] || status}
                </span>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => startEdit(u)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Edit</button>
                <button onClick={() => setResetPassUser(u)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.blue, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Reset PW</button>
                {!isMe && (
                  <button onClick={() => toggleStatus(u)} style={{ background:'none', border:`1px solid ${u.status === 'locked' ? B.green : B.danger}`, borderRadius:6, color: u.status === 'locked' ? B.green : B.danger, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                    {u.status === 'locked' ? 'Unlock' : 'Lock'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick setup guide */}
      {users.filter(u => u.role === 'coordinator').length < 4 && (
        <div style={{ marginTop:20, background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:14, padding:'18px 20px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#92400E', marginBottom:10 }}>⚡ Quick Setup — Create Your Coordinator Accounts</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8 }}>
            {[
              { name:'Gypsy', region:'North FL (multiple)', role:'coordinator', hint:'Gypsy — North FL coordinator' },
              { name:'Mary',  region:'South FL (multiple)', role:'coordinator', hint:'Mary — South FL coordinator' },
              { name:'Audrey',region:'Central FL (multiple)',role:'coordinator',hint:'Audrey — Central FL coordinator' },
              { name:'April', region:'Multi-State',         role:'coordinator', hint:'April — multi-state coordinator' },
              { name:'Dustin Moura', region:'All', role:'ceo', hint:'CEO access — full executive view' },
            ].map(c => (
              <button key={c.name} onClick={() => { setForm({...EMPTY_FORM, name:c.name, role:c.role}); setEditUser(null); setShowForm(true); }}
                style={{ background:'#fff', border:'1px solid #FDE68A', borderRadius:8, padding:'8px 12px', textAlign:'left', cursor:'pointer', fontFamily:'inherit', fontSize:12, color:'#92400E' }}>
                ➕ {c.hint}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

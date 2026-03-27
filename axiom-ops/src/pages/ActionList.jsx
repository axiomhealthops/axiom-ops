import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626',
  blue:'#1D4ED8', purple:'#7C3AED',
};
 
const PRIORITY_META = {
  critical: { label:'Critical', color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🚨', order:0 },
  high:     { label:'High',     color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', icon:'⚠️',  order:1 },
  medium:   { label:'Medium',   color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'📋', order:2 },
  low:      { label:'Low',      color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE', icon:'💬', order:3 },
};
 
const STATUS_META = {
  open:        { label:'Open',        color:B.danger, bg:'#FEF2F2' },
  in_progress: { label:'In Progress', color:B.yellow, bg:'#FFFBEB' },
  pending:     { label:'Pending',     color:B.blue,   bg:'#EFF6FF' },
  completed:   { label:'Completed',   color:B.green,  bg:'#F0FDF4' },
  escalated:   { label:'Escalated',   color:B.purple, bg:'#F5F3FF' },
};
 
const ACTION_TYPES = [
  'Authorization Follow-Up',
  'Patient Outreach',
  'Care Coordination',
  'On-Hold Recovery',
  'SOC Scheduling',
  'Eval Scheduling',
  'Insurance Call',
  'Documentation Required',
  'Director Review',
  'Referral Follow-Up',
  'Other',
];
 
const ALL_STAFF = [
  'Carla Smith','Ethel Camposano','Gerilyn Bayson','Uriel Sarabosing',
  'Gypsy Renos','Mary Imperio','Audrey Sarmiento','April Manalo',
  'Hervylie Senica','Kiarra Arabejo',
];
 
function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  const now = new Date();
  const diff = Math.floor((now - date) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return date.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
 
function fmtDue(d) {
  if (!d) return null;
  const date = new Date(d+'T12:00:00');
  const now = new Date();
  const diff = Math.floor((date - now) / 86400000);
  if (diff < 0) return { label:`${Math.abs(diff)}d overdue`, color:B.danger, urgent:true };
  if (diff === 0) return { label:'Due today', color:B.orange, urgent:true };
  if (diff === 1) return { label:'Due tomorrow', color:B.yellow, urgent:false };
  return { label:`Due ${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`, color:B.lightGray, urgent:false };
}
 
// ── New/Edit Action Modal ──────────────────────────────────────
function ActionModal({ action, currentUser, onSave, onClose }) {
  const isEdit = !!action?.id;
  const [form, setForm] = useState({
    title: action?.title || '',
    action_type: action?.action_type || 'Authorization Follow-Up',
    priority: action?.priority || 'medium',
    patient_name: action?.patient_name || '',
    assigned_to: action?.assigned_to || currentUser || '',
    due_date: action?.due_date || '',
    notes: action?.notes || '',
    status: action?.status || 'open',
  });
  const [saving, setSaving] = useState(false);
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));
 
  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      title: form.title.trim(),
      patient_name: form.patient_name.trim() || null,
      due_date: form.due_date || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (isEdit) {
      await supabase.from('action_items').update(payload).eq('id', action.id);
    } else {
      await supabase.from('action_items').insert({
        ...payload,
        created_by: currentUser || 'Unknown',
        created_at: new Date().toISOString(),
        status: 'open',
      });
    }
    setSaving(false);
    onSave();
  };
 
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ background:B.card, borderRadius:20, padding:28, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize:16, fontWeight:800, color:B.black, marginBottom:20 }}>
          {isEdit ? '✏️ Edit Action' : '➕ New Action Item'}
        </div>
 
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Title *</label>
            <input value={form.title} onChange={e=>setF('title',e.target.value)} placeholder="What needs to be done?"
              style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${form.title?B.red:B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
          </div>
 
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Type</label>
              <select value={form.action_type} onChange={e=>setF('action_type',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>
                {ACTION_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Priority</label>
              <select value={form.priority} onChange={e=>setF('priority',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${PRIORITY_META[form.priority]?.color||B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', background:PRIORITY_META[form.priority]?.bg||'#fff', color:PRIORITY_META[form.priority]?.color||B.black, boxSizing:'border-box', fontWeight:700 }}>
                {Object.entries(PRIORITY_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
          </div>
 
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Patient (optional)</label>
              <input value={form.patient_name} onChange={e=>setF('patient_name',e.target.value)} placeholder="Patient name..."
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e=>setF('due_date',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, boxSizing:'border-box' }} />
            </div>
          </div>
 
          <div>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Assign To</label>
            <select value={form.assigned_to} onChange={e=>setF('assigned_to',e.target.value)}
              style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black, boxSizing:'border-box' }}>
              <option value="">Unassigned</option>
              {ALL_STAFF.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
 
          {isEdit && (
            <div>
              <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Status</label>
              <select value={form.status} onChange={e=>setF('status',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${STATUS_META[form.status]?.color||B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', background:STATUS_META[form.status]?.bg||'#fff', color:STATUS_META[form.status]?.color||B.black, boxSizing:'border-box', fontWeight:700 }}>
                {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          )}
 
          <div>
            <label style={{ display:'block', fontSize:10, fontWeight:700, color:B.gray, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Notes</label>
            <textarea value={form.notes} onChange={e=>setF('notes',e.target.value)} rows={3}
              placeholder="Additional context, steps taken, next actions..."
              style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black, boxSizing:'border-box' }} />
          </div>
        </div>
 
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'9px 18px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={save} disabled={!form.title.trim()||saving}
            style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8, color:'#fff', padding:'9px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:!form.title.trim()||saving?0.5:1 }}>
            {saving?'Saving...':(isEdit?'Save Changes':'Create Action')}
          </button>
        </div>
      </div>
    </div>
  );
}
 
// ── Action Card ────────────────────────────────────────────────
function ActionCard({ item, currentUser, isLeader, onUpdate, onEdit }) {
  const [updating, setUpdating] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
 
  const pMeta = PRIORITY_META[item.priority] || PRIORITY_META.medium;
  const sMeta = STATUS_META[item.status] || STATUS_META.open;
  const due   = fmtDue(item.due_date);
  const isOwn = item.assigned_to === currentUser || item.created_by === currentUser;
 
  const updateStatus = async (status) => {
    setUpdating(true);
    await supabase.from('action_items').update({
      status,
      completed_at: status==='completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    setUpdating(false);
    onUpdate();
  };
 
  const escalate = async () => {
    setUpdating(true);
    await supabase.from('action_items').update({
      status: 'escalated',
      priority: 'critical',
      escalated_by: currentUser,
      escalated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    setUpdating(false);
    onUpdate();
  };
 
  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    const prev = item.notes ? item.notes + '\n\n' : '';
    const timestamp = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    const newNote = `${prev}[${timestamp} - ${currentUser}] ${noteText.trim()}`;
    await supabase.from('action_items').update({
      notes: newNote,
      updated_at: new Date().toISOString(),
    }).eq('id', item.id);
    setNoteText('');
    setAddingNote(false);
    onUpdate();
  };
 
  return (
    <div style={{
      background: item.status==='completed' ? '#FAFAFA' : B.card,
      border: `1.5px solid ${due?.urgent&&item.status!=='completed' ? pMeta.color : item.status==='completed' ? '#E5E7EB' : pMeta.border}`,
      borderRadius:12, padding:'14px 16px', marginBottom:8,
      opacity: item.status==='completed' ? 0.7 : 1,
      boxShadow: due?.urgent&&item.status!=='completed' ? `0 2px 8px ${pMeta.color}20` : '0 1px 3px rgba(0,0,0,0.04)',
      fontFamily:"'DM Sans',sans-serif",
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
        <div style={{ flex:1, minWidth:0 }}>
          {/* Top row */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5, flexWrap:'wrap' }}>
            <span style={{ fontSize:10, fontWeight:700, color:pMeta.color, background:pMeta.bg, border:`1px solid ${pMeta.border}`, borderRadius:10, padding:'2px 8px' }}>
              {pMeta.icon} {pMeta.label}
            </span>
            <span style={{ fontSize:10, fontWeight:700, color:sMeta.color, background:sMeta.bg, borderRadius:10, padding:'2px 8px' }}>
              {sMeta.label}
            </span>
            <span style={{ fontSize:10, color:B.lightGray, background:B.bg, borderRadius:10, padding:'2px 8px' }}>
              {item.action_type}
            </span>
            {due && item.status !== 'completed' && (
              <span style={{ fontSize:10, fontWeight:due.urgent?700:400, color:due.color }}>
                {due.urgent?'⏰ ':''}{due.label}
              </span>
            )}
          </div>
 
          {/* Title */}
          <div style={{ fontSize:14, fontWeight:700, color:item.status==='completed'?B.lightGray:B.black, marginBottom:4, textDecoration:item.status==='completed'?'line-through':'none' }}>
            {item.title}
          </div>
 
          {/* Meta */}
          <div style={{ display:'flex', gap:12, fontSize:11, color:B.lightGray, flexWrap:'wrap' }}>
            {item.patient_name && <span>👤 {item.patient_name}</span>}
            {item.assigned_to && <span>→ {item.assigned_to.split(' ')[0]}</span>}
            <span>by {item.created_by?.split(' ')[0]||'?'} · {fmtDate(item.created_at)}</span>
            {item.escalated_by && <span style={{ color:B.purple, fontWeight:700 }}>⚡ Escalated by {item.escalated_by.split(' ')[0]}</span>}
          </div>
 
          {/* Notes preview */}
          {item.notes && (
            <div style={{ marginTop:8 }}>
              <button onClick={()=>setShowNotes(p=>!p)} style={{ background:'none', border:'none', color:B.blue, fontSize:11, cursor:'pointer', fontFamily:'inherit', padding:0 }}>
                {showNotes?'▲ Hide':'▼ Show'} notes
              </button>
              {showNotes && (
                <div style={{ marginTop:6, background:B.bg, border:`1px solid ${B.border}`, borderRadius:8, padding:'8px 12px', fontSize:12, color:B.black, whiteSpace:'pre-wrap', maxHeight:150, overflowY:'auto' }}>
                  {item.notes}
                </div>
              )}
            </div>
          )}
 
          {/* Add note */}
          {item.status !== 'completed' && (
            <div style={{ marginTop:8, display:'flex', gap:6 }}>
              <input value={noteText} onChange={e=>setNoteText(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addNote()}
                placeholder="Add update note..."
                style={{ flex:1, padding:'5px 10px', border:`1px solid ${B.border}`, borderRadius:7, fontSize:11, fontFamily:'inherit', outline:'none', color:B.black }} />
              <button onClick={addNote} disabled={!noteText.trim()||addingNote}
                style={{ background:B.blue, border:'none', borderRadius:7, color:'#fff', padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit', opacity:!noteText.trim()||addingNote?0.5:1 }}>
                {addingNote?'...':'Add'}
              </button>
            </div>
          )}
        </div>
 
        {/* Actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:5, flexShrink:0 }}>
          {item.status === 'open' && (
            <button onClick={()=>updateStatus('in_progress')} disabled={updating}
              style={{ background:B.yellow+'20', border:`1px solid ${B.yellow}`, borderRadius:7, color:B.yellow, padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
              Start
            </button>
          )}
          {(item.status === 'in_progress' || item.status === 'open') && (
            <button onClick={()=>updateStatus('completed')} disabled={updating}
              style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:7, color:B.green, padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              ✓ Done
            </button>
          )}
          {item.status !== 'escalated' && item.status !== 'completed' && isLeader && (
            <button onClick={escalate} disabled={updating}
              style={{ background:'#F5F3FF', border:`1px solid #DDD6FE`, borderRadius:7, color:B.purple, padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
              ⚡ Escalate
            </button>
          )}
          {item.status === 'completed' && (
            <button onClick={()=>updateStatus('open')} disabled={updating}
              style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:7, color:B.lightGray, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
              Reopen
            </button>
          )}
          {(isLeader || isOwn) && (
            <button onClick={()=>onEdit(item)}
              style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:7, color:B.gray, padding:'5px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
              ✏️
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
 
// ── Main ActionList ────────────────────────────────────────────
export default function ActionList() {
  const { profile, isSuperAdmin, isDirector, isTeamLeader } = useAuth();
  const isLeader = isSuperAdmin || isDirector || isTeamLeader;
  const currentUser = profile?.full_name || profile?.name || '';
 
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [filterStatus, setFilterStatus] = useState('active');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('mine');
  const [search, setSearch]         = useState('');
  const [activeTab, setActiveTab]   = useState('list');
 
  const loadItems = async () => {
    const { data } = await supabase
      .from('action_items')
      .select('*')
      .order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };
 
  useEffect(() => {
    loadItems();
    const sub = supabase.channel('action-items-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'action_items'}, loadItems)
      .subscribe();
    return () => sub.unsubscribe();
  }, []);
 
  const visible = useMemo(() => {
    let list = items;
    if (filterStatus === 'active') list = list.filter(i => i.status !== 'completed');
    else if (filterStatus === 'completed') list = list.filter(i => i.status === 'completed');
    if (filterPriority !== 'all') list = list.filter(i => i.priority === filterPriority);
    if (filterAssignee === 'mine') list = list.filter(i => i.assigned_to === currentUser || i.created_by === currentUser);
    else if (filterAssignee !== 'all') list = list.filter(i => i.assigned_to === filterAssignee);
    if (search) list = list.filter(i =>
      (i.title||'').toLowerCase().includes(search.toLowerCase()) ||
      (i.patient_name||'').toLowerCase().includes(search.toLowerCase())
    );
    return list.sort((a,b) => {
      const po = (PRIORITY_META[a.priority]?.order||9) - (PRIORITY_META[b.priority]?.order||9);
      if (po !== 0) return po;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [items, filterStatus, filterPriority, filterAssignee, search, currentUser]);
 
  // KPIs
  const active     = items.filter(i => i.status !== 'completed');
  const mine       = active.filter(i => i.assigned_to === currentUser);
  const overdue    = active.filter(i => i.due_date && new Date(i.due_date+'T12:00:00') < new Date());
  const critical   = active.filter(i => i.priority === 'critical');
  const escalated  = active.filter(i => i.status === 'escalated');
 
  // By assignee breakdown
  const byAssignee = useMemo(() => {
    const groups = {};
    active.forEach(i => {
      const name = i.assigned_to || 'Unassigned';
      if (!groups[name]) groups[name] = { total:0, critical:0, overdue:0 };
      groups[name].total++;
      if (i.priority === 'critical') groups[name].critical++;
      if (i.due_date && new Date(i.due_date+'T12:00:00') < new Date()) groups[name].overdue++;
    });
    return Object.entries(groups).sort((a,b) => b[1].total - a[1].total);
  }, [active]);
 
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:60, color:B.lightGray, fontFamily:"'DM Sans',sans-serif" }}>
      Loading action items...
    </div>
  );
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
 
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:B.black, marginBottom:4 }}>📋 Action List</div>
          <div style={{ fontSize:13, color:B.gray }}>
            {active.length} open · {mine.length} assigned to me · {overdue.length > 0 ? <span style={{ color:B.danger, fontWeight:700 }}>{overdue.length} overdue</span> : '0 overdue'}
          </div>
        </div>
        <button onClick={()=>{ setEditItem(null); setShowModal(true); }}
          style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:10, color:'#fff', padding:'10px 20px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:8 }}>
          ➕ New Action
        </button>
      </div>
 
      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Open', value:active.length, color:B.red, icon:'📋', filter:()=>setFilterStatus('active') },
          { label:'My Actions', value:mine.length, color:B.blue, icon:'👤', filter:()=>setFilterAssignee('mine') },
          { label:'Overdue', value:overdue.length, color:B.danger, icon:'⏰', alert:overdue.length>0, filter:()=>{ setFilterStatus('active'); setFilterAssignee('all'); } },
          { label:'Critical', value:critical.length, color:B.danger, icon:'🚨', alert:critical.length>0, filter:()=>{ setFilterPriority('critical'); setFilterAssignee('all'); } },
          { label:'Escalated', value:escalated.length, color:B.purple, icon:'⚡', alert:escalated.length>0, filter:()=>{ setFilterStatus('active'); setFilterAssignee('all'); } },
        ].map(k=>(
          <div key={k.label} onClick={k.filter} style={{ background:k.alert?`${k.color}08`:B.card, border:`1.5px solid ${k.alert?k.color:B.border}`, borderRadius:12, padding:'14px', textAlign:'center', cursor:'pointer', transition:'all 0.15s', boxShadow:k.alert?`0 2px 8px ${k.color}20`:'none' }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:B.gray, marginTop:4 }}>{k.label}</div>
          </div>
        ))}
      </div>
 
      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${B.border}`, marginBottom:16 }}>
        {[
          { key:'list', label:'📋 All Actions' },
          { key:'board', label:'👥 By Person' },
        ].map(t=>(
          <button key={t.key} onClick={()=>setActiveTab(t.key)}
            style={{ background:'none', border:'none', borderBottom:`2px solid ${activeTab===t.key?B.red:'transparent'}`, color:activeTab===t.key?B.red:B.gray, padding:'10px 18px', fontSize:13, fontWeight:activeTab===t.key?700:400, cursor:'pointer', fontFamily:'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>
 
      {/* List tab */}
      {activeTab==='list'&&(
        <>
          {/* Filters */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search actions or patients..."
              style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:200 }} />
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="active">Active Only</option>
              <option value="all">All Items</option>
              <option value="completed">Completed</option>
            </select>
            <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Priorities</option>
              {Object.entries(PRIORITY_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filterAssignee} onChange={e=>setFilterAssignee(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="mine">My Actions</option>
              <option value="all">All Staff</option>
              {ALL_STAFF.map(n=><option key={n} value={n}>{n.split(' ')[0]}</option>)}
            </select>
            <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visible.length} items</span>
          </div>
 
          {/* Action cards */}
          {visible.length === 0 ? (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'40px', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>✅</div>
              <div style={{ fontSize:15, fontWeight:700, color:B.black, marginBottom:6 }}>
                {filterStatus==='active'&&filterAssignee==='mine' ? 'No open actions assigned to you' : 'No actions match these filters'}
              </div>
              <div style={{ fontSize:13, color:B.gray }}>
                {filterStatus==='active'&&filterAssignee==='mine' ? 'You\'re all caught up!' : 'Try adjusting the filters above'}
              </div>
            </div>
          ) : (
            <div>
              {visible.map(item=>(
                <ActionCard key={item.id} item={item} currentUser={currentUser} isLeader={isLeader}
                  onUpdate={loadItems} onEdit={i=>{ setEditItem(i); setShowModal(true); }} />
              ))}
            </div>
          )}
        </>
      )}
 
      {/* By Person tab */}
      {activeTab==='board'&&(
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
          {byAssignee.map(([name, stats])=>(
            <div key={name} style={{ background:B.card, border:`1.5px solid ${stats.critical>0||stats.overdue>0?B.danger:B.border}`, borderRadius:14, padding:'16px 18px', boxShadow:stats.critical>0?`0 2px 8px ${B.danger}15`:'none' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:`linear-gradient(135deg,${B.red},${B.darkRed})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                    {name[0]?.toUpperCase()||'?'}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{name.split(' ')[0]} {name.split(' ')[1]?name.split(' ')[1][0]+'.':''}</div>
                </div>
                <div style={{ fontSize:22, fontWeight:800, color:B.red, fontFamily:"'DM Mono',monospace" }}>{stats.total}</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {stats.critical > 0 && <span style={{ fontSize:10, background:'#FEF2F2', color:B.danger, border:'1px solid #FECACA', borderRadius:10, padding:'2px 8px', fontWeight:700 }}>🚨 {stats.critical} critical</span>}
                {stats.overdue > 0  && <span style={{ fontSize:10, background:'#FFF7ED', color:B.orange, border:'1px solid #FED7AA', borderRadius:10, padding:'2px 8px', fontWeight:700 }}>⏰ {stats.overdue} overdue</span>}
                {stats.critical===0&&stats.overdue===0&&<span style={{ fontSize:10, color:B.lightGray }}>On track</span>}
              </div>
              <button onClick={()=>{ setFilterAssignee(name); setActiveTab('list'); }}
                style={{ marginTop:10, width:'100%', background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'6px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                View Actions →
              </button>
            </div>
          ))}
          {byAssignee.length===0&&(
            <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'40px', color:B.lightGray, fontSize:13 }}>No open actions yet — create one above</div>
          )}
        </div>
      )}
 
      {/* Modal */}
      {showModal&&(
        <ActionModal
          action={editItem}
          currentUser={currentUser}
          onSave={()=>{ loadItems(); setShowModal(false); setEditItem(null); }}
          onClose={()=>{ setShowModal(false); setEditItem(null); }}
        />
      )}
    </div>
  );
}

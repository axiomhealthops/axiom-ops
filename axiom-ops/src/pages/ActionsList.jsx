import { useState, useEffect, useMemo } from 'react';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};

// ── Business rules — all configurable ──────────────────────────
const DEFAULT_RULES = [
  { id:'soc_48',        enabled:true,  label:'SOC Pending > 48 hours',              threshold:2,   status:'soc_pending',        priority:'critical', action:'Confirm evaluation is scheduled. Contact coordinator to move forward.',              payer:null },
  { id:'auth_7',        enabled:true,  label:'Auth Pending > 7 days',               threshold:7,   status:'auth_pending',        priority:'critical', action:'Follow up with insurance. Check if additional clinical info was requested.',         payer:null },
  { id:'active_auth_5', enabled:true,  label:'Active-Auth Pending > 5 days',        threshold:5,   status:'active_auth_pending', priority:'critical', action:'Patient is treating without confirmed auth. Escalate immediately.',                  payer:null },
  { id:'eval_72',       enabled:true,  label:'Eval Pending > 72 hours',             threshold:3,   status:'eval_pending',        priority:'high',     action:'Confirm eval date is booked. Coordinator must schedule within 72hrs of referral.',   payer:null },
  { id:'onhold_30',     enabled:true,  label:'On Hold > 30 days',                   threshold:30,  status:'on_hold',             priority:'high',     action:'Review hold reason. Contact patient to assess if ready to return to treatment.',    payer:null },
  { id:'onhold_fac_14', enabled:true,  label:'On Hold - Facility > 14 days',        threshold:14,  status:'on_hold_facility',    priority:'high',     action:'Check discharge status. Patient may be ready to return to home care.',             payer:null },
  { id:'waitlist_5',    enabled:true,  label:'Waitlist > 5 days',                   threshold:5,   status:'waitlist',            priority:'medium',   action:'Contact patient to confirm interest and schedule evaluation.',                      payer:null },
  { id:'hosp_7',        enabled:true,  label:'Hospitalized > 7 days',               threshold:7,   status:'hospitalized',        priority:'medium',   action:'Verify readmission risk. Ensure hold documentation is complete.',                  payer:null },
  { id:'soc_7',         enabled:true,  label:'SOC Pending > 7 days (escalate)',     threshold:7,   status:'soc_pending',         priority:'critical', action:'ESCALATE — SOC pending over 7 days. Director review required.',                   payer:null },
];

const PRIORITY_META = {
  critical: { color:B.danger,  bg:'#FEF2F2', border:'#FECACA', icon:'🔴', label:'Critical' },
  high:     { color:B.orange,  bg:'#FFF7ED', border:'#FED7AA', icon:'🟠', label:'High'     },
  medium:   { color:B.yellow,  bg:'#FFFBEB', border:'#FDE68A', icon:'🟡', label:'Medium'   },
  low:      { color:B.blue,    bg:'#EFF6FF', border:'#BFDBFE', icon:'🔵', label:'Low'      },
};

function getPayer(ref) {
  const r = (ref||'').toUpperCase();
  if (r.startsWith('HU')) return 'Humana';
  if (r.startsWith('CP')) return 'CarePlus';
  if (r.startsWith('MED')||r.startsWith('DH')) return 'Medicare/Devoted';
  if (r.startsWith('FHC')) return 'FL Health Care Plans';
  if (r.startsWith('AM')||r.startsWith('AC')) return 'Aetna';
  if (r.startsWith('CIG')) return 'Cigna';
  if (r.startsWith('HF')) return 'HealthFirst';
  return 'Other';
}

export default function ActionList({ censusData, hasCensus }) {
  const today = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const [rules, setRules]         = useState(() => { try { return JSON.parse(localStorage.getItem('axiom_action_rules')||'null') || DEFAULT_RULES; } catch{return DEFAULT_RULES;} });
  const [notes, setNotes]         = useState(() => { try { return JSON.parse(localStorage.getItem('axiom_action_notes')||'{}'); } catch{return {};} });
  const [completed, setCompleted] = useState(() => { try { return JSON.parse(localStorage.getItem(`axiom_actions_done_${new Date().toDateString()}`)||'{}'); } catch{return {};} });
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterPayer, setFilterPayer]       = useState('all');
  const [showRules, setShowRules]           = useState(false);
  const [editRule, setEditRule]             = useState(null);

  const saveRules = (r) => { setRules(r); try { localStorage.setItem('axiom_action_rules', JSON.stringify(r)); } catch{} };
  const saveNote  = (id, text) => { const n = {...notes,[id]:text}; setNotes(n); try { localStorage.setItem('axiom_action_notes', JSON.stringify(n)); } catch{} };
  const toggleDone = (id) => {
    const c = {...completed,[id]:!completed[id]};
    setCompleted(c);
    try { localStorage.setItem(`axiom_actions_done_${new Date().toDateString()}`, JSON.stringify(c)); } catch{}
  };

  // ── Generate action items from census + rules ────────────────
  const actionItems = useMemo(() => {
    if (!hasCensus || !censusData?.patients) return [];
    const items = [];

    censusData.patients.forEach(patient => {
      if (!patient.daysInStatus && patient.daysInStatus !== 0) return;
      const days = patient.daysInStatus;
      const payer = getPayer(patient.ref);

      rules.filter(r => r.enabled && r.status === patient.status && days >= r.threshold)
        .forEach(rule => {
          const id = `${rule.id}_${patient.name}`;
          items.push({
            id,
            patient:  patient.name,
            region:   patient.region,
            status:   patient.status,
            payer,
            days,
            priority: rule.priority,
            ruleLabel: rule.label,
            action:   rule.action,
            disc:     patient.disc,
          });
        });
    });

    // Sort: critical first, then by days descending
    const order = { critical:0, high:1, medium:2, low:3 };
    return items.sort((a,b) => order[a.priority] - order[b.priority] || b.days - a.days);
  }, [censusData, rules, hasCensus]);

  const filtered = actionItems
    .filter(i => filterPriority === 'all' || i.priority === filterPriority)
    .filter(i => filterPayer === 'all' || i.payer === filterPayer)
    .filter(i => !completed[i.id]);

  const doneItems = actionItems.filter(i => completed[i.id]);
  const payers = [...new Set(actionItems.map(i => i.payer))].sort();

  const critCount   = actionItems.filter(i => i.priority==='critical' && !completed[i.id]).length;
  const highCount   = actionItems.filter(i => i.priority==='high'     && !completed[i.id]).length;
  const medCount    = actionItems.filter(i => i.priority==='medium'   && !completed[i.id]).length;
  const doneCount   = doneItems.length;

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", maxWidth:900 }}>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>📋 Director Action List</h1>
            <p style={{ fontSize:13, color:B.gray, margin:0 }}>{today} · Generated from live census data</p>
          </div>
          <button onClick={() => setShowRules(p=>!p)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'7px 14px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
            ⚙️ Configure Rules
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Critical', count:critCount,   ...PRIORITY_META.critical },
          { label:'High',     count:highCount,    ...PRIORITY_META.high     },
          { label:'Medium',   count:medCount,     ...PRIORITY_META.medium   },
          { label:'Completed Today', count:doneCount, color:B.green, bg:'#F0FDF4', border:'#BBF7D0', icon:'✅' },
        ].map(s => (
          <div key={s.label} onClick={() => setFilterPriority(s.label.toLowerCase() === 'completed today' ? 'all' : (filterPriority === s.label.toLowerCase() ? 'all' : s.label.toLowerCase()))}
            style={{ background:s.bg, border:`1px solid ${filterPriority===s.label.toLowerCase()?s.color:s.border}`, borderRadius:12, padding:'14px 16px', textAlign:'center', cursor:'pointer', transition:'all 0.15s' }}>
            <div style={{ fontSize:28, fontWeight:800, color:s.color, fontFamily:'monospace' }}>{s.count}</div>
            <div style={{ fontSize:11, color:s.color, textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.icon} {s.label}</div>
          </div>
        ))}
      </div>

      {!hasCensus && (
        <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'20px 24px', fontSize:13, color:B.blue, marginBottom:20 }}>
          ℹ️ Upload your patient census in <strong>Data Uploads</strong> to generate today's action list.
        </div>
      )}

      {/* Rules editor */}
      {showRules && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:16 }}>⚙️ Action Rules — Edit Thresholds & Enable/Disable</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {rules.map((rule, idx) => {
              const meta = PRIORITY_META[rule.priority];
              return (
                <div key={rule.id} style={{ display:'grid', gridTemplateColumns:'32px 1fr 80px 100px 80px', gap:10, alignItems:'center', padding:'10px 12px', background:B.bg, borderRadius:8, border:`1px solid ${B.border}` }}>
                  <input type="checkbox" checked={rule.enabled} onChange={e => { const r=[...rules]; r[idx]={...r[idx],enabled:e.target.checked}; saveRules(r); }} style={{ width:16, height:16, cursor:'pointer' }} />
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:rule.enabled?B.black:B.lightGray }}>{rule.label}</div>
                    <div style={{ fontSize:11, color:B.lightGray, marginTop:1 }}>{rule.action.slice(0,80)}...</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <input type="number" min="1" max="365" value={rule.threshold}
                      onChange={e => { const r=[...rules]; r[idx]={...r[idx],threshold:parseInt(e.target.value)||1}; saveRules(r); }}
                      style={{ width:50, padding:'4px 6px', border:`1px solid ${B.border}`, borderRadius:6, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none' }} />
                    <span style={{ fontSize:11, color:B.lightGray }}>days</span>
                  </div>
                  <select value={rule.priority} onChange={e => { const r=[...rules]; r[idx]={...r[idx],priority:e.target.value}; saveRules(r); }}
                    style={{ padding:'4px 6px', border:`1px solid ${B.border}`, borderRadius:6, fontSize:11, fontFamily:'inherit', color:meta.color, outline:'none', background:meta.bg }}>
                    {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button onClick={() => saveRules(rules.filter((_,i)=>i!==idx))}
                    style={{ background:'none', border:`1px solid #FECACA`, borderRadius:6, color:B.danger, padding:'4px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Remove</button>
                </div>
              );
            })}
          </div>
          <button onClick={() => saveRules([...rules, { id:`custom_${Date.now()}`, enabled:true, label:'New Rule', threshold:7, status:'on_hold', priority:'medium', action:'Custom action' }])}
            style={{ marginTop:12, background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'8px 14px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
            + Add Custom Rule
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <select value={filterPayer} onChange={e => setFilterPayer(e.target.value)}
          style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
          <option value="all">All Payers</option>
          {payers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <span style={{ fontSize:12, color:B.lightGray, marginLeft:'auto' }}>
          {filtered.length} action{filtered.length!==1?'s':''} requiring attention
        </span>
      </div>

      {/* Action items */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.length === 0 && hasCensus && (
          <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'24px', textAlign:'center' }}>
            <div style={{ fontSize:24, marginBottom:8 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:B.green }}>All clear for {filterPriority !== 'all' ? filterPriority : 'today'}</div>
            <div style={{ fontSize:12, color:B.green, marginTop:4 }}>No patients are breaching configured thresholds</div>
          </div>
        )}

        {filtered.map(item => {
          const meta = PRIORITY_META[item.priority];
          const noteKey = item.id;
          return (
            <div key={item.id} style={{ background:B.card, border:`1.5px solid ${meta.border}`, borderLeft:`5px solid ${meta.color}`, borderRadius:12, padding:'16px 20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div style={{ flex:1 }}>
                  {/* Priority + rule label */}
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, flexWrap:'wrap' }}>
                    <span style={{ background:meta.bg, color:meta.color, border:`1px solid ${meta.border}`, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                      {meta.icon} {meta.label}
                    </span>
                    <span style={{ fontSize:11, color:B.lightGray }}>{item.ruleLabel}</span>
                  </div>

                  {/* Patient info */}
                  <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>{item.patient}</div>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:10 }}>
                    {[
                      { label:'Payer', value:item.payer, color:B.blue },
                      { label:'Region', value:item.region, color:B.red },
                      { label:'Days in Status', value:`${item.days}d`, color:item.days>14?B.danger:B.yellow },
                      { label:'Discipline', value:(item.disc||'').replace('LYMPHEDEMA ',''), color:B.gray },
                    ].map(f => (
                      <div key={f.label} style={{ fontSize:11 }}>
                        <span style={{ color:B.lightGray }}>{f.label}: </span>
                        <span style={{ fontWeight:700, color:f.color }}>{f.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Action */}
                  <div style={{ background:meta.bg, border:`1px solid ${meta.border}`, borderRadius:8, padding:'10px 12px', marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:meta.color, marginBottom:4 }}>REQUIRED ACTION</div>
                    <div style={{ fontSize:12, color:B.black, lineHeight:1.6 }}>{item.action}</div>
                  </div>

                  {/* Note field */}
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <input value={notes[noteKey]||''} onChange={e => saveNote(noteKey, e.target.value)}
                      placeholder="Add note (who you called, what was said, next step)..."
                      style={{ flex:1, padding:'7px 10px', border:`1px solid ${B.border}`, borderRadius:6, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black }} />
                    <button onClick={() => toggleDone(item.id)} style={{
                      background: completed[item.id] ? B.green : 'transparent',
                      border:`1.5px solid ${completed[item.id] ? B.green : B.border}`,
                      borderRadius:8, color: completed[item.id] ? '#fff' : B.gray,
                      padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
                    }}>
                      {completed[item.id] ? '✓ Done' : 'Mark Done'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completed items (collapsible) */}
      {doneCount > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.lightGray, marginBottom:10 }}>
            ✅ Completed today ({doneCount})
          </div>
          {doneItems.map(item => (
            <div key={item.id} style={{ background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:10, padding:'10px 16px', marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center', opacity:0.7 }}>
              <div>
                <span style={{ fontSize:12, fontWeight:600, color:B.black }}>{item.patient}</span>
                <span style={{ fontSize:11, color:B.lightGray, marginLeft:8 }}>{item.ruleLabel}</span>
                {notes[item.id] && <div style={{ fontSize:11, color:B.gray, marginTop:2 }}>Note: {notes[item.id]}</div>}
              </div>
              <button onClick={() => toggleDone(item.id)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

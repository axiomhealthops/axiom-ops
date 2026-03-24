import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};

const CHECKLIST = [
  { id:'pariox_comments',  time:'9:00 AM',  title:'Check & Respond to Pariox Comments',        desc:'Log into Pariox, review all open comments and respond to any outstanding items from clinicians or staff.',                                             urgent:true  },
  { id:'zero_one_report',  time:'9:30 AM',  title:'Run 0-1 Report',                             desc:'Generate the 0-1 report in Pariox. Flag any patients with 0 or 1 visits who are at risk of falling off the schedule.',                                urgent:true  },
  { id:'missed_cancelled', time:'10:00 AM', title:'Follow Up on Missed & Cancelled Visits',     desc:'Review all missed/cancelled visits from yesterday. Confirm clinicians submitted visit notes. Reschedule any outstanding visits.',                      urgent:true  },
  { id:'evals_scheduled',  time:'11:00 AM', title:'Verify Evaluations & Visit Plotting',        desc:'Confirm all pending evaluations are scheduled. Verify visits are plotted correctly in the system for the coming week.',                                urgent:false },
  { id:'activation_review',time:'12:00 PM', title:'Activation Review',                          desc:'Review Waitlist, SOC Pending, On Hold, and Auth Pending patients. Identify anyone ready to activate and take action.',                                urgent:false },
  { id:'eod_charts',       time:'4:30 PM',  title:'End-of-Day Chart Compliance Check',          desc:'Verify all scheduled visits for today have submitted notes. Flag any missing submissions to clinicians before end of day.',                           urgent:false },
];

const SECTIONS = [
  { id:'checklist',   label:'Daily Tasks',      icon:'✅' },
  { id:'visits',      label:'Visit Activity',   icon:'📅' },
  { id:'calls',       label:'Call Log',         icon:'📞' },
  { id:'escalations', label:'Escalations',      icon:'🚨' },
  { id:'activation',  label:'Activation',       icon:'🔄' },
  { id:'notes',       label:'Daily Notes',      icon:'📝' },
];

const EMPTY_FORM = {
  // Visit activity
  visitsScheduled:0, visitsCompleted:0, visitsMissed:0, visitsCancelled:0,
  // Charts
  chartsDue:0, chartsSubmitted:0, chartsMissing:0, chartComments:'',
  // Calls
  callsOutbound:0, callsInbound:0, callsVoicemail:0,
  // Escalations
  escalations:[],
  // Activation
  activationsCompleted:0, activationAttempts:0, activationNotes:'',
  waitlistContacted:0, socScheduled:0, onHoldReturned:0, authsSubmitted:0,
  // Notes
  narrative:'', blockers:'', wins:'', tomorrowPriority:'',
};

const today = new Date().toISOString().split('T')[0];
const todayLabel = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

export default function CoordinatorApp({ previewMode }) {
  const { profile, signOut } = useAuth();
  const [activeSection, setActiveSection] = useState('checklist');
  const [checklist, setChecklist]         = useState(() => { try { return JSON.parse(localStorage.getItem(`checklist_${today}`)||'{}'); } catch{return {};} });
  const [form, setForm]                   = useState(EMPTY_FORM);
  const [escalations, setEscalations]     = useState([]);
  const [newEsc, setNewEsc]               = useState({ patient:'', issue:'', action:'', priority:'medium' });
  const [submitting, setSubmitting]       = useState(false);
  const [submitted, setSubmitted]         = useState(false);
  const [existingReport, setExistingReport] = useState(null);
  const [time, setTime]                   = useState(new Date());

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (profile && !previewMode) loadExistingReport(); }, [profile]);

  async function loadExistingReport() {
    const { data } = await supabase.from('daily_reports')
      .select('*').eq('coordinator_id', profile.id).eq('report_date', today).single();
    if (data) {
      setExistingReport(data);
      setSubmitted(true);
      try { const saved = JSON.parse(data.notes||'{}'); setForm(f => ({...f, ...saved})); } catch{}
    }
  }

  const setField = (k, v) => setForm(p => ({...p, [k]: v}));
  const toggleChecklist = (id) => {
    const updated = { ...checklist, [id]: checklist[id] ? null : new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) };
    setChecklist(updated);
    try { localStorage.setItem(`checklist_${today}`, JSON.stringify(updated)); } catch{}
  };

  const checklistDone = CHECKLIST.filter(i => checklist[i.id]).length;
  const checklistPct  = Math.round(checklistDone / CHECKLIST.length * 100);

  const addEscalation = () => {
    if (!newEsc.patient || !newEsc.issue) return;
    setEscalations(p => [...p, { ...newEsc, id: Date.now(), time: new Date().toLocaleTimeString() }]);
    setNewEsc({ patient:'', issue:'', action:'', priority:'medium' });
  };

  async function handleSubmit() {
    if (previewMode) return;
    setSubmitting(true);
    const payload = {
      coordinator_id: profile.id,
      report_date: today,
      report_type: 'daily',
      visits_completed: form.visitsCompleted,
      visits_scheduled: form.visitsScheduled,
      missed_visits: form.visitsMissed,
      tasks_open: form.chartsMissing + escalations.filter(e=>!e.resolved).length,
      tasks_completed_today: form.chartsSubmitted + escalations.filter(e=>e.resolved).length,
      notes: JSON.stringify({ ...form, checklist, escalations }),
    };
    if (existingReport) {
      await supabase.from('daily_reports').update(payload).eq('id', existingReport.id);
    } else {
      const { data } = await supabase.from('daily_reports').insert(payload).select().single();
      setExistingReport(data);
    }
    setSubmitted(true);
    setSubmitting(false);
  }

  // ── Preview mode (shown to super admin) ──────────────────────
  if (previewMode) {
    return (
      <div style={{ fontFamily:"'DM Sans', sans-serif", maxWidth:640, margin:'0 auto' }}>
        <div style={{ background:'#1A1A1A', borderRadius:12, padding:'14px 20px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ color:'#fff', fontSize:13, fontWeight:600 }}>👁 Coordinator View Preview</div>
          <div style={{ color:'#9CA3AF', fontSize:12 }}>Showing form structure · Region {profile?.region || 'All'}</div>
        </div>
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'28px' }}>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
            <div style={{ fontSize:16, fontWeight:800, color:B.black }}>Daily Report — {todayLabel}</div>
            <div style={{ fontSize:12, color:B.gray, marginTop:4 }}>Coordinator portal · 6 sections · Submit by 5:00 PM</div>
          </div>
          {SECTIONS.map(s => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom:`1px solid ${B.border}` }}>
              <span style={{ fontSize:18 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{s.label}</div>
                <div style={{ fontSize:11, color:B.gray }}>
                  {s.id==='checklist' && '5 timed tasks · 9:00 AM – 4:30 PM'}
                  {s.id==='visits' && 'Scheduled, completed, missed, cancelled counts'}
                  {s.id==='calls' && 'Outbound, inbound, voicemail tracking'}
                  {s.id==='escalations' && 'Patient issues requiring director attention'}
                  {s.id==='activation' && 'Waitlist, SOC, on-hold, auth activity'}
                  {s.id==='notes' && 'Daily narrative, blockers, wins, tomorrow priorities'}
                </div>
              </div>
            </div>
          ))}
          <div style={{ marginTop:16, textAlign:'center', fontSize:11, color:B.lightGray }}>
            Full form interaction available when logged in as coordinator · Region {profile?.region || 'All'}
          </div>
        </div>
      </div>
    );
  }

  // ── Full coordinator app ──────────────────────────────────────
  const now = time;
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ minHeight:'100vh', background:B.bg, fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@500&display=swap');* { box-sizing:border-box; }`}</style>

      {/* Header */}
      <div style={{ background:`linear-gradient(135deg, ${B.darkRed}, ${B.red})`, padding:'20px 24px', color:'#fff' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', maxWidth:700, margin:'0 auto' }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>AxiomHealth Care Coordination</div>
            <div style={{ fontSize:20, fontWeight:800, marginBottom:2 }}>{greeting}, {profile?.name?.split(' ')[0] || 'Coordinator'}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)' }}>{todayLabel} · Region {profile?.region || 'All'}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>
              {now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}
            </div>
            {submitted ? (
              <div style={{ fontSize:11, color:'#86EFAC', fontWeight:600, marginTop:4 }}>✓ Report submitted</div>
            ) : (
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:4 }}>Submit by 5:00 PM</div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ maxWidth:700, margin:'16px auto 0' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,0.75)', marginBottom:5 }}>
            <span>Daily checklist: {checklistDone}/{CHECKLIST.length} complete</span>
            <span>{checklistPct}%</span>
          </div>
          <div style={{ height:5, background:'rgba(255,255,255,0.2)', borderRadius:3 }}>
            <div style={{ height:'100%', width:`${checklistPct}%`, background: checklistPct===100?'#86EFAC':'#fff', borderRadius:3, transition:'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ background:B.card, borderBottom:`1px solid ${B.border}`, overflowX:'auto' }}>
        <div style={{ display:'flex', maxWidth:700, margin:'0 auto', padding:'0 8px' }}>
          {SECTIONS.map(s => {
            const isActive = activeSection === s.id;
            const isDone = s.id==='checklist' ? checklistPct===100 : false;
            return (
              <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                padding:'12px 16px', border:'none', borderBottom:`3px solid ${isActive?B.red:'transparent'}`,
                background:'none', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap',
                color: isActive ? B.red : B.gray, fontWeight: isActive ? 700 : 400, fontSize:12,
                display:'flex', alignItems:'center', gap:6, transition:'all 0.15s',
              }}>
                {s.icon}
                <span>{s.label}</span>
                {isDone && <span style={{ width:6, height:6, borderRadius:'50%', background:B.green }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:700, margin:'0 auto', padding:'20px 16px' }}>

        {/* ── CHECKLIST ── */}
        {activeSection === 'checklist' && (
          <div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>✅ Daily Task Checklist</div>
              <div style={{ fontSize:12, color:B.gray }}>Complete each task in order. Times are deadlines — red means overdue.</div>
            </div>
            {CHECKLIST.map(item => {
              const checked   = !!checklist[item.id];
              const [h,m]     = item.time.replace(' AM','').replace(' PM','').split(':').map(Number);
              const isPM      = item.time.includes('PM') && h !== 12;
              const deadline  = new Date(); deadline.setHours(isPM ? h+12 : h, m, 0, 0);
              const isLate    = !checked && now > deadline;
              const borderCol = checked ? B.green : isLate ? B.danger : B.yellow;
              return (
                <div key={item.id} onClick={() => toggleChecklist(item.id)}
                  style={{ background:B.card, border:`1.5px solid ${borderCol}`, borderRadius:12,
                    padding:'16px 18px', marginBottom:10, cursor:'pointer', transition:'all 0.15s',
                    opacity: checked ? 0.75 : 1 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', border:`2px solid ${borderCol}`,
                      background: checked ? borderCol : 'transparent', display:'flex', alignItems:'center',
                      justifyContent:'center', flexShrink:0, marginTop:1 }}>
                      {checked && <span style={{ color:'#fff', fontSize:13 }}>✓</span>}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:B.black, textDecoration:checked?'line-through':'none' }}>{item.title}</div>
                        <span style={{ fontSize:10, fontWeight:700, color:'#fff', background:borderCol, borderRadius:10, padding:'2px 8px', marginLeft:8, flexShrink:0, whiteSpace:'nowrap' }}>
                          {checked ? `✓ ${checklist[item.id]}` : isLate ? `⚠ ${item.time}` : item.time}
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:B.gray, lineHeight:1.5 }}>{item.desc}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {checklistDone === CHECKLIST.length && (
              <div style={{ background:'#F0FDF4', border:'1.5px solid #86EFAC', borderRadius:12, padding:'16px 18px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:800, color:B.green }}>🎉 All daily tasks complete!</div>
                <div style={{ fontSize:12, color:B.green, marginTop:4 }}>Great work — now complete the rest of your daily report.</div>
              </div>
            )}
          </div>
        )}

        {/* ── VISIT ACTIVITY ── */}
        {activeSection === 'visits' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>📅 Visit Activity</div>
            <div style={{ fontSize:12, color:B.gray, marginBottom:16 }}>Enter today's visit counts from your Pariox schedule</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              {[
                { key:'visitsScheduled',  label:'Scheduled Today',  color:B.blue,   icon:'📅', desc:'Total on your schedule' },
                { key:'visitsCompleted',  label:'Completed',         color:B.green,  icon:'✅', desc:'Submitted notes' },
                { key:'visitsMissed',     label:'Missed / No-Show',  color:B.danger, icon:'❌', desc:'Patient not available' },
                { key:'visitsCancelled',  label:'Cancelled',         color:B.yellow, icon:'⚠️', desc:'Cancelled by patient/clinician' },
              ].map(f => (
                <div key={f.key} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'16px' }}>
                  <div style={{ fontSize:11, color:B.gray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>{f.icon} {f.label}</div>
                  <input type="number" min="0" value={form[f.key]} onChange={e => setField(f.key, parseInt(e.target.value)||0)}
                    style={{ width:'100%', fontSize:32, fontWeight:800, color:f.color, fontFamily:"'DM Mono', monospace",
                      border:'none', outline:'none', background:'transparent', padding:0 }} />
                  <div style={{ fontSize:11, color:B.lightGray, marginTop:4 }}>{f.desc}</div>
                </div>
              ))}
            </div>

            <div style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'16px', marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:B.black, marginBottom:12 }}>📋 Chart Compliance</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:12 }}>
                {[
                  { key:'chartsDue',       label:'Charts Due',     color:B.gray  },
                  { key:'chartsSubmitted', label:'Submitted',      color:B.green },
                  { key:'chartsMissing',   label:'Missing',        color:B.danger },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize:10, color:B.gray, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{f.label}</div>
                    <input type="number" min="0" value={form[f.key]} onChange={e => setField(f.key, parseInt(e.target.value)||0)}
                      style={{ width:'100%', fontSize:26, fontWeight:800, color:f.color, fontFamily:"'DM Mono', monospace",
                        border:`1px solid ${B.border}`, borderRadius:8, padding:'8px 10px', outline:'none', background:B.bg }} />
                  </div>
                ))}
              </div>
              <textarea value={form.chartComments} onChange={e => setField('chartComments', e.target.value)}
                placeholder="Notes on missing charts — which clinicians, which patients..."
                rows={2} style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${B.border}`, borderRadius:8,
                  fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black }} />
            </div>
          </div>
        )}

        {/* ── CALL LOG ── */}
        {activeSection === 'calls' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>📞 Call Activity</div>
            <div style={{ fontSize:12, color:B.gray, marginBottom:16 }}>Track all patient and clinician communication</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[
                { key:'callsOutbound', label:'Outbound Calls', icon:'📤', color:B.blue, desc:'Calls you made' },
                { key:'callsInbound',  label:'Inbound Calls',  icon:'📥', color:B.green, desc:'Calls received' },
                { key:'callsVoicemail',label:'Voicemails Left',icon:'📨', color:B.yellow, desc:'Left message' },
              ].map(f => (
                <div key={f.key} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'18px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>{f.icon}</div>
                  <input type="number" min="0" value={form[f.key]} onChange={e => setField(f.key, parseInt(e.target.value)||0)}
                    style={{ width:'100%', fontSize:36, fontWeight:800, color:f.color, fontFamily:"'DM Mono', monospace",
                      border:'none', outline:'none', background:'transparent', textAlign:'center' }} />
                  <div style={{ fontSize:11, fontWeight:600, color:B.black, marginTop:4 }}>{f.label}</div>
                  <div style={{ fontSize:10, color:B.lightGray }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ESCALATIONS ── */}
        {activeSection === 'escalations' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>🚨 Escalations</div>
            <div style={{ fontSize:12, color:B.gray, marginBottom:16 }}>Log any patient issues that require director attention or follow-up</div>

            {/* Add escalation form */}
            <div style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'18px', marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:B.black, marginBottom:12 }}>+ Add Escalation</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <div>
                  <label style={{ fontSize:10, color:B.gray, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Patient Name</label>
                  <input value={newEsc.patient} onChange={e => setNewEsc(p=>({...p,patient:e.target.value}))} placeholder="Last, First"
                    style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', color:B.black }} />
                </div>
                <div>
                  <label style={{ fontSize:10, color:B.gray, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:4 }}>Priority</label>
                  <select value={newEsc.priority} onChange={e => setNewEsc(p=>({...p,priority:e.target.value}))}
                    style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:B.black }}>
                    <option value="low">🟡 Low</option>
                    <option value="medium">🟠 Medium</option>
                    <option value="high">🔴 High — Director Attention Required</option>
                  </select>
                </div>
              </div>
              <textarea value={newEsc.issue} onChange={e => setNewEsc(p=>({...p,issue:e.target.value}))} placeholder="Describe the issue in detail..."
                rows={2} style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'none', color:B.black, marginBottom:8 }} />
              <textarea value={newEsc.action} onChange={e => setNewEsc(p=>({...p,action:e.target.value}))} placeholder="Action taken or recommended next steps..."
                rows={2} style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none', resize:'none', color:B.black, marginBottom:10 }} />
              <button onClick={addEscalation} disabled={!newEsc.patient || !newEsc.issue}
                style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:8,
                  color:'#fff', padding:'9px 20px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  opacity:(!newEsc.patient||!newEsc.issue)?0.5:1 }}>
                Add Escalation
              </button>
            </div>

            {/* Escalation list */}
            {escalations.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px', color:B.lightGray, fontSize:13, background:B.card, border:`1px solid ${B.border}`, borderRadius:12 }}>
                No escalations logged today
              </div>
            ) : escalations.map(e => {
              const colors = { low:{color:B.yellow,label:'Low'}, medium:{color:B.orange,label:'Medium'}, high:{color:B.danger,label:'High'} };
              const c = colors[e.priority] || colors.medium;
              return (
                <div key={e.id} style={{ background:B.card, border:`1.5px solid ${c.color}30`, borderLeft:`4px solid ${c.color}`, borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:B.black }}>{e.patient}</div>
                    <span style={{ fontSize:10, fontWeight:700, color:c.color, background:`${c.color}15`, borderRadius:10, padding:'2px 8px' }}>{c.label}</span>
                  </div>
                  <div style={{ fontSize:12, color:B.gray, marginBottom:4 }}><strong>Issue:</strong> {e.issue}</div>
                  {e.action && <div style={{ fontSize:12, color:B.gray, marginBottom:4 }}><strong>Action:</strong> {e.action}</div>}
                  <div style={{ fontSize:10, color:B.lightGray }}>Logged at {e.time}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── ACTIVATION REVIEW ── */}
        {activeSection === 'activation' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>🔄 Activation Review</div>
            <div style={{ fontSize:12, color:B.gray, marginBottom:16 }}>Track patient activation activity — getting patients off hold and into active treatment</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              {[
                { key:'waitlistContacted',  label:'Waitlist Contacted',   icon:'📋', color:B.purple || '#7C3AED', desc:'Waitlist patients reached today' },
                { key:'socScheduled',       label:'SOC Visits Scheduled', icon:'📅', color:B.blue, desc:'Start of care appointments booked' },
                { key:'onHoldReturned',     label:'On-Hold Returned',     icon:'▶️', color:B.green, desc:'Patients returned from hold to active' },
                { key:'authsSubmitted',     label:'Auths Submitted',      icon:'🔒', color:B.yellow, desc:'New authorization requests submitted' },
              ].map(f => (
                <div key={f.key} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'16px' }}>
                  <div style={{ fontSize:11, color:B.gray, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>{f.icon} {f.label}</div>
                  <input type="number" min="0" value={form[f.key]} onChange={e => setField(f.key, parseInt(e.target.value)||0)}
                    style={{ width:'100%', fontSize:32, fontWeight:800, color:f.color, fontFamily:"'DM Mono', monospace",
                      border:'none', outline:'none', background:'transparent', padding:0 }} />
                  <div style={{ fontSize:11, color:B.lightGray, marginTop:4 }}>{f.desc}</div>
                </div>
              ))}
            </div>

            <div style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'16px' }}>
              <label style={{ fontSize:12, fontWeight:700, color:B.black, display:'block', marginBottom:8 }}>Activation Notes</label>
              <textarea value={form.activationNotes} onChange={e => setField('activationNotes', e.target.value)}
                placeholder="Which patients did you contact? Any notable progress or barriers with activations..."
                rows={4} style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${B.border}`, borderRadius:8,
                  fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black }} />
            </div>
          </div>
        )}

        {/* ── DAILY NOTES ── */}
        {activeSection === 'notes' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:B.black, marginBottom:4 }}>📝 Daily Notes</div>
            <div style={{ fontSize:12, color:B.gray, marginBottom:16 }}>End-of-day summary for the director</div>

            {[
              { key:'narrative',        label:'Daily Narrative',         placeholder:'Summarize today — what happened, what you worked on, any notable patient interactions...', rows:4 },
              { key:'blockers',         label:'Blockers & Issues',        placeholder:'What got in the way today? Any systemic issues, clinician problems, or patient situations that need attention?', rows:3 },
              { key:'wins',             label:'Wins & Progress',          placeholder:'What went well? Any patients activated, issues resolved, or processes improved?', rows:3 },
              { key:'tomorrowPriority', label:'Tomorrow\'s Top Priorities', placeholder:'What are your top 3 priorities for tomorrow morning?', rows:3 },
            ].map(f => (
              <div key={f.key} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'16px', marginBottom:12 }}>
                <label style={{ fontSize:12, fontWeight:700, color:B.black, display:'block', marginBottom:8 }}>{f.label}</label>
                <textarea value={form[f.key]} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} rows={f.rows}
                  style={{ width:'100%', padding:'10px 12px', border:`1.5px solid ${B.border}`, borderRadius:8,
                    fontSize:13, fontFamily:'inherit', outline:'none', resize:'vertical', color:B.black }} />
              </div>
            ))}
          </div>
        )}

        {/* ── SUBMIT ── */}
        <div style={{ marginTop:24, background:B.card, border:`1.5px solid ${B.border}`, borderRadius:14, padding:'20px' }}>
          {submitted ? (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:15, fontWeight:800, color:B.green }}>Report submitted for {todayLabel}</div>
              <div style={{ fontSize:12, color:B.gray, marginTop:4 }}>The director can see your report in real time. You can update it until 5:00 PM.</div>
              <button onClick={handleSubmit} disabled={submitting} style={{ marginTop:12, background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'8px 16px', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                {submitting ? 'Updating...' : '↻ Update Report'}
              </button>
            </div>
          ) : (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:13, color:B.gray, marginBottom:12 }}>
                Checklist: <strong style={{ color:checklistPct===100?B.green:B.yellow }}>{checklistDone}/{CHECKLIST.length}</strong> · Ready to submit?
              </div>
              <button onClick={handleSubmit} disabled={submitting}
                style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:10,
                  color:'#fff', padding:'13px 36px', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'inherit',
                  boxShadow:'0 4px 14px rgba(217,79,43,0.35)', opacity:submitting?0.7:1, width:'100%' }}>
                {submitting ? 'Submitting...' : '📤 Submit Daily Report'}
              </button>
            </div>
          )}
        </div>

        {/* Sign out */}
        <div style={{ textAlign:'center', marginTop:16 }}>
          <button onClick={signOut} style={{ background:'none', border:'none', color:B.lightGray, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
const COORD_REGIONS = {
  'Gypsy Renos':      ['A'],
  'Mary Imperio':     ['B','C','G'],
  'Audrey Sarmiento': ['H','J','M','N'],
  'April Manalo':     ['T','V'],
};
const ALL_REGIONS = ['A','B','C','G','H','J','M','N','T','V'];
const REGION_COLORS = ['#D94F2B','#1565C0','#059669','#7C3AED','#D97706','#0284C7','#DC2626','#E8763A','#0891B2','#65A30D'];
 
function CompletionBar({ completed, scheduled, height=6 }) {
  const pct   = scheduled > 0 ? Math.round(completed/scheduled*100) : 0;
  const color = pct >= 85 ? B.green : pct >= 70 ? B.yellow : B.danger;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height, background:'rgba(0,0,0,0.07)', borderRadius:height/2 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:height/2 }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, minWidth:34, textAlign:'right' }}>{pct}%</span>
    </div>
  );
}
 
export default function CareCoordVisitSchedule() {
  const { profile } = useAuth();
  const coordinatorName = profile?.full_name || profile?.name || '';
  const assignedRegions = COORD_REGIONS[coordinatorName] || [];
  const isPreview       = assignedRegions.length === 0;
  const myRegions       = isPreview ? ALL_REGIONS : assignedRegions;
 
  const [expandedClinician, setExpandedClinician] = useState(null);
 
  const csvData = useMemo(() => {
    try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch { return null; }
  }, []);
 
  // Build region data scoped to my regions
  const myRegionData = useMemo(() => {
    if (!csvData?.regionData) return [];
    const allRegionColors = Object.fromEntries(
      Object.keys(csvData.regionData).sort().map((r,i) => [r, REGION_COLORS[i % REGION_COLORS.length]])
    );
    return myRegions
      .filter(r => csvData.regionData[r])
      .map(region => {
        const rd = csvData.regionData[region];
        const clinicians = (rd.clinicianList||[]).map(c => ({
          name:      c.name,
          scheduled: c.scheduled,
          completed: c.completed,
          missed:    Math.max(0, c.scheduled - c.completed),
          patients:  c.patients || 0,
        })).sort((a,b) => b.missed - a.missed || b.scheduled - a.scheduled);
 
        return {
          region,
          color:     allRegionColors[region] || B.red,
          scheduled: rd.scheduled || 0,
          completed: rd.completed || 0,
          missed:    clinicians.reduce((s,c)=>s+c.missed,0),
          clinicians,
        };
      });
  }, [csvData, myRegions]);
 
  const totals = useMemo(() => myRegionData.reduce(
    (s,r) => ({ scheduled:s.scheduled+r.scheduled, completed:s.completed+r.completed, missed:s.missed+r.missed }),
    { scheduled:0, completed:0, missed:0 }
  ), [myRegionData]);
 
  const overallRate = totals.scheduled > 0 ? Math.round(totals.completed/totals.scheduled*100) : 0;
 
  if (!csvData) return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>📅 Visit Schedule</div>
      <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'40px', textAlign:'center', marginTop:16 }}>
        <div style={{ fontSize:32, marginBottom:10 }}>📅</div>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No visit data loaded</div>
        <div style={{ fontSize:13, color:B.gray }}>Ask your director to upload the latest Pariox visit export.</div>
      </div>
    </div>
  );
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>📅 Visit Schedule</div>
        <div style={{ fontSize:13, color:B.gray }}>
          {isPreview ? 'All Regions (Preview)' : `Your regions: ${myRegions.join(', ')}`}
          {' · '}{totals.scheduled} visits · {totals.completed} completed · {totals.missed > 0 ? <span style={{ color:B.danger, fontWeight:700 }}>{totals.missed} missed</span> : '0 missed'}
        </div>
      </div>
 
      {/* Summary banner */}
      <div style={{ background:`linear-gradient(135deg,${B.darkRed},${B.red},${B.orange})`, borderRadius:14, padding:'16px 22px', marginBottom:20, display:'flex', gap:28, flexWrap:'wrap', alignItems:'center', boxShadow:'0 4px 12px rgba(139,26,16,0.15)' }}>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:3 }}>My Regions — Weekly Schedule</div>
          <div style={{ fontSize:38, fontWeight:800, color:'#fff', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{totals.scheduled}</div>
          <div style={{ marginTop:8, height:4, background:'rgba(255,255,255,0.2)', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${overallRate}%`, background:'#fff', borderRadius:2 }} />
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:3 }}>{overallRate}% completion</div>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          {[
            { label:'Completed', value:totals.completed, color:'#BBF7D0' },
            { label:'Missed',    value:totals.missed,    color:totals.missed>0?'#FCA5A5':'#BBF7D0' },
            { label:'Regions',   value:myRegionData.length, color:'#fff' },
          ].map((s,i)=>(
            <div key={s.label} style={{ textAlign:'center', paddingLeft:i>0?16:0, borderLeft:i>0?'1px solid rgba(255,255,255,0.2)':'none' }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
 
      {/* Missed visits alert */}
      {totals.missed > 0 && (
        <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, padding:'11px 16px', marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.danger }}>
            ❌ {totals.missed} missed visit{totals.missed!==1?'s':''} in your regions this week — follow up to reschedule
          </div>
        </div>
      )}
 
      {/* Region sections */}
      {myRegionData.map(r => (
        <div key={r.region} style={{ background:B.card, border:`1.5px solid ${r.missed>0?`${B.danger}30`:B.border}`, borderRadius:14, marginBottom:12, overflow:'hidden' }}>
          {/* Region header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:`1px solid ${B.border}`, background:`${r.color}08` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:8, background:r.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                {r.region}
              </div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:B.black }}>Region {r.region}</div>
                <div style={{ fontSize:11, color:B.gray }}>{r.clinicians.length} clinician{r.clinicians.length!==1?'s':''}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              <div style={{ width:120 }}><CompletionBar completed={r.completed} scheduled={r.scheduled} /></div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:18, fontWeight:800, color:B.black, fontFamily:"'DM Mono',monospace" }}>{r.scheduled}</div>
                <div style={{ fontSize:9, color:B.lightGray }}>visits</div>
              </div>
              {r.missed > 0 && (
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:800, color:B.danger, fontFamily:"'DM Mono',monospace" }}>{r.missed}</div>
                  <div style={{ fontSize:9, color:B.lightGray }}>missed</div>
                </div>
              )}
            </div>
          </div>
 
          {/* Clinician rows */}
          <div style={{ padding:'8px 12px' }}>
            {r.clinicians.map(c => {
              const key = `${r.region}::${c.name}`;
              const isOpen = expandedClinician === key;
              return (
                <div key={c.name} style={{ border:`1px solid ${c.missed>0?`${B.danger}30`:B.border}`, borderRadius:10, marginBottom:6, overflow:'hidden' }}>
                  <div onClick={()=>setExpandedClinician(isOpen?null:key)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', background:isOpen?B.bg:'transparent' }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:`${r.color}20`, border:`1.5px solid ${r.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:r.color, flexShrink:0 }}>
                      {c.name[0]?.toUpperCase()||'?'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:B.black, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
                      <div style={{ fontSize:10, color:B.gray }}>{c.patients} patient{c.patients!==1?'s':''} · {c.scheduled} visit{c.scheduled!==1?'s':''}</div>
                    </div>
                    <div style={{ display:'flex', gap:12, alignItems:'center', flexShrink:0 }}>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:13, fontWeight:700, color:B.green, fontFamily:'monospace' }}>{c.completed}</div>
                        <div style={{ fontSize:9, color:B.lightGray }}>done</div>
                      </div>
                      {c.missed > 0 && (
                        <div style={{ textAlign:'center' }}>
                          <div style={{ fontSize:13, fontWeight:800, color:B.danger, fontFamily:'monospace' }}>{c.missed}</div>
                          <div style={{ fontSize:9, color:B.lightGray }}>missed</div>
                        </div>
                      )}
                      <div style={{ width:60 }}><CompletionBar completed={c.completed} scheduled={c.scheduled} height={4} /></div>
                      <span style={{ fontSize:10, color:B.lightGray }}>{isOpen?'▲':'▼'}</span>
                    </div>
                  </div>
 
                  {isOpen && (
                    <div style={{ borderTop:`1px solid ${B.border}`, padding:'12px 14px', background:'#FDFAF9' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:c.missed>0?10:0 }}>
                        {[
                          { label:'Scheduled', value:c.scheduled, color:B.black  },
                          { label:'Completed', value:c.completed, color:B.green  },
                          { label:'Missed',    value:c.missed,    color:c.missed>0?B.danger:B.lightGray },
                        ].map(s=>(
                          <div key={s.label} style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:8, padding:'8px', textAlign:'center' }}>
                            <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace" }}>{s.value}</div>
                            <div style={{ fontSize:9, color:B.lightGray, textTransform:'uppercase', marginTop:2 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      {c.missed > 0 && (
                        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'8px 12px', fontSize:12, color:B.danger, fontWeight:600 }}>
                          ⚠️ {c.missed} missed visit{c.missed!==1?'s':''} — contact clinician and patient to reschedule
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
 
      {myRegionData.length === 0 && (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'40px', textAlign:'center' }}>
          <div style={{ fontSize:13, color:B.lightGray }}>No visit data for your regions in the current Pariox export</div>
        </div>
      )}
    </div>
  );
}
 

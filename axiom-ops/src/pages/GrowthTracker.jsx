import { useState } from 'react';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
const STATUS_COLORS = {
  active:'#16A34A', active_auth_pending:'#E8763A', auth_pending:'#D97706',
  soc_pending:'#0284C7', eval_pending:'#1565C0', waitlist:'#7C3AED',
  on_hold:'#6B7280', on_hold_facility:'#9CA3AF', on_hold_pt:'#9CA3AF',
  on_hold_md:'#9CA3AF', hospitalized:'#DC2626', discharge:'#BBA8A4',
};
 
export default function GrowthTracker() {
  const censusData = (() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} })();
  const snapshots  = (() => { try { const s=localStorage.getItem('axiom_weekly_snapshots'); return s?JSON.parse(s):[]; } catch{return [];} })();
  const settings   = (() => { try { const s=localStorage.getItem('axiom_settings'); return s?JSON.parse(s):null; } catch{return null;} })();
  const CFG = settings || { activeCensusTarget:500, visitTarget:800 };
 
  const [showAddSnapshot, setShowAddSnapshot] = useState(false);
  const [snapshotNote, setSnapshotNote]        = useState('');
 
  const activeCensus  = censusData?.activeCensus || 0;
  const totalCensus   = censusData?.total || 0;
  const pctToTarget   = CFG.activeCensusTarget > 0 ? Math.round(activeCensus/CFG.activeCensusTarget*100) : 0;
 
  const statusGroups = {
    'Active Treatment': (censusData?.counts?.active||0) + (censusData?.counts?.active_auth_pending||0),
    'Pending Start':    (censusData?.counts?.soc_pending||0) + (censusData?.counts?.eval_pending||0) + (censusData?.counts?.auth_pending||0),
    'Waitlist':         censusData?.counts?.waitlist || 0,
    'On Hold':          ['on_hold','on_hold_facility','on_hold_pt','on_hold_md'].reduce((s,k)=>s+(censusData?.counts?.[k]||0),0),
    'Hospitalized':     censusData?.counts?.hospitalized || 0,
    'Discharged':       censusData?.counts?.discharge || 0,
  };
 
  const saveSnapshot = () => {
    if (!censusData) return;
    const snap = {
      date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
      timestamp: Date.now(),
      activeCensus,
      totalCensus,
      counts: censusData.counts,
      note: snapshotNote.trim() || null,
    };
    const updated = [...snapshots, snap].slice(-52); // keep 52 weeks
    localStorage.setItem('axiom_weekly_snapshots', JSON.stringify(updated));
    setSnapshotNote('');
    setShowAddSnapshot(false);
    window.location.reload();
  };
 
  const recentSnaps = [...snapshots].reverse().slice(0,12);
  const growth = snapshots.length >= 2
    ? snapshots[snapshots.length-1].activeCensus - snapshots[snapshots.length-2].activeCensus
    : null;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>📈 Growth Tracker</div>
          <div style={{ fontSize:13, color:B.gray }}>Census growth over time · {censusData ? `Last updated ${censusData.lastUpdated}` : 'Upload census to begin tracking'}</div>
        </div>
        {censusData && (
          <button onClick={()=>setShowAddSnapshot(p=>!p)}
            style={{ background:`linear-gradient(135deg,${B.red},${B.darkRed})`, border:'none', borderRadius:10, color:'#fff', padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            📸 Save Snapshot
          </button>
        )}
      </div>
 
      {!censusData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📈</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>No census data yet</div>
          <div style={{ fontSize:13, color:B.gray }}>Upload your Pariox patient census in Data Uploads to start tracking growth.</div>
        </div>
      ) : (
        <>
          {/* Snapshot save panel */}
          {showAddSnapshot && (
            <div style={{ background:'#FFF7ED', border:'1.5px solid #FED7AA', borderRadius:12, padding:'16px 18px', marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:B.orange, marginBottom:10 }}>Save current census snapshot</div>
              <div style={{ display:'flex', gap:10 }}>
                <input value={snapshotNote} onChange={e=>setSnapshotNote(e.target.value)} placeholder="Optional note (e.g. 'Week 12 — post restructure')"
                  style={{ flex:1, padding:'8px 12px', border:`1px solid ${B.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', outline:'none' }} />
                <button onClick={saveSnapshot} style={{ background:B.green, border:'none', borderRadius:8, color:'#fff', padding:'8px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                <button onClick={()=>setShowAddSnapshot(false)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:8, color:B.gray, padding:'8px 12px', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
              </div>
            </div>
          )}
 
          {/* Census hero */}
          <div style={{ background:`linear-gradient(135deg,${B.darkRed},${B.red},${B.orange})`, borderRadius:16, padding:'22px 28px', marginBottom:20, boxShadow:'0 4px 16px rgba(139,26,16,0.2)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', inset:0, opacity:0.05, backgroundImage:'radial-gradient(circle,#fff 1px,transparent 1px)', backgroundSize:'20px 20px' }} />
            <div style={{ position:'relative', display:'flex', gap:32, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:4 }}>Active Census</div>
                <div style={{ fontSize:52, fontWeight:800, color:'#fff', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{activeCensus}</div>
                <div style={{ marginTop:10 }}>
                  <div style={{ height:5, background:'rgba(255,255,255,0.2)', borderRadius:3, marginBottom:5 }}>
                    <div style={{ height:'100%', width:`${Math.min(pctToTarget,100)}%`, background:'#fff', borderRadius:3 }} />
                  </div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>{pctToTarget}% of {CFG.activeCensusTarget} target · {CFG.activeCensusTarget-activeCensus} to go</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:24 }}>
                {[
                  { label:'Total Census', value:totalCensus },
                  { label:'Week-over-Week', value:growth===null?'—':(growth>=0?`+${growth}`:String(growth)) },
                  { label:'Snapshots', value:snapshots.length },
                ].map((s,i)=>(
                  <div key={s.label} style={{ textAlign:'center', paddingLeft:i>0?20:0, borderLeft:i>0?'1px solid rgba(255,255,255,0.2)':'none' }}>
                    <div style={{ fontSize:26, fontWeight:800, color:s.label==='Week-over-Week'&&growth!==null?(growth>=0?'#86EFAC':'#FCA5A5'):'#fff', fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{s.value}</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
 
          {/* Status breakdown */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            {Object.entries(statusGroups).map(([label, count])=>{
              const pct = totalCensus > 0 ? Math.round(count/totalCensus*100) : 0;
              const color = label==='Active Treatment'?B.green:label==='Pending Start'?B.blue:label==='On Hold'?B.gray:label==='Hospitalized'?B.danger:label==='Waitlist'?'#7C3AED':B.lightGray;
              return (
                <div key={label} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:B.gray }}>{label}</div>
                    <div style={{ fontSize:10, color:color, background:`${color}15`, borderRadius:10, padding:'1px 7px', fontWeight:700 }}>{pct}%</div>
                  </div>
                  <div style={{ fontSize:28, fontWeight:800, color, fontFamily:"'DM Mono',monospace", lineHeight:1, marginBottom:8 }}>{count}</div>
                  <div style={{ height:4, background:'rgba(0,0,0,0.06)', borderRadius:2 }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:2 }} />
                  </div>
                </div>
              );
            })}
          </div>
 
          {/* Snapshot history */}
          {recentSnaps.length > 0 && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:`1px solid ${B.border}`, fontSize:14, fontWeight:700 }}>📸 Snapshot History</div>
              <div style={{ display:'grid', gridTemplateColumns:'120px 80px 80px 1fr', padding:'8px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Date','Active','Total','Note'].map(h=>(
                  <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                ))}
              </div>
              {recentSnaps.map((snap,i)=>{
                const prev = recentSnaps[i+1];
                const delta = prev ? snap.activeCensus - prev.activeCensus : null;
                return (
                  <div key={snap.timestamp} style={{ display:'grid', gridTemplateColumns:'120px 80px 80px 1fr', padding:'9px 18px', borderBottom:'1px solid #FAF4F2', alignItems:'center' }}>
                    <div style={{ fontSize:12, color:B.black }}>{snap.date}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:13, fontWeight:700, fontFamily:'monospace', color:B.black }}>{snap.activeCensus}</span>
                      {delta !== null && <span style={{ fontSize:10, color:delta>=0?B.green:B.danger, fontWeight:700 }}>{delta>=0?`+${delta}`:delta}</span>}
                    </div>
                    <div style={{ fontSize:12, color:B.gray, fontFamily:'monospace' }}>{snap.totalCensus}</div>
                    <div style={{ fontSize:11, color:B.lightGray }}>{snap.note || '—'}</div>
                  </div>
                );
              })}
            </div>
          )}
 
          {recentSnaps.length === 0 && (
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, padding:'32px', textAlign:'center' }}>
              <div style={{ fontSize:24, marginBottom:8 }}>📸</div>
              <div style={{ fontSize:14, fontWeight:700, color:B.black, marginBottom:6 }}>No snapshots yet</div>
              <div style={{ fontSize:13, color:B.gray }}>Click "Save Snapshot" each week to track census growth over time. Week-over-week trends will appear after 2 snapshots.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
 

import { useState, useMemo } from 'react';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
const REGION_COLORS = ['#D94F2B','#1565C0','#059669','#7C3AED','#D97706','#0284C7','#DC2626','#E8763A'];
 
export default function RegionalBreakdown() {
  const csvData    = (() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} })();
  const censusData = (() => { try { const s=localStorage.getItem('axiom_census'); return s?JSON.parse(s):null; } catch{return null;} })();
  const settings   = (() => { try { const s=localStorage.getItem('axiom_settings'); return s?JSON.parse(s):null; } catch{return null;} })();
  const CFG = settings || { avgReimbursement:90 };
 
  const [selectedRegion, setSelectedRegion] = useState(null);
 
  // Visit data by region from Pariox
  const visitsByRegion = csvData?.regionData || {};
 
  // Census by region
  const censusByRegion = censusData?.byRegion || {};
 
  // Merge into unified region list
  const allRegions = [...new Set([...Object.keys(visitsByRegion), ...Object.keys(censusByRegion)])].sort();
 
  const regionData = useMemo(() => allRegions.map((region, i) => {
    const v = visitsByRegion[region] || {};
    const c = censusByRegion[region] || {};
    const completed  = v.completed || 0;
    const scheduled  = v.scheduled || 0;
    const active     = (c.active||0) + (c.active_auth_pending||0);
    const total      = c.total || 0;
    const onHold     = (c.on_hold||0)+(c.on_hold_facility||0)+(c.on_hold_pt||0)+(c.on_hold_md||0);
    const authIssues = (c.auth_pending||0)+(c.active_auth_pending||0);
    const rate       = scheduled > 0 ? Math.round(completed/scheduled*100) : 0;
    const revenue    = completed * CFG.avgReimbursement;
    const clinicians = v.clinicians || 0;
    return { region, completed, scheduled, active, total, onHold, authIssues, rate, revenue, clinicians, color: REGION_COLORS[i % REGION_COLORS.length], clinicianList: v.clinicianList || [] };
  }), [allRegions, visitsByRegion, censusByRegion, CFG]);
 
  const fmt$ = n => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${Math.round(n)}`;
  const totals = regionData.reduce((s,r)=>({ completed:s.completed+r.completed, scheduled:s.scheduled+r.scheduled, active:s.active+r.active, total:s.total+r.total, revenue:s.revenue+r.revenue }), {completed:0,scheduled:0,active:0,total:0,revenue:0});
 
  const noData = allRegions.length === 0;
  const selected = selectedRegion ? regionData.find(r=>r.region===selectedRegion) : null;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>🗺️ Regional Breakdown</div>
        <div style={{ fontSize:13, color:B.gray }}>
          {allRegions.length > 0 ? `${allRegions.length} active regions · ${totals.active} active patients · ${totals.completed} visits completed` : 'Upload Pariox data and census to see regional breakdown'}
        </div>
      </div>
 
      {noData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🗺️</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>No regional data yet</div>
          <div style={{ fontSize:13, color:B.gray }}>Upload your Pariox export and patient census to see performance by region.</div>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Active Regions', value:allRegions.length, color:B.red, icon:'🗺️' },
              { label:'Active Patients', value:totals.active, color:B.green, icon:'👥' },
              { label:'Visits Completed', value:totals.completed, color:B.blue, icon:'✅' },
              { label:'Total Revenue', value:fmt$(totals.revenue), color:B.orange, icon:'💰' },
            ].map(k=>(
              <div key={k.label} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:18, marginBottom:6 }}>{k.icon}</div>
                <div style={{ fontSize:26, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:11, color:B.gray, marginTop:4 }}>{k.label}</div>
              </div>
            ))}
          </div>
 
          <div style={{ display:'grid', gridTemplateColumns:selected?'1fr 340px':'1fr', gap:16 }}>
            {/* Region table */}
            <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 70px 70px 80px 80px 60px', padding:'8px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
                {['Region','Active Pts','Total','On Hold','Completed','Revenue','Rate'].map(h=>(
                  <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
                ))}
              </div>
              {regionData.map(r => (
                <div key={r.region} onClick={()=>setSelectedRegion(selectedRegion===r.region?null:r.region)}
                  style={{ display:'grid', gridTemplateColumns:'1fr 70px 70px 70px 80px 80px 60px', padding:'11px 18px', borderBottom:'1px solid #FAF4F2', alignItems:'center', cursor:'pointer', background:selectedRegion===r.region?'#FFF5F2':'transparent' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:r.color, flexShrink:0 }} />
                    <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{r.region}</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:B.green, fontFamily:'monospace' }}>{r.active||'—'}</div>
                  <div style={{ fontSize:12, color:B.gray, fontFamily:'monospace' }}>{r.total||'—'}</div>
                  <div style={{ fontSize:12, color:r.onHold>0?B.orange:B.lightGray, fontFamily:'monospace' }}>{r.onHold||0}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:B.black, fontFamily:'monospace' }}>{r.completed||'—'}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:B.red, fontFamily:"'DM Mono',monospace" }}>{r.revenue>0?fmt$(r.revenue):'—'}</div>
                  <div>
                    {r.rate > 0 ? (
                      <span style={{ fontSize:11, fontWeight:700, color:r.rate>=85?B.green:r.rate>=70?B.yellow:B.danger }}>{r.rate}%</span>
                    ) : '—'}
                  </div>
                </div>
              ))}
              {/* Totals row */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 70px 70px 70px 80px 80px 60px', padding:'10px 18px', background:'#FBF7F6', borderTop:`1px solid ${B.border}`, alignItems:'center' }}>
                <div style={{ fontSize:11, fontWeight:700, color:B.gray }}>TOTAL</div>
                <div style={{ fontSize:13, fontWeight:800, color:B.green, fontFamily:'monospace' }}>{totals.active}</div>
                <div style={{ fontSize:12, fontWeight:700, color:B.gray, fontFamily:'monospace' }}>{totals.total}</div>
                <div style={{ fontSize:12, color:B.gray }}>—</div>
                <div style={{ fontSize:13, fontWeight:800, color:B.black, fontFamily:'monospace' }}>{totals.completed}</div>
                <div style={{ fontSize:13, fontWeight:800, color:B.red, fontFamily:"'DM Mono',monospace" }}>{fmt$(totals.revenue)}</div>
                <div style={{ fontSize:11, fontWeight:700, color:B.gray }}>{totals.scheduled>0?Math.round(totals.completed/totals.scheduled*100):0}%</div>
              </div>
            </div>
 
            {/* Region detail panel */}
            {selected && (
              <div style={{ background:B.card, border:`1.5px solid ${selected.color}`, borderRadius:14, padding:'18px', boxShadow:`0 4px 12px ${selected.color}15` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:B.black }}>{selected.region}</div>
                  <button onClick={()=>setSelectedRegion(null)} style={{ background:'none', border:`1px solid ${B.border}`, borderRadius:6, color:B.gray, padding:'4px 8px', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                  {[
                    { label:'Active Census', value:selected.active, color:B.green },
                    { label:'On Hold', value:selected.onHold, color:B.orange },
                    { label:'Auth Issues', value:selected.authIssues, color:selected.authIssues>0?B.danger:B.lightGray },
                    { label:'Clinicians', value:selected.clinicians, color:B.blue },
                    { label:'Completed', value:selected.completed, color:B.green },
                    { label:'Revenue', value:fmt$(selected.revenue), color:B.red },
                  ].map(s=>(
                    <div key={s.label} style={{ background:B.bg, borderRadius:8, padding:'10px 12px' }}>
                      <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', marginBottom:3 }}>{s.label}</div>
                      <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {selected.clinicianList.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:B.gray, textTransform:'uppercase', marginBottom:8 }}>Clinicians</div>
                    {selected.clinicianList.slice(0,8).map(c=>(
                      <div key={c.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #F0EDE9' }}>
                        <div style={{ fontSize:12, color:B.black }}>{c.name}</div>
                        <div style={{ fontSize:11, color:B.gray, fontFamily:'monospace' }}>{c.completed}/{c.scheduled} · {c.patients}pts</div>
                      </div>
                    ))}
                    {selected.clinicianList.length > 8 && <div style={{ fontSize:11, color:B.lightGray, marginTop:6 }}>+{selected.clinicianList.length-8} more</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
 

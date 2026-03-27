import { useState, useMemo } from 'react';
 
const B = {
  red:'#D94F2B', darkRed:'#8B1A10', orange:'#E8763A',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};
 
const DISC_COLORS = { PT:'#1565C0', PTA:'#0284C7', OT:'#059669', COTA:'#10B981', ST:'#7C3AED', STA:'#9333EA', RN:'#D94F2B', LPN:'#E8763A' };
 
export default function StaffDirectory() {
  const csvData   = (() => { try { const s=localStorage.getItem('axiom_pariox_data'); return s?JSON.parse(s):null; } catch{return null;} })();
  const staffDir  = (() => { try { const s=localStorage.getItem('axiom_staff_dir'); return s?JSON.parse(s):{}; } catch{return {};} })();
 
  const [search, setSearch]   = useState('');
  const [filterDisc, setFilterDisc] = useState('all');
  const [filterRegion, setFilterRegion] = useState('all');
  const [sortBy, setSortBy]   = useState('visits');
 
  // Merge Pariox staffStats with staffDir
  const staffStats = csvData?.staffStats || {};
  const allStaff = useMemo(() => {
    const merged = {};
    Object.values(staffDir).forEach(s => { merged[s.name] = { ...s }; });
    Object.values(staffStats).forEach(s => {
      merged[s.name] = { ...merged[s.name], ...s, weeklyVisits: s.totalVisits, uniquePatients: s.uniquePatients };
    });
    return Object.values(merged);
  }, [staffDir, staffStats]);
 
  const disciplines = [...new Set(allStaff.map(s=>s.discipline).filter(Boolean))].sort();
  const regions     = [...new Set(allStaff.flatMap(s=>Array.isArray(s.regions)?s.regions:[s.regions]).filter(Boolean))].sort();
 
  const visible = useMemo(() => {
    let list = allStaff;
    if (search) list = list.filter(s=>(s.name||'').toLowerCase().includes(search.toLowerCase()));
    if (filterDisc !== 'all') list = list.filter(s=>s.discipline===filterDisc);
    if (filterRegion !== 'all') list = list.filter(s=> Array.isArray(s.regions)?s.regions.includes(filterRegion):s.regions===filterRegion);
    return [...list].sort((a,b)=> {
      if (sortBy==='visits') return (b.weeklyVisits||b.totalVisits||0) - (a.weeklyVisits||a.totalVisits||0);
      if (sortBy==='name') return (a.name||'').localeCompare(b.name||'');
      if (sortBy==='patients') return (b.uniquePatients||0) - (a.uniquePatients||0);
      return 0;
    });
  }, [allStaff, search, filterDisc, filterRegion, sortBy]);
 
  const totalVisits   = allStaff.reduce((s,x)=>s+(x.weeklyVisits||x.totalVisits||0),0);
  const totalClinicians = allStaff.length;
  const avgVisits     = totalClinicians > 0 ? Math.round(totalVisits/totalClinicians) : 0;
 
  const noData = allStaff.length === 0;
 
  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", color:B.black }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>🏷️ Staff Directory</div>
        <div style={{ fontSize:13, color:B.gray }}>{csvData ? `${totalClinicians} clinicians from Pariox · ${totalVisits} visits this week` : 'Upload Pariox data to populate staff directory'}</div>
      </div>
 
      {noData ? (
        <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:16, padding:'48px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🏷️</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>No staff data yet</div>
          <div style={{ fontSize:13, color:B.gray }}>Upload your Pariox visit export to auto-populate the staff directory with clinician names, disciplines, and visit counts.</div>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Total Clinicians', value:totalClinicians, color:B.red, icon:'👨‍⚕️' },
              { label:'Total Visits', value:totalVisits, color:B.green, icon:'✅' },
              { label:'Avg Visits/Clinician', value:avgVisits, color:B.blue, icon:'📊' },
              { label:'Regions Active', value:regions.length, color:B.orange, icon:'🗺️' },
            ].map(k=>(
              <div key={k.label} style={{ background:B.card, border:`1.5px solid ${B.border}`, borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:18, marginBottom:6 }}>{k.icon}</div>
                <div style={{ fontSize:26, fontWeight:800, color:k.color, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:11, color:B.gray, marginTop:4 }}>{k.label}</div>
              </div>
            ))}
          </div>
 
          {/* Filters */}
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clinician..."
              style={{ padding:'7px 12px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', outline:'none', color:B.black, width:180 }} />
            <select value={filterDisc} onChange={e=>setFilterDisc(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Disciplines</option>
              {disciplines.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="all">All Regions</option>
              {regions.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              style={{ padding:'7px 10px', border:`1.5px solid ${B.border}`, borderRadius:8, fontSize:12, fontFamily:'inherit', color:B.black, outline:'none', background:'#fff' }}>
              <option value="visits">Sort: Visits ↓</option>
              <option value="patients">Sort: Patients ↓</option>
              <option value="name">Sort: Name A-Z</option>
            </select>
            <span style={{ fontSize:11, color:B.lightGray, marginLeft:'auto' }}>{visible.length} clinicians</span>
          </div>
 
          {/* Staff table */}
          <div style={{ background:B.card, border:`1px solid ${B.border}`, borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 80px 1fr', padding:'8px 18px', background:'#FBF7F6', borderBottom:`1px solid ${B.border}` }}>
              {['Clinician','Disc.','Regions','Patients','Visits'].map(h=>(
                <div key={h} style={{ fontSize:9, fontWeight:700, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>
              ))}
            </div>
            {visible.length === 0 ? (
              <div style={{ padding:'32px', textAlign:'center', color:B.lightGray, fontSize:13 }}>No clinicians match these filters</div>
            ) : visible.map(s=>{
              const discColor = DISC_COLORS[s.discipline] || B.gray;
              const visits = s.weeklyVisits || s.totalVisits || 0;
              const maxVisits = Math.max(...visible.map(x=>x.weeklyVisits||x.totalVisits||0), 1);
              return (
                <div key={s.name} style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 80px 1fr', padding:'10px 18px', borderBottom:'1px solid #FAF4F2', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:30, height:30, borderRadius:'50%', background:`${discColor}20`, border:`1.5px solid ${discColor}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:discColor, flexShrink:0 }}>
                      {s.name?.[0]?.toUpperCase()||'?'}
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{s.name}</div>
                  </div>
                  <div>
                    <span style={{ fontSize:10, fontWeight:700, color:discColor, background:`${discColor}15`, borderRadius:8, padding:'2px 7px' }}>
                      {s.discipline||'—'}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:B.gray, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {Array.isArray(s.regions) ? s.regions.slice(0,2).join(', ') : s.regions || '—'}
                  </div>
                  <div style={{ fontSize:13, fontWeight:700, color:B.black, fontFamily:'monospace' }}>{s.uniquePatients||'—'}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ flex:1, height:5, background:'rgba(0,0,0,0.06)', borderRadius:3 }}>
                      <div style={{ height:'100%', width:`${visits/maxVisits*100}%`, background:B.red, borderRadius:3 }} />
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:B.black, fontFamily:'monospace', minWidth:28 }}>{visits}</span>
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
 

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import PatientProfile from './PatientProfile';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626', blue:'#1D4ED8',
};

const PAYER_COLORS = {
  'Humana':'#0066CC','CarePlus':'#009B77','Medicare/Devoted':'#1565C0',
  'FL Health Care Plans':'#2E7D32','Aetna':'#7B1FA2','Cigna':'#E65100',
  'HealthFirst':'#00838F','Simply':'#0891B2','Medicare':'#64748B',
  'Private Pay':'#92400E','Other':'#6B7280','Unknown':'#9CA3AF',
};

const STATUS_COLORS = {
  active:B.green, active_auth_pending:'#E8763A', auth_pending:'#D97706',
  on_hold:'#6B7280', soc_pending:'#0284C7', eval_pending:B.blue,
  discharge:'#6B7280', hospitalized:B.danger,
};

export default function GlobalSearch() {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [open, setOpen]             = useState(false);
  const [selected, setSelected]     = useState(null); // patient name for profile
  const inputRef                    = useRef();
  const dropdownRef                 = useRef();
  const debounceRef                 = useRef();

  const search = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      // Search across census and auth_records simultaneously
      const [censusRes, authRes] = await Promise.all([
        supabase.from('patient_census').select('patient_name,status,region,payer').ilike('patient_name', `%${q}%`).limit(8),
        supabase.from('auth_records').select('patient_name,payer,region,auth_status,auth_number,assigned_to').ilike('patient_name', `%${q}%`).limit(8),
      ]);

      // Merge results, deduplicate by patient name
      const merged = new Map();
      for (const r of (censusRes.data||[])) {
        merged.set(r.patient_name.toLowerCase(), {
          name: r.patient_name,
          censusStatus: r.status,
          region: r.region,
          payer: r.payer,
          source: 'census',
        });
      }
      for (const r of (authRes.data||[])) {
        const key = r.patient_name.toLowerCase();
        const existing = merged.get(key) || {};
        merged.set(key, {
          ...existing,
          name: r.patient_name,
          payer: r.payer || existing.payer,
          region: r.region || existing.region,
          authStatus: r.auth_status,
          authNumber: r.auth_number,
          assignedTo: r.assigned_to,
          source: existing.source ? 'both' : 'auth',
        });
      }

      setResults([...merged.values()].slice(0, 8));
    } catch(e) {
      console.error('Search error:', e);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length >= 2) {
      setOpen(true);
      debounceRef.current = setTimeout(() => search(query), 250);
    } else {
      setResults([]);
      setOpen(false);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!dropdownRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcut: Cmd+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const openProfile = (name) => {
    setSelected(name);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      {/* Search input */}
      <div style={{ position:'relative', fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
          <span style={{ position:'absolute', left:10, fontSize:14, color:B.lightGray, pointerEvents:'none' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e=>setQuery(e.target.value)}
            onFocus={()=>query.length>=2&&setOpen(true)}
            placeholder="Search patients… ⌘K"
            style={{
              width:220, padding:'7px 10px 7px 32px',
              border:`1.5px solid ${open?'#D94F2B':'#E5E7EB'}`,
              borderRadius:10, fontSize:12, fontFamily:'inherit',
              outline:'none', color:'#1A1A1A', background:'#fff',
              transition:'border-color 0.15s',
            }}
          />
          {searching && <span style={{ position:'absolute', right:10, fontSize:11, color:B.lightGray }}>⏳</span>}
        </div>

        {/* Dropdown */}
        {open && (
          <div ref={dropdownRef} style={{
            position:'absolute', top:'calc(100% + 6px)', left:0, right:0,
            background:'#fff', border:`1px solid ${B.border}`, borderRadius:12,
            boxShadow:'0 8px 32px rgba(0,0,0,0.14)', zIndex:9999, overflow:'hidden',
            minWidth:320,
          }}>
            {results.length === 0 && !searching && query.length >= 2 && (
              <div style={{ padding:'16px', textAlign:'center', fontSize:13, color:B.lightGray }}>No patients found for "{query}"</div>
            )}
            {results.map((r, i) => {
              const payCol = PAYER_COLORS[r.payer] || B.gray;
              const statusCol = STATUS_COLORS[r.censusStatus] || B.gray;
              return (
                <div key={r.name} onClick={()=>openProfile(r.name)}
                  style={{ padding:'10px 14px', cursor:'pointer', borderBottom:i<results.length-1?`1px solid ${B.border}`:'none', display:'flex', justifyContent:'space-between', alignItems:'center', transition:'background 0.1s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#FFF5F2'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:B.black, marginBottom:3 }}>{r.name}</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                      {r.payer && <span style={{ fontSize:10, color:payCol, fontWeight:700 }}>{r.payer}</span>}
                      {r.region && <span style={{ fontSize:10, color:B.lightGray }}>· Region {r.region}</span>}
                      {r.assignedTo && <span style={{ fontSize:10, color:B.lightGray }}>· {r.assignedTo.split(' ')[0]}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0, marginLeft:8 }}>
                    {r.censusStatus && (
                      <span style={{ fontSize:9, fontWeight:700, color:statusCol, background:`${statusCol}15`, border:`1px solid ${statusCol}30`, borderRadius:10, padding:'2px 7px' }}>
                        {r.censusStatus.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                      </span>
                    )}
                    {r.authNumber && (
                      <span style={{ fontSize:9, color:B.lightGray, background:B.bg, border:`1px solid ${B.border}`, borderRadius:10, padding:'2px 7px' }}>
                        Auth ✓
                      </span>
                    )}
                    <span style={{ fontSize:11, color:B.lightGray }}>→</span>
                  </div>
                </div>
              );
            })}
            {results.length > 0 && (
              <div style={{ padding:'8px 14px', background:B.bg, fontSize:10, color:B.lightGray }}>
                Click any patient to open their full profile
              </div>
            )}
          </div>
        )}
      </div>

      {/* Patient Profile Modal */}
      {selected && (
        <PatientProfile
          patientName={selected}
          onClose={()=>setSelected(null)}
        />
      )}
    </>
  );
}

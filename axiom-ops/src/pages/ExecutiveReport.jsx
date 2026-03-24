import { useRef } from 'react';

const B = {
  red:'#D94F2B', darkRed:'#8B1A10',
  black:'#1A1A1A', gray:'#6B7280', lightGray:'#9CA3AF',
  border:'#E5E7EB', bg:'#F9FAFB', card:'#fff',
  green:'#16A34A', yellow:'#D97706', danger:'#DC2626',
  purple:'#7C3AED', blue:'#1D4ED8',
};

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1000000) return `$${(n/1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n/1000).toFixed(1)}K`;
  return `$${n}`;
}

function StatusDot({ status }) {
  const c = status === 'good' ? B.green : status === 'warn' ? B.yellow : status === 'bad' ? B.danger : B.lightGray;
  return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:c, marginRight:6 }} />;
}

function Section({ title }) {
  return (
    <div style={{ borderTop:`2px solid ${B.red}`, paddingTop:10, marginTop:24, marginBottom:14 }}>
      <div style={{ fontSize:11, fontWeight:800, color:B.red, textTransform:'uppercase', letterSpacing:'0.12em' }}>{title}</div>
    </div>
  );
}

export default function ExecutiveReport({ csvData, censusData, hasPariox, hasCensus, CFG }) {
  const reportRef = useRef();

  const handlePrint = () => window.print();

  // ── Computed metrics ─────────────────────────────────────────
  const activeCensus    = hasCensus ? censusData.activeCensus : null;
  const totalCensus     = hasCensus ? censusData.total : null;
  const onHold          = hasCensus ? (censusData.counts.on_hold||0)+(censusData.counts.on_hold_facility||0)+(censusData.counts.on_hold_pt||0)+(censusData.counts.on_hold_md||0) : null;
  const authBlocked     = hasCensus ? (censusData.counts.auth_pending||0)+(censusData.counts.active_auth_pending||0) : null;
  const socPending      = hasCensus ? (censusData.counts.soc_pending||0) : null;
  const waitlist        = hasCensus ? (censusData.counts.waitlist||0) : null;
  const hospitalized    = hasCensus ? (censusData.counts.hospitalized||0) : null;
  const scheduledVisits = hasPariox ? (csvData.dedupedCount || 0) : null;
  const completedVisits = hasPariox ? (csvData.completedVisits || 0) : null;
  const missedVisits    = hasPariox ? (csvData.missedVisits || 0) : null;
  const visitTarget     = CFG?.visitTarget || 800;
  const revenueTarget   = CFG?.revenueTarget || 200000;
  const avgRate         = CFG?.avgReimbursement || 90;
  const estRevenue      = scheduledVisits != null ? scheduledVisits * avgRate : null;
  const visitPct        = scheduledVisits != null ? Math.round(scheduledVisits/visitTarget*100) : null;
  const revenuePct      = estRevenue != null ? Math.round(estRevenue/revenueTarget*100) : null;
  const visitGap        = scheduledVisits != null ? visitTarget - scheduledVisits : null;
  const revenueGap      = estRevenue != null ? revenueTarget - estRevenue : null;
  const visitStatus     = visitPct >= 100 ? 'good' : visitPct >= 85 ? 'warn' : 'bad';
  const revenueStatus   = revenuePct >= 100 ? 'good' : revenuePct >= 85 ? 'warn' : 'bad';

  // Payer mix
  const payerMix = hasCensus ? censusData.patients.reduce((acc, p) => {
    const r = (p.ref||'').toUpperCase();
    let payer = 'Other';
    if (r.startsWith('HU')) payer = 'Humana';
    else if (r.startsWith('CP')) payer = 'CarePlus';
    else if (r.startsWith('MED')||r.startsWith('DH')) payer = 'Medicare/Devoted';
    else if (r.startsWith('FHC')) payer = 'FL Health Care Plans';
    else if (r.startsWith('AM')||r.startsWith('AC')) payer = 'Aetna';
    else if (r.startsWith('CIG')) payer = 'Cigna';
    else if (r.startsWith('HF')) payer = 'HealthFirst';
    acc[payer] = (acc[payer]||0) + 1;
    return acc;
  }, {}) : {};

  // Revenue opportunity
  const totalOpportunity = ((authBlocked||0)+(socPending||0)+(onHold||0)+(waitlist||0)) * 3 * avgRate;

  // Regions
  const regions = hasPariox ? Object.entries(csvData.regionData||{}).sort(([a],[b])=>a.localeCompare(b)) : [];
  const topRegions = regions.sort(([,a],[,b]) => b.scheduled - a.scheduled).slice(0,5);

  // Expansion data
  const expansion = (() => { try { return JSON.parse(localStorage.getItem('axiom_expansion')||'null'); } catch{return null;} })();
  const expansionStates = expansion || {
    GA:{ state:'Georgia', credentialing:60, status:'In Progress', firstPatientDate:'Q2 2026' },
    TX:{ state:'Texas',   credentialing:20, status:'Planning',    firstPatientDate:'Q3 2026' },
    NC:{ state:'North Carolina', credentialing:10, status:'Planning', firstPatientDate:'Q4 2026' },
  };

  const weekOf = 'Week of Mar 23–28, 2026';
  const printDate = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #exec-report, #exec-report * { visibility: visible; }
          #exec-report { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 0.75in; size: letter; }
        }
      `}</style>

      {/* Action bar — hidden on print */}
      <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, color:B.black, margin:0, marginBottom:4 }}>📊 Executive Report</h1>
          <p style={{ fontSize:13, color:B.gray, margin:0 }}>Weekly summary for leadership · {weekOf}</p>
        </div>
        <button onClick={handlePrint} style={{
          background:`linear-gradient(135deg, ${B.red}, ${B.darkRed})`, border:'none',
          borderRadius:10, color:'#fff', padding:'10px 22px', fontSize:13, fontWeight:700,
          cursor:'pointer', fontFamily:'inherit', boxShadow:'0 2px 8px rgba(217,79,43,0.3)',
          display:'flex', alignItems:'center', gap:8,
        }}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      {/* ── PRINTABLE REPORT ── */}
      <div id="exec-report" ref={reportRef} style={{
        background:'#fff', border:`1px solid ${B.border}`, borderRadius:16,
        padding:'40px 48px', maxWidth:800, margin:'0 auto',
        boxShadow:'0 4px 24px rgba(0,0,0,0.06)',
      }}>

        {/* Report header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, paddingBottom:20, borderBottom:`3px solid ${B.red}` }}>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:B.black, marginBottom:4 }}>AxiomHealth Management</div>
            <div style={{ fontSize:14, color:B.gray }}>Weekly Operations Report · {weekOf}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em' }}>Prepared</div>
            <div style={{ fontSize:13, fontWeight:600, color:B.black }}>{printDate}</div>
            <div style={{ fontSize:11, color:B.lightGray, marginTop:2 }}>CONFIDENTIAL</div>
          </div>
        </div>

        {/* ── SECTION 1: WEEKLY PERFORMANCE ── */}
        <Section title="Weekly Performance" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:20 }}>
          {[
            { label:'Scheduled Visits', value:scheduledVisits ?? '—', sub:`Target: ${visitTarget}`, status:visitStatus, suffix:visitPct!=null?` (${visitPct}%)`:''},
            { label:'Est. Weekly Revenue', value:estRevenue!=null?fmt(estRevenue):'—', sub:`Target: ${fmt(revenueTarget)}`, status:revenueStatus, suffix:revenuePct!=null?` (${revenuePct}%)`:''},
            { label:'Active Census', value:activeCensus ?? '—', sub:`Total in system: ${totalCensus??'—'}`, status:'good'},
            { label:'Completed Visits', value:completedVisits ?? '—', sub:`Missed: ${missedVisits??'—'}`, status:missedVisits > 5 ? 'warn' : 'good'},
          ].map(m => (
            <div key={m.label} style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:10, padding:'14px 16px' }}>
              <div style={{ fontSize:10, color:B.lightGray, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>
                <StatusDot status={m.status} />{m.label}
              </div>
              <div style={{ fontSize:24, fontWeight:800, color:B.black, fontFamily:'monospace', lineHeight:1 }}>
                {m.value}<span style={{ fontSize:12, fontWeight:400, color:B.gray }}>{m.suffix}</span>
              </div>
              <div style={{ fontSize:11, color:B.gray, marginTop:4 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Visit gap callout */}
        {visitGap != null && visitGap > 0 && (
          <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, padding:'12px 16px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:13, color:B.danger }}>
              <strong>{visitGap} visits below weekly target.</strong> At ${avgRate}/visit, this represents {fmt(visitGap * avgRate)} in unrecovered weekly revenue.
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:B.danger, fontFamily:'monospace' }}>{fmt(visitGap * avgRate)}</div>
          </div>
        )}

        {/* ── SECTION 2: PATIENT PIPELINE ── */}
        <Section title="Patient Pipeline" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20 }}>
          <div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${B.border}` }}>
                  <th style={{ textAlign:'left', padding:'6px 8px', color:B.lightGray, fontWeight:600, fontSize:10, textTransform:'uppercase' }}>Status</th>
                  <th style={{ textAlign:'right', padding:'6px 8px', color:B.lightGray, fontWeight:600, fontSize:10, textTransform:'uppercase' }}>Patients</th>
                  <th style={{ textAlign:'right', padding:'6px 8px', color:B.lightGray, fontWeight:600, fontSize:10, textTransform:'uppercase' }}>Est. Wkly Rev.</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label:'Active (billing)', count:activeCensus, color:B.green, rev:true },
                  { label:'Auth Blocked', count:authBlocked, color:B.danger, rev:true, flag:true },
                  { label:'On Hold', count:onHold, color:B.yellow, rev:true, flag:true },
                  { label:'SOC Pending', count:socPending, color:B.blue, rev:false },
                  { label:'Waitlist', count:waitlist, color:B.gray, rev:false },
                  { label:'Hospitalized', count:hospitalized, color:B.danger, rev:false },
                ].map(row => (
                  <tr key={row.label} style={{ borderBottom:`1px solid ${B.border}` }}>
                    <td style={{ padding:'8px 8px', fontSize:12, color:B.black, display:'flex', alignItems:'center' }}>
                      <StatusDot status={row.flag ? 'bad' : row.rev ? 'good' : 'warn'} />
                      {row.label}
                    </td>
                    <td style={{ padding:'8px 8px', textAlign:'right', fontWeight:700, fontFamily:'monospace', color:row.color }}>{row.count ?? '—'}</td>
                    <td style={{ padding:'8px 8px', textAlign:'right', fontSize:11, color:row.rev && row.count ? (row.flag ? B.danger : B.green) : B.lightGray }}>
                      {row.rev && row.count != null ? fmt(row.count * 3 * avgRate) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payer mix */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:B.black, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Payer Mix (Active Census)</div>
            {Object.entries(payerMix).sort(([,a],[,b])=>b-a).map(([payer, count]) => {
              const total = Object.values(payerMix).reduce((s,v)=>s+v,0);
              const pct = Math.round(count/total*100);
              const colors = { 'Humana':'#0066CC','CarePlus':'#009B77','Medicare/Devoted':'#1565C0','FL Health Care Plans':'#2E7D32','Aetna':'#7B1FA2','Cigna':'#E65100','HealthFirst':'#00838F' };
              const c = colors[payer] || B.gray;
              return (
                <div key={payer} style={{ marginBottom:6 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2, fontSize:11 }}>
                    <span style={{ color:B.black }}>{payer}</span>
                    <span style={{ fontWeight:700, color:c }}>{count} · {pct}%</span>
                  </div>
                  <div style={{ height:4, background:'#F3F4F6', borderRadius:2 }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:c, borderRadius:2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue opportunity */}
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:B.green, marginBottom:4 }}>💡 Revenue Recovery Opportunity</div>
            <div style={{ fontSize:12, color:B.gray }}>Resolving auth blocks ({authBlocked||0}), returning on-hold patients ({onHold||0}), activating SOC ({socPending||0}) and waitlist ({waitlist||0}) patients</div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0, marginLeft:20 }}>
            <div style={{ fontSize:28, fontWeight:800, color:B.green, fontFamily:'monospace' }}>+{fmt(totalOpportunity)}</div>
            <div style={{ fontSize:10, color:B.green }}>potential/week</div>
          </div>
        </div>

        {/* ── SECTION 3: REGIONAL SUMMARY ── */}
        {regions.length > 0 && (
          <>
            <Section title="Regional Performance" />
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:20 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${B.border}`, background:B.bg }}>
                  {['Region','Clinicians','Scheduled','Completed','% Done','Status'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign: h==='Region'?'left':'center', color:B.lightGray, fontWeight:600, fontSize:10, textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regions.map(([region, data]) => {
                  const pct = data.scheduled > 0 ? Math.round(data.completed/data.scheduled*100) : 0;
                  const status = pct >= 90 ? 'good' : pct >= 60 ? 'warn' : 'bad';
                  return (
                    <tr key={region} style={{ borderBottom:`1px solid ${B.border}` }}>
                      <td style={{ padding:'8px 12px', fontWeight:700, color:B.red }}>Region {region}</td>
                      <td style={{ padding:'8px 12px', textAlign:'center', color:B.gray }}>{data.clinicians}</td>
                      <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:600 }}>{data.scheduled}</td>
                      <td style={{ padding:'8px 12px', textAlign:'center', color:B.green, fontWeight:600 }}>{data.completed}</td>
                      <td style={{ padding:'8px 12px', textAlign:'center', fontWeight:700, color: pct>=90?B.green:pct>=60?B.yellow:B.danger }}>{pct}%</td>
                      <td style={{ padding:'8px 12px', textAlign:'center' }}><StatusDot status={status} />{pct>=90?'On Track':pct>=60?'Monitor':'Needs Attention'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {/* ── SECTION 4: EXPANSION ── */}
        <Section title="Expansion Status" />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:28 }}>
          {Object.entries(expansionStates).map(([key, s]) => {
            const colors = { GA:B.green, TX:B.blue, NC:B.purple };
            const c = colors[key] || B.gray;
            return (
              <div key={key} style={{ border:`1px solid ${B.border}`, borderRadius:10, overflow:'hidden' }}>
                <div style={{ background:c, padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{s.state}</div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#fff', fontFamily:'monospace' }}>{s.credentialing}%</div>
                </div>
                <div style={{ padding:'10px 14px', background:B.bg }}>
                  <div style={{ fontSize:11, color:B.gray, marginBottom:4 }}>{s.status}</div>
                  <div style={{ height:4, background:'#E5E7EB', borderRadius:2, marginBottom:6 }}>
                    <div style={{ height:'100%', width:`${s.credentialing}%`, background:c, borderRadius:2 }} />
                  </div>
                  <div style={{ fontSize:11, color:B.gray }}>First patient target: <strong>{s.firstPatientDate}</strong></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:10, color:B.lightGray }}>AxiomHealth Management · Operations Report · {printDate}</div>
          <div style={{ fontSize:10, color:B.lightGray }}>CONFIDENTIAL — For internal use only</div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useOpsData() {
  const [census, setCensus]               = useState([]);
  const [visitSchedule, setVisitSchedule] = useState([]);
  const [authRecords, setAuthRecords]     = useState([]);
  const [actionItems, setActionItems]     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [lastUpdated, setLastUpdated]     = useState(null);

  const fetchAll = useCallback(async () => {
    const [censusRes, visitsRes, authRes, actionsRes] = await Promise.all([
      supabase.from('patient_census').select('*').order('patient_name'),
      supabase.from('visit_schedule').select('*').order('visit_date'),
      supabase.from('auth_tracker').select('*').order('patient_name'),
      supabase.from('action_items').select('*').order('created_at', { ascending: false }),
    ]);
    if (censusRes.data)  setCensus(censusRes.data);
    if (visitsRes.data)  setVisitSchedule(visitsRes.data);
    if (authRes.data)    setAuthRecords(authRes.data);
    if (actionsRes.data) setActionItems(actionsRes.data);
    if (censusRes.data?.length) setLastUpdated(censusRes.data[0]?.uploaded_at || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const censusSub = supabase.channel('census-changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'patient_census' }, fetchAll).subscribe();
    const visitSub = supabase.channel('visit-changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'visit_schedule' }, fetchAll).subscribe();
    const authSub = supabase.channel('auth-changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'auth_tracker' }, fetchAll).subscribe();
    const actionSub = supabase.channel('action-changes')
      .on('postgres_changes', { event:'*', schema:'public', table:'action_items' }, fetchAll).subscribe();
    return () => {
      censusSub.unsubscribe();
      visitSub.unsubscribe();
      authSub.unsubscribe();
      actionSub.unsubscribe();
    };
  }, [fetchAll]);

  // ── Derived census metrics ──────────────────────────────────
  const censusData = census.length > 0 ? (() => {
    const counts = {
      active:0, active_auth_pending:0, auth_pending:0, soc_pending:0,
      eval_pending:0, waitlist:0, on_hold:0, on_hold_facility:0,
      on_hold_pt:0, on_hold_md:0, hospitalized:0, discharge:0, other:0,
    };
    const byRegion = {};
    const ACTIVE_STATUSES = new Set(['active','active_auth_pending']);

    const patients = census.map(row => {
      const statusKey = row.status || 'other';
      counts[statusKey] = (counts[statusKey] || 0) + 1;
      const region = row.region || '';
      if (region) {
        if (!byRegion[region]) byRegion[region] = {
          total:0, activeCensus:0, active:0, active_auth_pending:0, auth_pending:0,
          soc_pending:0, eval_pending:0, waitlist:0, on_hold:0, on_hold_facility:0,
          on_hold_pt:0, on_hold_md:0, hospitalized:0, discharge:0, other:0,
        };
        byRegion[region].total++;
        byRegion[region][statusKey] = (byRegion[region][statusKey] || 0) + 1;
        if (ACTIVE_STATUSES.has(statusKey)) byRegion[region].activeCensus++;
      }
      return {
        name: row.patient_name,
        status: statusKey,
        region: row.region,
        disc: row.notes,
        ref: row.payer,
        payer: row.payer,
        daysInStatus: null,
        id: row.id,
      };
    });

    return {
      counts, byRegion, patients,
      total: census.length,
      activeCensus: counts.active + counts.active_auth_pending,
      lastUpdated: lastUpdated
        ? new Date(lastUpdated).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
        : 'Unknown',
    };
  })() : null;

  // ── Auth records keyed by patient name ──────────────────────
  const authRecordsMap = authRecords.reduce((acc, row) => {
    acc[row.patient_name] = {
      authNumber:    row.auth_status,
      approvedVisits: 24,
      usedVisits:    0,
      approvedThru:  null,
      status:        row.auth_status || 'active',
      notes:         row.notes,
      id:            row.id,
    };
    return acc;
  }, {});

  // ── Write: upload full census ───────────────────────────────
  const uploadCensus = async (patients) => {
    if (!patients?.length) return;
    try {
      await supabase.from('patient_census').delete().gt('uploaded_at', '2000-01-01');
    } catch(e) { /* ignore if empty */ }
    const rows = patients.map(p => ({
      patient_name: p.name,
      region:       p.region || null,
      status:       p.status || 'other',
      payer:        p.ref || p.ins || null,
      notes:        p.disc || null,
      uploaded_at:  new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('patient_census').insert(rows.slice(i, i + 500));
    }
  };

  // ── Write: upload visit schedule from parsed Pariox data ────
  const uploadVisitSchedule = async (parsedData) => {
    if (!parsedData?.regionData) return;
    // Delete all existing rows — use gt to avoid empty-table errors
    try {
      await supabase.from('visit_schedule').delete().gt('uploaded_at', '2000-01-01');
    } catch(e) { /* ignore if empty */ }

    const today = new Date().toISOString().split('T')[0];
    const rows = [];

    // Build one row per clinician per region from regionData
    Object.entries(parsedData.regionData).forEach(([region, data]) => {
      (data.clinicianList || []).forEach(clinician => {
        rows.push({
          patient_name: null,
          visit_date:   today,
          status:       'scheduled',
          coordinator:  clinician.name,
          region:       region,
          notes:        `Scheduled: ${clinician.scheduled} · Completed: ${clinician.completed} · Patients: ${clinician.patients}`,
          uploaded_at:  new Date().toISOString(),
        });
      });
    });

    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('visit_schedule').insert(rows.slice(i, i + 500));
    }
  };

  // ── Write: save auth record ─────────────────────────────────
  const saveAuthRecord = async (patientName, authData) => {
    const existing = authRecords.find(r => r.patient_name === patientName);
    if (existing) {
      await supabase.from('auth_tracker').update({
        auth_status: authData.status,
        payer:       authData.payer,
        notes:       authData.lastCallNotes,
        updated_at:  new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('auth_tracker').insert({
        patient_name: patientName,
        auth_status:  authData.status,
        payer:        authData.payer,
        notes:        authData.lastCallNotes,
        updated_at:   new Date().toISOString(),
      });
    }
  };

  // ── Write: save action item ─────────────────────────────────
  const saveActionItem = async (item) => {
    await supabase.from('action_items').upsert({
      id:          item.id,
      title:       item.title,
      assigned_to: item.assignedTo,
      team:        item.team,
      priority:    item.priority,
      status:      item.status || 'open',
      due_date:    item.dueDate || null,
    });
  };

  return {
    census, visitSchedule, authRecords, authRecordsMap, actionItems,
    loading, lastUpdated,
    censusData,
    hasCensus: !!censusData && census.length > 0,
    hasVisits: visitSchedule.length > 0,
    uploadCensus, uploadVisitSchedule, saveAuthRecord, saveActionItem,
    refetch: fetchAll,
  };
}

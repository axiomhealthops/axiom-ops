import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Shared real-time data hook ─────────────────────────────────
// Used by ALL roles — director, team_leader, team_member
// Data lives in Supabase, not localStorage
// Any upload by director is instantly visible to all users

export function useOpsData() {
  const [census, setCensus]           = useState([]);
  const [visitSchedule, setVisitSchedule] = useState([]);
  const [authRecords, setAuthRecords] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ── Fetch all data ──────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [censusRes, visitsRes, authRes, actionsRes] = await Promise.all([
      supabase.from('patient_census').select('*').order('patient_name'),
      supabase.from('visit_schedule').select('*').order('visit_date'),
      supabase.from('auth_tracker').select('*').order('patient_name'),
      supabase.from('action_items').select('*').order('created_at', { ascending: false }),
    ]);
    if (censusRes.data)   setCensus(censusRes.data);
    if (visitsRes.data)   setVisitSchedule(visitsRes.data);
    if (authRes.data)     setAuthRecords(authRes.data);
    if (actionsRes.data)  setActionItems(actionsRes.data);
    if (censusRes.data?.length) {
      setLastUpdated(censusRes.data[0]?.uploaded_at || null);
    }
    setLoading(false);
  }, []);

  // ── Real-time subscriptions ─────────────────────────────────
  useEffect(() => {
    fetchAll();

    const censusSub = supabase.channel('census-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_census' }, fetchAll)
      .subscribe();

    const visitSub = supabase.channel('visit-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visit_schedule' }, fetchAll)
      .subscribe();

    const authSub = supabase.channel('auth-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auth_tracker' }, fetchAll)
      .subscribe();

    const actionSub = supabase.channel('action-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items' }, fetchAll)
      .subscribe();

    return () => {
      censusSub.unsubscribe();
      visitSub.unsubscribe();
      authSub.unsubscribe();
      actionSub.unsubscribe();
    };
  }, [fetchAll]);

  // ── Derived census metrics (matches existing PatientCensus shape) ──
  const STATUS_MAP = {
    'active': 'active',
    'active - auth pending': 'active_auth_pending',
    'active - auth pendin': 'active_auth_pending',
    'auth pending': 'auth_pending',
    'soc pending': 'soc_pending',
    'eval pending': 'eval_pending',
    'evaluation pending': 'eval_pending',
    'waitlist': 'waitlist',
    'on hold': 'on_hold',
    'on hold - facility': 'on_hold_facility',
    'on hold - pt request': 'on_hold_pt',
    'on hold - md request': 'on_hold_md',
    'hospitalized': 'hospitalized',
    'discharge': 'discharge',
  };

  const censusData = census.length > 0 ? (() => {
    const counts = {
      active: 0, active_auth_pending: 0, auth_pending: 0, soc_pending: 0,
      eval_pending: 0, waitlist: 0, on_hold: 0, on_hold_facility: 0,
      on_hold_pt: 0, on_hold_md: 0, hospitalized: 0, discharge: 0, other: 0,
    };
    const byRegion = {};
    const ACTIVE_STATUSES = new Set(['active', 'active_auth_pending']);

    const patients = census.map(row => {
      const statusKey = row.status || 'other';
      counts[statusKey] = (counts[statusKey] || 0) + 1;

      const region = row.region || '';
      if (region) {
        if (!byRegion[region]) {
          byRegion[region] = {
            total: 0, activeCensus: 0,
            active: 0, active_auth_pending: 0, auth_pending: 0, soc_pending: 0,
            eval_pending: 0, waitlist: 0, on_hold: 0, on_hold_facility: 0,
            on_hold_pt: 0, on_hold_md: 0, hospitalized: 0, discharge: 0, other: 0,
          };
        }
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
        daysInStatus: row.notes ? null : null,
        id: row.id,
      };
    });

    return {
      counts,
      byRegion,
      patients,
      total: census.length,
      activeCensus: counts.active + counts.active_auth_pending,
      lastUpdated: lastUpdated
        ? new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Unknown',
    };
  })() : null;

  // ── Auth records as a map keyed by patient name ─────────────
  const authRecordsMap = authRecords.reduce((acc, row) => {
    acc[row.patient_name] = {
      authNumber: row.auth_status,
      approvedVisits: 24,
      usedVisits: 0,
      approvedThru: null,
      status: row.auth_status || 'active',
      notes: row.notes,
      id: row.id,
    };
    return acc;
  }, {});

  // ── Write methods ───────────────────────────────────────────

  // Upload full census (called by director after CSV parse)
  const uploadCensus = async (patients) => {
    // Delete existing and insert fresh
    await supabase.from('patient_census').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (!patients?.length) return;

    const rows = patients.map(p => ({
      patient_name: p.name,
      region: p.region || null,
      status: p.status || 'other',
      payer: p.ref || p.ins || null,
      notes: p.disc || null,
      uploaded_at: new Date().toISOString(),
    }));

    // Batch insert in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('patient_census').insert(rows.slice(i, i + 500));
    }
  };

  // Upload visit schedule
  const uploadVisitSchedule = async (visits) => {
    await supabase.from('visit_schedule').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (!visits?.length) return;
    for (let i = 0; i < visits.length; i += 500) {
      await supabase.from('visit_schedule').insert(visits.slice(i, i + 500));
    }
  };

  // Save auth record for a patient
  const saveAuthRecord = async (patientName, authData) => {
    const existing = authRecords.find(r => r.patient_name === patientName);
    if (existing) {
      await supabase.from('auth_tracker').update({
        auth_status: authData.status,
        payer: authData.payer,
        notes: authData.lastCallNotes,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('auth_tracker').insert({
        patient_name: patientName,
        auth_status: authData.status,
        payer: authData.payer,
        notes: authData.lastCallNotes,
        updated_at: new Date().toISOString(),
      });
    }
  };

  // Save action item
  const saveActionItem = async (item) => {
    await supabase.from('action_items').upsert({
      id: item.id,
      title: item.title,
      assigned_to: item.assignedTo,
      team: item.team,
      priority: item.priority,
      status: item.status || 'open',
      due_date: item.dueDate || null,
    });
  };

  return {
    // Data
    census,
    visitSchedule,
    authRecords,
    authRecordsMap,
    actionItems,
    loading,
    lastUpdated,
    // Derived
    censusData,
    hasCensus: !!censusData && census.length > 0,
    hasVisits: visitSchedule.length > 0,
    // Write methods
    uploadCensus,
    uploadVisitSchedule,
    saveAuthRecord,
    saveActionItem,
    refetch: fetchAll,
  };
}

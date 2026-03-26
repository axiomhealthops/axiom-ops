import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null);
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    console.log('FETCHING PROFILE FOR:', userId);
    const { data, error } = await supabase
      .from('coordinators')
      .select('*')
      .eq('user_id', userId)
      .single();
    console.log('PROFILE DATA:', data);
    console.log('PROFILE ERROR:', error);
    setProfile(data || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // ── Role helpers ────────────────────────────────────────────
  const role        = profile?.role || 'coordinator';
  const team        = profile?.team || null;

  const isSuperAdmin  = role === 'super_admin';
  const isCEO         = role === 'ceo';
  const isDirector    = role === 'director' || isSuperAdmin;
  const isManager     = role === 'regional_mgr' || isDirector;
  const isPodLeader   = role === 'pod_leader';
  const isTeamLeader  = role === 'team_leader';
  const isTeamMember  = role === 'team_member';
  const isCoordinator = role === 'coordinator';

  // ── Permission matrix ─────────────────────────────────────
  const canViewDashboard        = ['super_admin','ceo','director','regional_mgr','admin','pod_leader','team_leader'].includes(role);
  const canViewFinancials       = ['super_admin','ceo','director'].includes(role);
  const canManageUsers          = isSuperAdmin;
  const canManageTeam           = isPodLeader || isTeamLeader;
  const canEditSettings         = ['super_admin','director'].includes(role);
  const canViewAllRegions       = ['super_admin','ceo','director'].includes(role);
  const canViewAllTeams         = isPodLeader || isDirector || isSuperAdmin;
  const userRegion              = canViewAllRegions ? null : profile?.region;
  const canViewCensus           = ['super_admin','ceo','director','regional_mgr','pod_leader','team_leader','team_member'].includes(role);
  const canViewVisitSchedule    = ['super_admin','ceo','director','regional_mgr','pod_leader','team_leader','team_member'].includes(role);
  const canViewAuthTracker      = ['super_admin','director','regional_mgr','pod_leader','team_leader'].includes(role) || (isTeamMember && team === 'auth');
  const canViewCareCoordMetrics = ['super_admin','director','regional_mgr','pod_leader','team_leader'].includes(role);
  const canSubmitReport         = ['coordinator','team_member'].includes(role);
  const canViewTeamReports      = isPodLeader || isTeamLeader || isDirector || isSuperAdmin;

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function createUser({ email, password, name, role, region, phone }) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };

    const { error: profileError } = await supabase.from('coordinators').insert({
      user_id: data.user.id,
      name,
      role,
      region: region || null,
      phone: phone || null,
      status: 'active',
      color: '#D94F2B',
    });

    return { error: profileError, userId: data.user.id };
  }

  async function updateUserStatus(profileId, status) {
    const { error } = await supabase
      .from('coordinators')
      .update({ status })
      .eq('id', profileId);
    return { error };
  }

  async function updateUserRole(profileId, newRole) {
    const { error } = await supabase
      .from('coordinators')
      .update({ role: newRole })
      .eq('id', profileId);
    return { error };
  }

  async function updateUserProfile(profileId, updates) {
    const { error } = await supabase
      .from('coordinators')
      .update(updates)
      .eq('id', profileId);
    return { error };
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      role, team,
      isSuperAdmin, isCEO, isDirector, isManager,
      isPodLeader, isTeamLeader, isTeamMember, isCoordinator,
      canViewDashboard, canViewFinancials,
      canManageUsers, canManageTeam,
      canEditSettings, canViewAllRegions, canViewAllTeams, userRegion,
      canViewCensus, canViewVisitSchedule, canViewAuthTracker,
      canViewCareCoordMetrics, canSubmitReport, canViewTeamReports,
      coordinator: profile,
      signIn, signOut,
      createUser, updateUserStatus, updateUserRole, updateUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

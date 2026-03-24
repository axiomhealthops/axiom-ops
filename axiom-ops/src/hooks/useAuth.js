import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null);
  const [profile, setProfile]     = useState(null); // full user profile from coordinators table
  const [loading, setLoading]     = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    const { data } = await supabase
      .from('coordinators')
      .select('*')
      .eq('user_id', userId)
      .single();
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
  const role         = profile?.role || 'coordinator';
  const isSuperAdmin = role === 'super_admin';
  const isCEO        = role === 'ceo';
  const isDirector   = role === 'director' || isSuperAdmin;
  const isManager    = role === 'regional_mgr' || isDirector;
  const isCoordinator = role === 'coordinator';

  // What this user can see
  const canViewDashboard   = ['super_admin','ceo','director','regional_mgr','admin'].includes(role);
  const canViewFinancials  = ['super_admin','ceo','director'].includes(role);
  const canManageUsers     = isSuperAdmin;
  const canEditSettings    = ['super_admin','director'].includes(role);
  const canViewAllRegions  = ['super_admin','ceo','director'].includes(role);
  const userRegion         = canViewAllRegions ? null : profile?.region;

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  // ── User Management (super_admin only) ──────────────────────
  async function createUser({ email, password, name, role, region, phone }) {
    // Create auth user via Supabase admin (uses service role in production)
    // For now, sign up then set profile
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };

    // Insert profile into coordinators table
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
      role, isSuperAdmin, isCEO, isDirector, isManager, isCoordinator,
      canViewDashboard, canViewFinancials, canManageUsers, canEditSettings,
      canViewAllRegions, userRegion,
      // Keep backward compat
      coordinator: profile,
      signIn, signOut,
      createUser, updateUserStatus, updateUserRole, updateUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

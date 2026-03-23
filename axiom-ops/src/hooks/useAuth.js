import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [coordinator, setCoordinator] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchCoordinator(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchCoordinator(session.user.id);
      else { setCoordinator(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchCoordinator(userId) {
    const { data } = await supabase
      .from('coordinators')
      .select('*')
      .eq('user_id', userId)
      .single();
    setCoordinator(data);
    setLoading(false);
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, coordinator, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

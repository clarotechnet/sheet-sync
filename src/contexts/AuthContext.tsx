﻿﻿﻿import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { externalSupabase } from '@/integrations/supabase/externalClient';

interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  approved: boolean;
  approved_at: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ ok: boolean; message: string }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message: string; reason?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileRef = useRef<Profile | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await externalSupabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao buscar profile:', error);
        return null;
      }
      return data as Profile | null;
    } catch (err) {
      console.error('Erro ao buscar profile:', err);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      setIsLoading(true);
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
      setIsLoading(false);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    // Set up auth state listener BEFORE getting session
    const { data: { subscription } } = externalSupabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          if (!profileRef.current) {
            setIsLoading(true);
          }
          // Use setTimeout to avoid potential race conditions
          setTimeout(async () => {
            const profileData = await fetchProfile(currentSession.user.id);
            setProfile(profileData);
            setIsLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setIsLoading(false);
        }
      }
    );

    // Get initial session
    externalSupabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!initialSession) {
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      const { data, error } = await externalSupabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      // Garante linha no profile (evita login bloqueado por ausência de profile)
      if (data?.user?.id) {
        await externalSupabase
          .from('profiles')
          .upsert(
            {
              id: data.user.id,
              email: data.user.email ?? email,
              display_name: displayName ?? null,
            },
            { onConflict: 'id' }
          );
      }

      return {
        ok: true,
        message: 'Cadastro realizado! Aguarde aprovação do administrador para acessar.',
      };
    } catch (error: any) {
      console.error('Erro no cadastro:', error);
      return {
        ok: false,
        message: error.message || 'Erro ao realizar cadastro',
      };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await externalSupabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const userId = data.user.id;

      // Checa aprovação
      const { data: profileData, error: pErr } = await externalSupabase
        .from('profiles')
        .select('approved, role, display_name')
        .eq('id', userId)
        .maybeSingle();

      if (pErr) throw pErr;

      if (!profileData?.approved) {
        // Derruba a sessão e bloqueia
        await externalSupabase.auth.signOut();
        return {
          ok: false,
          reason: 'PENDENTE',
          message: 'Seu acesso ainda não foi aprovado. Aguarde a liberação do administrador.',
        };
      }

      return { ok: true, message: 'Login realizado com sucesso!' };
    } catch (error: any) {
      console.error('Erro no login:', error);
      return {
        ok: false,
        message: error.message || 'Erro ao realizar login',
      };
    }
  };

  const signOut = async () => {
    await externalSupabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const isAdmin = profile?.role === 'admin';
  const isApproved = profile?.approved ?? false;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        isAdmin,
        isApproved,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}







'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User as SbUser } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import type { Supplier, UserProfile, AccountType } from '@/lib/types';

/* ── Unified user shape ──────────────────────────────────────────── */
export interface AuthUser {
  id:           string;
  uid:          string;
  phoneNumber:  string | null;
  displayName:  string | null;
  email:        string | null;
  authProvider: 'supabase';
}

interface AuthContextValue {
  user:            AuthUser | null;
  loading:         boolean;
  accountType:     AccountType | null;
  currentSupplier: Supplier | null;
  currentProfile:  UserProfile | null;
  signOut:         () => Promise<void>;
  refreshAccount:  () => Promise<void>;
  updateProfile:   (data: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'avatar' | 'avatarUrl' | 'bio'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Mapper ──────────────────────────────────────────────────────── */
function toSupabaseUser(sb: SbUser): AuthUser {
  return {
    id: sb.id, uid: sb.id,
    phoneNumber: sb.phone ?? null,
    displayName: (sb.user_metadata?.full_name as string | undefined) ?? sb.email ?? null,
    email: sb.email ?? null,
    authProvider: 'supabase',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,            setUser]            = useState<AuthUser | null>(null);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | null>(null);
  const [currentProfile,  setCurrentProfile]  = useState<UserProfile | null>(null);
  const [accountType,     setAccountType]     = useState<AccountType | null>(null);
  const [loading,         setLoading]         = useState(true);

  const lastResolvedUid = useRef<string | null>(null);
  // Ref mirror of accountType: the auth listener is registered once with
  // [] deps, so reading the STATE here would always see the first render's
  // null (stale closure) and the early-exit below could never fire.
  const accountTypeRef  = useRef<AccountType | null>(null);

  /** Keep the state and the ref in lockstep */
  function applyAccountType(t: AccountType | null) {
    accountTypeRef.current = t;
    setAccountType(t);
  }

  /* ── Look up Supabase profile / supplier by UID ──────────────── */
  async function resolveAccount(uid: string, sbUser?: SbUser) {
    if (lastResolvedUid.current === uid && accountTypeRef.current) return; // already resolved
    lastResolvedUid.current = uid;
    try {
      const res  = await fetch(`/api/suppliers?authUserId=${uid}`);
      const data = await res.json();
      const sup  = Array.isArray(data) ? data[0] ?? null : null;
      if (sup) {
        setCurrentSupplier(sup);
        setCurrentProfile(null);
        const t = sup.accountType === 'supplier' ? 'supplier' : sup.accountType === 'agent' ? 'agent' : 'business';
        applyAccountType(t as AccountType);
        return;
      }
    } catch { /* ignore */ }
    try {
      const res  = await fetch(`/api/profile?userId=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data?.id) { setCurrentProfile(data); setCurrentSupplier(null); applyAccountType('user'); return; }
    } catch { /* ignore */ }

    // No profile or supplier found — auto-create a profile so the user is
    // never left in a broken "no account type" state after signing up.
    if (sbUser) {
      try {
        const res = await fetch('/api/profile', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id:       uid,
            fullName: (sbUser.user_metadata?.full_name as string | undefined) ?? sbUser.email ?? '',
            phone:    sbUser.phone ?? '',
            avatar:   '👤',
          }),
        });
        if (res.ok) {
          const profile = await res.json();
          setCurrentProfile(profile);
          setCurrentSupplier(null);
          applyAccountType('user');
          return;
        }
      } catch { /* ignore — fall through to null state */ }
    }

    setCurrentSupplier(null); setCurrentProfile(null); applyAccountType(null);
  }

  /* ── Apply the current Supabase session ───────────────────────── */
  function applySession(sbUser: SbUser | null) {
    const effective = sbUser ? toSupabaseUser(sbUser) : null;

    setUser(prev => {
      // Avoid needless re-renders / re-resolves when nothing changed
      if (prev?.id === effective?.id) return prev;
      return effective;
    });

    if (effective) {
      resolveAccount(effective.id, sbUser ?? undefined);
    } else {
      lastResolvedUid.current = null;
      setCurrentSupplier(null);
      setCurrentProfile(null);
      applyAccountType(null);
    }
    setLoading(false);
  }

  /* ── Auth listener ───────────────────────────────────────────── */
  useEffect(() => {
    const sb = getSupabase();

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user ?? null);
    });

    // Safety: never let the UI hang on loading more than 8s
    const timeout = setTimeout(() => setLoading(false), 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Sign out ────────────────────────────────────────────────── */
  const signOut = async () => {
    // Clear local state immediately so the UI reflects the sign-out at once
    lastResolvedUid.current = null;
    setUser(null); setCurrentSupplier(null); setCurrentProfile(null); applyAccountType(null);
    try {
      await getSupabase().auth.signOut();
    } catch (e) {
      // The local session is cleared, but the provider session may survive
      // a refresh — surface it instead of hiding it.
      console.error('[Auth] sign-out failed; session may persist after refresh:', e);
    }
  };

  /* ── Refresh account data ────────────────────────────────────── */
  const refreshAccount = async () => {
    if (!user) return;
    lastResolvedUid.current = null; // force re-resolve
    const { data: { user: sbUser } } = await getSupabase().auth.getUser();
    await resolveAccount(user.id, sbUser ?? undefined);
  };

  /* ── Update profile ──────────────────────────────────────────── */
  const updateProfile = async (updates: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'avatar' | 'avatarUrl' | 'bio'>>) => {
    if (!user) return;
    if (!currentProfile) {
      const res = await fetch('/api/profile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id: user.id, fullName: updates.fullName ?? '',
          phone: updates.phone ?? user.phoneNumber ?? '', avatar: updates.avatar ?? '👤',
        }),
      });
      if (res.ok) setCurrentProfile(await res.json());
      else throw new Error('Profile create failed');
      return;
    }
    const res = await fetch(`/api/profile/${user.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(updates),
    });
    if (res.ok) setCurrentProfile(await res.json());
    else throw new Error('Profile update failed');
  };

  return (
    <AuthContext.Provider value={{
      user, loading, accountType, currentSupplier, currentProfile,
      signOut, refreshAccount, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

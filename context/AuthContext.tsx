'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User as FbUser } from 'firebase/auth';
import type { User as SbUser } from '@supabase/supabase-js';
import { firebaseAuth } from '@/lib/firebase';
import { getSupabase } from '@/lib/supabase';
import type { Supplier, UserProfile, AccountType } from '@/lib/types';

/* ── Unified user shape ──────────────────────────────────────────── */
export interface AuthUser {
  id:           string;
  uid:          string;
  phoneNumber:  string | null;
  displayName:  string | null;
  email:        string | null;
  authProvider: 'firebase' | 'supabase';
}

interface AuthContextValue {
  user:            AuthUser | null;
  loading:         boolean;
  accountType:     AccountType | null;
  currentSupplier: Supplier | null;
  currentProfile:  UserProfile | null;
  signOut:         () => Promise<void>;
  refreshAccount:  () => Promise<void>;
  updateProfile:   (data: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'avatar'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/* ── Mappers ─────────────────────────────────────────────────────── */
function toFirebaseUser(fb: FbUser): AuthUser {
  return {
    id: fb.uid, uid: fb.uid,
    phoneNumber: fb.phoneNumber,
    displayName: fb.displayName,
    email: fb.email,
    authProvider: 'firebase',
  };
}
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

  /**
   * Independent state for each provider. Whichever has a session wins,
   * Supabase preferred. We recompute the effective user whenever either
   * provider reports — this prevents one provider's "no session" from
   * wiping out the other's valid session (the refresh-logout bug).
   */
  const fbUserRef = useRef<AuthUser | null>(null);
  const sbUserRef = useRef<AuthUser | null>(null);
  const fbReady   = useRef(false);
  const sbReady   = useRef(false);
  const lastResolvedUid = useRef<string | null>(null);

  /* ── Look up Supabase profile / supplier by UID ──────────────── */
  async function resolveAccount(uid: string) {
    if (lastResolvedUid.current === uid && accountType) return; // already resolved
    lastResolvedUid.current = uid;
    try {
      const res  = await fetch(`/api/suppliers?authUserId=${uid}`);
      const data = await res.json();
      const sup  = Array.isArray(data) ? data[0] ?? null : null;
      if (sup) { setCurrentSupplier(sup); setCurrentProfile(null); setAccountType('business'); return; }
    } catch { /* ignore */ }
    try {
      const res  = await fetch(`/api/profile?userId=${uid}`);
      const data = await res.json();
      if (data?.id) { setCurrentProfile(data); setCurrentSupplier(null); setAccountType('user'); return; }
    } catch { /* ignore */ }
    setCurrentSupplier(null); setCurrentProfile(null); setAccountType(null);
  }

  /* ── Recompute the effective user from both providers ─────────── */
  function recompute() {
    // Supabase session takes priority, then Firebase
    const effective = sbUserRef.current ?? fbUserRef.current;

    setUser(prev => {
      // Avoid needless re-renders / re-resolves when nothing changed
      if (prev?.id === effective?.id && prev?.authProvider === effective?.authProvider) {
        return prev;
      }
      return effective;
    });

    if (effective) {
      resolveAccount(effective.id);
    } else {
      lastResolvedUid.current = null;
      setCurrentSupplier(null);
      setCurrentProfile(null);
      setAccountType(null);
    }

    // Only stop the loading spinner once BOTH providers have reported their
    // initial state — this is what keeps the user logged in across refresh.
    if (fbReady.current && sbReady.current) setLoading(false);
  }

  /* ── Auth listeners ──────────────────────────────────────────── */
  useEffect(() => {
    const sb = getSupabase();

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      sbUserRef.current = session?.user ? toSupabaseUser(session.user) : null;
      sbReady.current   = true;
      recompute();
    });

    const unsubFb = onAuthStateChanged(firebaseAuth, (fbUser) => {
      fbUserRef.current = fbUser ? toFirebaseUser(fbUser) : null;
      fbReady.current   = true;
      recompute();
    });

    // Safety: never let the UI hang on loading more than 5s
    const timeout = setTimeout(() => {
      fbReady.current = true;
      sbReady.current = true;
      setLoading(false);
    }, 5000);

    return () => {
      subscription.unsubscribe();
      unsubFb();
      clearTimeout(timeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Sign out ────────────────────────────────────────────────── */
  const signOut = async () => {
    const provider = user?.authProvider;
    // Clear local refs immediately so recompute doesn't restore the user
    fbUserRef.current = null;
    sbUserRef.current = null;
    lastResolvedUid.current = null;
    setUser(null); setCurrentSupplier(null); setCurrentProfile(null); setAccountType(null);
    try {
      if (provider === 'firebase') await fbSignOut(firebaseAuth);
      else                          await getSupabase().auth.signOut();
    } catch { /* ignore */ }
  };

  /* ── Refresh account data ────────────────────────────────────── */
  const refreshAccount = async () => {
    if (!user) return;
    lastResolvedUid.current = null; // force re-resolve
    await resolveAccount(user.id);
  };

  /* ── Update profile ──────────────────────────────────────────── */
  const updateProfile = async (updates: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'avatar'>>) => {
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
      return;
    }
    const res = await fetch(`/api/profile/${user.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(updates),
    });
    if (res.ok) setCurrentProfile(await res.json());
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

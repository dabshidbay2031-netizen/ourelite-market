'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(app);

/**
 * Force the auth session to persist in localStorage so the user STAYS
 * logged in across page reloads and browser restarts. Without this,
 * some browsers fall back to in-memory persistence (lost on refresh).
 */
if (typeof window !== 'undefined') {
  setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {
    /* persistence may already be set, or storage is blocked — non-fatal */
  });
}

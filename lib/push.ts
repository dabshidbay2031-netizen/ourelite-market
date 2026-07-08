'use client';

import { authHeaders } from '@/lib/clientAuth';

/**
 * Browser-side Web Push plumbing: service-worker registration, permission,
 * subscribe/unsubscribe. PushManager (component) auto-refreshes an existing
 * subscription on login; NotificationsView exposes the opt-in button.
 */

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Ask for permission (if needed) and register this browser for pushes,
 * tied to the signed-in user. Returns true when subscribed.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await ensureServiceWorker();
  if (!reg) return false;

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid).buffer as ArrayBuffer,
    });
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(sub.toJSON()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Silently re-sync an ALREADY-granted subscription (no permission prompt). */
export async function refreshPushSubscription(): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  const reg = await ensureServiceWorker();
  if (!reg) return;
  try {
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { await subscribeToPush(); return; }
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(sub.toJSON()),
    });
  } catch { /* best-effort */ }
}

/** Unsubscribe this browser and delete the server row. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ endpoint }),
    });
  } catch { /* best-effort */ }
}

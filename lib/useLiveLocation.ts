'use client';

import { useEffect, useState } from 'react';

export interface LiveLocation { lat: number; lng: number; }
export type LocationStatus = 'idle' | 'locating' | 'live' | 'denied' | 'unavailable';

/**
 * Live device location via `watchPosition` — keeps updating as the user
 * moves, so distance ranking stays current without re-asking. The watch is
 * only started while `enabled` (e.g. while the user is actually searching),
 * so the permission prompt never fires on a page the user just opened.
 */
export function useLiveLocation(enabled: boolean) {
  const [pos, setPos]       = useState<LiveLocation | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus(s => (s === 'live' ? s : 'locating'));
    const id = navigator.geolocation.watchPosition(
      p => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setStatus('live');
      },
      err => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { pos, status };
}

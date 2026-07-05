'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/* ──────────────────────────────────────────────────────────────
   StoreMap — shows the store's location on an OpenStreetMap map
   (via Leaflet, loaded from CDN — no API key needed) and draws a
   driving route from the viewer's current GPS position to the store
   using the public OSRM routing service. Falls back to a straight
   line if routing is unavailable, and always offers an
   "Open in Google Maps" directions link.
─────────────────────────────────────────────────────────────── */

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type L = any;

interface Props {
  lat:        number;
  lng:        number;
  storeName:  string;
  storeIcon?: string;
}

/** Load Leaflet's CSS + JS once, resolving when window.L is ready. */
function loadLeaflet(): Promise<L> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);

  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    let script = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (script && w.L) { resolve(w.L); return; }
    if (!script) {
      script = document.createElement('script');
      script.src = LEAFLET_JS;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve(w.L));
    script.addEventListener('error', () => reject(new Error('Failed to load map library')));
  });
}

/** Haversine distance in km between two coordinates. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default function StoreMap({ lat, lng, storeName, storeIcon = '🏪' }: Props) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef     = useRef<L>(null);
  const routeRef   = useRef<L>(null);   // current route layer (line + user marker)

  const [ready,   setReady]   = useState(false);
  const [error,   setError]   = useState('');
  const [routing, setRouting] = useState(false);
  const [info,    setInfo]    = useState<{ km: number; mins: number | null; approx: boolean } | null>(null);

  /* ── Init the map with the store marker ─── */
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L: L) => {
        if (cancelled || !mapHostRef.current || mapRef.current) return;
        const map = L.map(mapHostRef.current, { scrollWheelZoom: false, attributionControl: true })
          .setView([lat, lng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        }).addTo(map);

        // storeIcon is an emoji OR an uploaded logo URL.
        const pinInner = /^https?:\/\//i.test(storeIcon)
          ? `<img src="${storeIcon}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`
          : storeIcon;
        const storeMarker = L.divIcon({
          className: 'store-map-pin',
          html: `<div class="store-map-pin-inner">${pinInner}</div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 38],
        });
        L.marker([lat, lng], { icon: storeMarker }).addTo(map)
          .bindPopup(`<strong>${storeName}</strong>`);

        mapRef.current = map;
        setReady(true);
      })
      .catch(() => setError('Could not load the map.'));

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  /* ── Draw route from the viewer's current location ─── */
  const showRoute = useCallback(() => {
    setError('');
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return; }
    setRouting(true);

    navigator.geolocation.getCurrentPosition(
      async pos => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        const map = mapRef.current;
        if (!L || !map) { setRouting(false); return; }

        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        // Clear any previous route
        if (routeRef.current) { map.removeLayer(routeRef.current); routeRef.current = null; }
        const group = L.layerGroup().addTo(map);
        routeRef.current = group;

        // "You" marker
        const youIcon = L.divIcon({
          className: 'store-map-pin you',
          html: `<div class="store-map-pin-inner you">📍</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });
        L.marker([userLat, userLng], { icon: youIcon }).addTo(group).bindPopup('You are here');

        let drewRealRoute = false;
        try {
          // OSRM expects lng,lat order
          const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${lng},${lat}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();
          const route = data?.routes?.[0];
          if (route?.geometry?.coordinates?.length) {
            const latlngs = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
            L.polyline(latlngs, { color: '#4F46E5', weight: 5, opacity: 0.85 }).addTo(group);
            map.fitBounds(L.latLngBounds(latlngs).pad(0.15));
            setInfo({ km: route.distance / 1000, mins: Math.round(route.duration / 60), approx: false });
            drewRealRoute = true;
          }
        } catch { /* fall through to straight line */ }

        if (!drewRealRoute) {
          // Straight-line fallback
          const line: [number, number][] = [[userLat, userLng], [lat, lng]];
          L.polyline(line, { color: '#4F46E5', weight: 4, opacity: 0.7, dashArray: '8 8' }).addTo(group);
          map.fitBounds(L.latLngBounds(line).pad(0.25));
          setInfo({ km: haversineKm(userLat, userLng, lat, lng), mins: null, approx: true });
        }
        setRouting(false);
      },
      err => {
        setRouting(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable it to see your route.'
            : 'Could not get your location. Try again.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [lat, lng]);

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <div className="store-map-section">
      <div className="store-map-head">
        <span className="store-map-title">📍 Store Location & Route</span>
      </div>

      <div className="store-map-frame">
        <div ref={mapHostRef} className="store-map-canvas" />
        {!ready && !error && (
          <div className="store-map-overlay"><span className="spinner" /> Loading map…</div>
        )}
        {error && <div className="store-map-overlay error">{error}</div>}
      </div>

      {info && (
        <div className="store-map-info">
          <span className="store-map-dist">
            🚗 {info.km.toFixed(1)} km{info.approx ? ' (straight line)' : ''}
          </span>
          {info.mins != null && <span className="store-map-eta">· ~{info.mins} min drive</span>}
        </div>
      )}

      <div className="store-map-actions">
        <button className="btn btn-outline btn-sm" onClick={showRoute} disabled={routing || !ready}>
          {routing ? 'Locating…' : '🧭 Route from my location'}
        </button>
        <a className="btn btn-ghost btn-sm" href={directionsUrl} target="_blank" rel="noopener noreferrer">
          Open in Google Maps
        </a>
      </div>
    </div>
  );
}

/**
 * Coordinate → district recognition for Mogadishu (Banaadir region).
 *
 * Each district has a center point; a coordinate is recognised as belonging
 * to the NEAREST district center (a Voronoi partition — more reliable than
 * hand-drawn rectangles, which overlap or leave gaps between districts).
 * Anything farther than MAX_KM from every center is outside the city and
 * gets no district label rather than a wrong one.
 *
 * Used to turn a store's raw GPS (latitude/longitude) into a label a
 * customer instantly understands: "📍 Hodan" instead of 2.0530, 45.3070.
 */

import { distanceKm } from '@/lib/geo';

export interface District {
  name: string;
  lat:  number;
  lng:  number;
}

/** The 17 districts of Banaadir with approximate center coordinates. */
export const MOGADISHU_DISTRICTS: District[] = [
  { name: 'Abdiaziz',    lat: 2.0620, lng: 45.3580 },
  { name: 'Bondhere',    lat: 2.0530, lng: 45.3440 },
  { name: 'Daynile',     lat: 2.0830, lng: 45.2860 },
  { name: 'Dharkenley',  lat: 2.0150, lng: 45.2790 },
  { name: 'Hamar Jajab', lat: 2.0320, lng: 45.3350 },
  { name: 'Hamar Weyne', lat: 2.0361, lng: 45.3419 },
  { name: 'Hodan',       lat: 2.0530, lng: 45.3070 },
  { name: 'Howl Wadag',  lat: 2.0480, lng: 45.3210 },
  { name: 'Heliwa',      lat: 2.0950, lng: 45.3450 },
  { name: 'Karan',       lat: 2.0800, lng: 45.3600 },
  { name: 'Kaxda',       lat: 2.0500, lng: 45.2400 },
  { name: 'Garasbaley',  lat: 2.0800, lng: 45.2500 },
  { name: 'Shangani',    lat: 2.0400, lng: 45.3450 },
  { name: 'Shibis',      lat: 2.0500, lng: 45.3480 },
  { name: 'Waberi',      lat: 2.0290, lng: 45.3180 },
  { name: 'Wadajir',     lat: 2.0207, lng: 45.2940 },
  { name: 'Wardhigley',  lat: 2.0550, lng: 45.3300 },
  { name: 'Yaqshid',     lat: 2.0700, lng: 45.3500 },
];

/** Beyond this distance from every district center the point isn't in Mogadishu. */
const MAX_KM = 15;

/**
 * Recognise which district a coordinate falls in.
 * Returns null for missing coordinates or points outside the city.
 */
export function districtFor(
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let best: District | null = null;
  let bestKm = Infinity;
  for (const d of MOGADISHU_DISTRICTS) {
    const km = distanceKm(lat, lng, d.lat, d.lng);
    if (km < bestKm) { bestKm = km; best = d; }
  }
  return best && bestKm <= MAX_KM ? best.name : null;
}

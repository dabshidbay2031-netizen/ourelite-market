/** Distance helpers shared by the nearby-store search (client + server). */

/** Great-circle distance in km between two coordinates (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** "350 m" under 1 km, "2.4 km" under 10, "23 km" beyond. */
export function formatDistance(km: number): string {
  if (km < 1)  return `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

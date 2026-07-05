/**
 * Google Maps directions deep link to a store's coordinates.
 * Opens turn-by-turn navigation TO the destination from the user's location.
 * e.g. https://www.google.com/maps/dir/?api=1&destination=2.0469,45.3182
 */
export function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
